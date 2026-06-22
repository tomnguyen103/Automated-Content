import "server-only";

import type { ScheduledJob } from "@/db/schema";
import { runContentAgent, type ContentAgentResult } from "@/lib/agents/langchain/content-agent";
import { createAgentStorage } from "@/lib/agents/langchain/storage";
import { contentAgentInputSchema, type ContentPack } from "@/lib/agents/schemas/content-pack";
import type { PlatformVariant, SocialPlatform } from "@/lib/agents/schemas/platform-variant";
import type { AgentMission, AgentPolicyEvent, AgentProfile } from "@/lib/agents/schemas/orchestration";
import type { MissionTaskExecutionContext, MissionTaskExecutor } from "@/lib/agents/orchestration/runner";
import {
  createPolicyEventFromDecision,
  evaluateAgentPolicy,
  type AgentPolicyDecision
} from "@/lib/agents/orchestration/policy";
import { emitAgentOrchestrationEvent } from "@/lib/agents/orchestration/events";
import { getWorkspaceAnalyticsSnapshot, type AnalyticsSnapshot } from "@/lib/analytics/metrics";
import { consumeUsageForLimit } from "@/lib/billing/usage";
import { getProviderAdapter } from "@/lib/providers/registry";
import { defaultProviderByPlatform } from "@/lib/providers/platform-compatibility";
import { providerKeys, type ProviderKey } from "@/lib/providers/types";
import { runCommentReplyWorkflow, type CommentReplyWorkflowResult } from "@/lib/agents/graphs/comment-reply-workflow";
import { createReplyRepository } from "@/lib/replies/repository";
import {
  allowLocalPreviewAutoReplyUsage,
  enforceAutoReplyUsage,
  recordAutoReplyUsage,
  recordLocalPreviewAutoReplyUsage
} from "@/lib/replies/usage";
import {
  createScheduledPost,
  createSchedulerRepository,
  type CreateScheduledPostResult
} from "@/lib/scheduler/create-scheduled-post";

type SchedulePostRunner = typeof createScheduledPost;
type ContentRunner = typeof runContentAgent;
type ReplyRunner = typeof runCommentReplyWorkflow;
type AnalyticsSnapshotReader = typeof getWorkspaceAnalyticsSnapshot;

export type AutonomousMissionTaskExecutorOptions = {
  allowMemoryFallback?: boolean;
  runContent?: ContentRunner;
  runReply?: ReplyRunner;
  schedulePost?: SchedulePostRunner;
  getAnalyticsSnapshot?: AnalyticsSnapshotReader;
};

type ScheduledVariant = {
  platformVariantId: string;
  platform?: SocialPlatform;
  provider: ProviderKey;
  connectedAccountId?: string | null;
  scheduledFor: Date;
  policy?: AgentPolicyDecision;
};

const providerKeySet = new Set<string>(providerKeys);

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];

  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readNumber(record: Record<string, unknown>, key: string) {
  const value = record[key];

  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readStringArray(record: Record<string, unknown>, key: string) {
  const value = record[key];

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
}

function readStringMap(record: Record<string, unknown>, key: string) {
  const value = record[key];

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0
    )
  );
}

function toProviderKey(value: string | undefined) {
  return value && providerKeySet.has(value) ? (value as ProviderKey) : undefined;
}

function resolveProvider(inputs: Record<string, unknown>, platform?: SocialPlatform) {
  const providerByPlatform = readStringMap(inputs, "providerByPlatform");
  const platformProvider = platform ? toProviderKey(providerByPlatform[platform]) : undefined;
  const requestedProvider = toProviderKey(readString(inputs, "provider"));

  return platformProvider ?? requestedProvider ?? (platform ? defaultProviderByPlatform[platform] : "mock");
}

function resolveConnectedAccountId(inputs: Record<string, unknown>, provider: ProviderKey, platform?: SocialPlatform) {
  const accountByProvider = readStringMap(inputs, "connectedAccountIdsByProvider");
  const accountByPlatform = readStringMap(inputs, "connectedAccountIdsByPlatform");

  return (platform ? accountByPlatform[platform] : undefined) ?? accountByProvider[provider] ?? readString(inputs, "connectedAccountId") ?? null;
}

function resolveUserId(mission: AgentMission) {
  return mission.createdByUserId ?? "system";
}

function buildContentInput(mission: AgentMission) {
  const platform = readString(mission.inputs, "platform");
  const platforms = readStringArray(mission.inputs, "platforms");

  return contentAgentInputSchema.parse({
    topic: readString(mission.inputs, "topic") ?? mission.title,
    audience: readString(mission.inputs, "audience"),
    tone: readString(mission.inputs, "tone"),
    goal: readString(mission.inputs, "goal") ?? mission.objective,
    sources: readStringArray(mission.inputs, "sources"),
    platforms: platforms.length > 0 ? platforms : platform ? [platform] : undefined,
    timezone: readString(mission.inputs, "timezone")
  });
}

function coerceFutureDate(value: unknown, now: Date, offsetMinutes = 5) {
  const parsed = typeof value === "string" || value instanceof Date ? new Date(value) : null;

  if (parsed && !Number.isNaN(parsed.getTime()) && parsed > now) {
    return parsed;
  }

  return new Date(now.getTime() + offsetMinutes * 60_000);
}

function findLatestContentOutput(tasks: Array<{ output?: Record<string, unknown>; createdAt: string }>) {
  const sorted = [...tasks].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  for (const task of sorted) {
    const output = task.output;

    if (!output || typeof output !== "object") {
      continue;
    }

    if ("contentPack" in output || "draft" in output || "generatedVariants" in output) {
      return output;
    }
  }

  return null;
}

function readGeneratedContentPack(output: Record<string, unknown> | null): ContentPack | null {
  const candidate = output?.contentPack;

  return candidate && typeof candidate === "object" ? (candidate as ContentPack) : null;
}

function createLocalEnqueue(now: () => Date) {
  return async ({ scheduledJob }: { scheduledJob: ScheduledJob }) => ({
    queueJobId: `local_agent_${scheduledJob.id}`,
    delayMs: Math.max(0, scheduledJob.scheduledFor.getTime() - now().getTime())
  });
}

async function recordExecutorPolicyDecision({
  context,
  decision,
  profile
}: {
  context: MissionTaskExecutionContext;
  decision: AgentPolicyDecision;
  profile?: AgentProfile | null;
}): Promise<AgentPolicyEvent> {
  const event = createPolicyEventFromDecision({
    decision,
    mission: context.mission,
    now: context.now(),
    profile: profile ?? context.profile,
    taskRunId: context.taskRun.id,
    workspaceId: context.mission.workspaceId
  });

  await context.repositories.policyEvents.record(event);
  emitAgentOrchestrationEvent("agent.policy.evaluated", {
    action: decision.action,
    allowed: decision.allowed,
    missionId: context.mission.id,
    policyKey: decision.policyKey,
    profileId: (profile ?? context.profile)?.id,
    severity: decision.severity,
    taskRunId: context.taskRun.id,
    workspaceId: context.mission.workspaceId
  });

  return event;
}

function buildResearchOutput(mission: AgentMission) {
  const sources = readStringArray(mission.inputs, "sources");
  const topic = readString(mission.inputs, "topic") ?? mission.title;

  return {
    summary: sources.length > 0
      ? `Collected ${sources.length} source notes for ${topic}.`
      : `Prepared a source-light research brief for ${topic}.`,
    sourceCount: sources.length,
    sources,
    topic
  };
}

function buildStrategyOutput(mission: AgentMission) {
  return {
    summary: `Planned autonomous handoff for ${mission.title}.`,
    objective: mission.objective,
    priority: mission.priority,
    nextActions: ["content.generate", "content.schedule", "content.publish"].filter((action) =>
      mission.policy.allowedActions.length === 0 || mission.policy.allowedActions.includes(action as never)
    )
  };
}

async function executeContentGeneration(
  context: MissionTaskExecutionContext,
  {
    allowMemoryFallback,
    runContent
  }: {
    allowMemoryFallback: boolean;
    runContent: ContentRunner;
  }
) {
  const input = buildContentInput(context.mission);

  await consumeUsageForLimit({
    workspaceId: context.mission.workspaceId,
    key: "aiGenerationsPerMonth",
    sourceId: `${context.mission.id}:${context.taskRun.id}:content`,
    metadata: {
      agentMissionId: context.mission.id,
      agentTaskRunId: context.taskRun.id,
      platforms: input.platforms,
      userId: resolveUserId(context.mission)
    },
    skip: allowMemoryFallback
  });

  const result: ContentAgentResult = await runContent(input, {
    userId: resolveUserId(context.mission),
    workspaceId: context.mission.workspaceId,
    storage: createAgentStorage({ allowMemoryFallback }),
    now: context.now
  });

  return {
    summary: `Generated ${result.contentPack.variants.length} platform variants and saved draft ${result.draft.draftId}.`,
    agentRunId: result.run.id,
    draft: result.draft,
    contentPack: result.contentPack,
    generatedVariants: result.contentPack.variants.map((variant) => ({
      id: variant.id,
      platform: variant.platform,
      policyStatus: variant.policyStatus,
      characterCount: variant.characterCount
    }))
  };
}

function buildSchedulesFromContentPack({
  contentPack,
  inputs,
  now
}: {
  contentPack: ContentPack;
  inputs: Record<string, unknown>;
  now: Date;
}) {
  return contentPack.variants.map((variant, index): ScheduledVariant => {
    const suggestion = contentPack.scheduleSuggestions.find((candidate) => candidate.platform === variant.platform);
    const provider = resolveProvider(inputs, variant.platform);

    return {
      platformVariantId: variant.id,
      platform: variant.platform,
      provider,
      connectedAccountId: resolveConnectedAccountId(inputs, provider, variant.platform),
      scheduledFor: coerceFutureDate(readString(inputs, "scheduledFor") ?? suggestion?.scheduledFor, now, 5 + index)
    };
  });
}

function buildSchedulesFromInputs({
  inputs,
  now
}: {
  inputs: Record<string, unknown>;
  now: Date;
}): ScheduledVariant[] {
  const variantIds = readStringArray(inputs, "platformVariantIds");
  const platforms = readStringArray(inputs, "platforms") as SocialPlatform[];
  const platform = readString(inputs, "platform") as SocialPlatform | undefined;

  return variantIds.map((platformVariantId, index) => {
    const resolvedPlatform = platforms[index] ?? platform;
    const provider = resolveProvider(inputs, resolvedPlatform);

    return {
      platformVariantId,
      platform: resolvedPlatform,
      provider,
      connectedAccountId: resolveConnectedAccountId(inputs, provider, resolvedPlatform),
      scheduledFor: coerceFutureDate(readString(inputs, "scheduledFor"), now, 5 + index)
    };
  });
}

async function scheduleOneVariant({
  allowMemoryFallback,
  context,
  schedulePost,
  scheduledVariant,
  variant
}: {
  allowMemoryFallback: boolean;
  context: MissionTaskExecutionContext;
  schedulePost: SchedulePostRunner;
  scheduledVariant: ScheduledVariant;
  variant?: PlatformVariant;
}): Promise<{ result?: CreateScheduledPostResult; skipped?: AgentPolicyDecision }> {
  const decision = evaluateAgentPolicy({
    action: context.task.action === "content.schedule" ? "content.schedule" : "content.publish",
    mission: context.mission,
    profile: context.profile,
    toolScope: context.task.toolScope,
    provider: scheduledVariant.provider,
    platform: scheduledVariant.platform,
    connectedAccountId: scheduledVariant.connectedAccountId,
    confidence: scheduledVariant.policy?.details.confidence as number | undefined,
    contentText: variant ? `${variant.hook}\n${variant.body}\n${variant.cta}` : readString(context.mission.inputs, "contentText") ?? context.mission.brief,
    now: context.now()
  });

  await recordExecutorPolicyDecision({ context, decision });

  if (!decision.allowed) {
    return { skipped: decision };
  }

  await consumeUsageForLimit({
    workspaceId: context.mission.workspaceId,
    key: "scheduledPostsPerDay",
    sourceId: `${context.mission.id}:${scheduledVariant.platformVariantId}:schedule`,
    metadata: {
      agentMissionId: context.mission.id,
      agentTaskRunId: context.taskRun.id,
      platformVariantId: scheduledVariant.platformVariantId,
      provider: scheduledVariant.provider
    },
    skip: allowMemoryFallback
  });

  const result = await schedulePost({
    input: {
      workspaceId: context.mission.workspaceId,
      platformVariantId: scheduledVariant.platformVariantId,
      provider: scheduledVariant.provider,
      connectedAccountId: scheduledVariant.connectedAccountId ?? null,
      scheduledFor: scheduledVariant.scheduledFor,
      metadata: {
        agentMissionId: context.mission.id,
        agentTaskRunId: context.taskRun.id,
        agentProfileId: context.profile.id,
        missionType: context.mission.missionType,
        autonomous: true
      }
    },
    repository: createSchedulerRepository({ allowMemoryFallback }),
    ...(allowMemoryFallback ? { enqueue: createLocalEnqueue(context.now) } : {})
  });

  return { result };
}

async function executeContentScheduling(
  context: MissionTaskExecutionContext,
  {
    allowMemoryFallback,
    schedulePost
  }: {
    allowMemoryFallback: boolean;
    schedulePost: SchedulePostRunner;
  }
) {
  const priorTasks = await context.repositories.taskRuns.listForMission({
    workspaceId: context.mission.workspaceId,
    missionId: context.mission.id
  });
  const latestContentOutput = findLatestContentOutput(priorTasks);
  const contentPack = readGeneratedContentPack(latestContentOutput);
  const schedules = contentPack
    ? buildSchedulesFromContentPack({
        contentPack,
        inputs: context.mission.inputs,
        now: context.now()
      })
    : buildSchedulesFromInputs({
        inputs: context.mission.inputs,
        now: context.now()
      });

  if (schedules.length === 0) {
    return {
      summary: "No generated content or platformVariantIds were available for autonomous scheduling.",
      scheduledJobs: [],
      skipped: []
    };
  }

  const scheduledJobs: Array<Record<string, unknown>> = [];
  const skipped: Array<Record<string, unknown>> = [];

  for (const scheduledVariant of schedules) {
    const variant = contentPack?.variants.find((candidate) => candidate.id === scheduledVariant.platformVariantId);
    const { result, skipped: skippedDecision } = await scheduleOneVariant({
      allowMemoryFallback,
      context,
      schedulePost,
      scheduledVariant,
      variant
    });

    if (skippedDecision) {
      skipped.push({
        platformVariantId: scheduledVariant.platformVariantId,
        policyKey: skippedDecision.policyKey,
        message: skippedDecision.message
      });
      continue;
    }

    if (result) {
      scheduledJobs.push({
        id: result.scheduledJob.id,
        platformVariantId: result.scheduledJob.platformVariantId,
        provider: result.scheduledJob.provider,
        scheduledFor: result.scheduledJob.scheduledFor.toISOString(),
        enqueueStatus: result.enqueue.status
      });
    }
  }

  return {
    summary: `Scheduled ${scheduledJobs.length} autonomous variants.`,
    scheduledJobs,
    skipped
  };
}

async function executeEngagement(
  context: MissionTaskExecutionContext,
  {
    allowMemoryFallback,
    runReply
  }: {
    allowMemoryFallback: boolean;
    runReply: ReplyRunner;
  }
) {
  const repository = createReplyRepository({ allowMemoryFallback });
  const storage = createAgentStorage({ allowMemoryFallback });
  const state = await repository.getConsoleState(context.mission.workspaceId);
  const rules = state.rules;
  const recentAttempts = await repository.listRecentAttempts(context.mission.workspaceId);
  const maxComments = Math.min(
    readNumber(context.mission.inputs, "maxComments") ?? context.policy.policy.dailyActionCap,
    context.policy.policy.dailyActionCap
  );
  const processed: Array<Record<string, unknown>> = [];
  const blocked: Array<Record<string, unknown>> = [];
  const failed: Array<Record<string, unknown>> = [];

  for (const comment of state.inbox.filter((candidate) => candidate.status === "new").slice(0, maxComments)) {
    const decision = evaluateAgentPolicy({
      action: "reply.send",
      mission: context.mission,
      profile: context.profile,
      toolScope: context.task.toolScope,
      provider: comment.provider,
      platform: comment.platform,
      connectedAccountId: comment.connectedAccountId,
      contentText: comment.text,
      now: context.now()
    });

    await recordExecutorPolicyDecision({ context, decision });

    if (!decision.allowed) {
      blocked.push({
        commentId: comment.id,
        policyKey: decision.policyKey,
        message: decision.message
      });
      continue;
    }

    try {
      const result: CommentReplyWorkflowResult = await runReply(
        {
          workspaceId: context.mission.workspaceId,
          comment: {
            id: comment.id,
            provider: comment.provider,
            providerCommentId: comment.providerCommentId,
            providerPostId: comment.providerPostId,
            connectedAccountId: comment.connectedAccountId,
            platform: comment.platform,
            authorName: comment.authorName,
            authorProviderId: comment.authorProviderId,
            text: comment.text,
            receivedAt: comment.receivedAt
          },
          postContext: {
            postId: comment.providerPostId,
            title: comment.postTitle,
            body: comment.postBody
          },
          brandVoice: readString(context.mission.inputs, "brandVoice") ?? "helpful, concise, and safe",
          rules,
          recentAttempts
        },
        {
          userId: resolveUserId(context.mission),
          workspaceId: context.mission.workspaceId,
          storage,
          repository,
          usageEnforcer: allowMemoryFallback ? allowLocalPreviewAutoReplyUsage : enforceAutoReplyUsage,
          usageRecorder: allowMemoryFallback ? recordLocalPreviewAutoReplyUsage : recordAutoReplyUsage,
          provider: getProviderAdapter(comment.provider),
          autonomous: {
            enabled: true,
            confidenceThreshold: decision.policy.confidenceThreshold
          },
          now: context.now
        }
      );

      processed.push({
        commentId: comment.id,
        status: result.status,
        action: result.reply.action,
        confidence: result.reply.confidence,
        attemptId: result.attempt.id,
        providerReplyId: result.providerReply?.providerReplyId
      });

      if (result.attempt.ruleId) {
        recentAttempts.push({
          ruleId: result.attempt.ruleId,
          attemptedAt: result.attempt.sentAt ?? result.attempt.createdAt,
          status: result.attempt.status
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown autonomous reply error.";
      failed.push({
        commentId: comment.id,
        error: message
      });
    }
  }

  return {
    summary: `Processed ${processed.length} comments, blocked ${blocked.length}, failed ${failed.length}.`,
    processedComments: processed,
    blockedComments: blocked,
    failedComments: failed
  };
}

function buildReportSummary({
  mission,
  missions,
  snapshot
}: {
  mission: AgentMission;
  missions: AgentMission[];
  snapshot: AnalyticsSnapshot;
}) {
  const activeMissions = missions.filter((candidate) => ["queued", "running", "paused"].includes(candidate.status));
  const failedMissions = missions.filter((candidate) => candidate.status === "failed");
  const publishOutcomes = snapshot.posting.published + snapshot.posting.failed;
  const publishHealth = publishOutcomes > 0 ? Math.round((snapshot.posting.published / publishOutcomes) * 100) : null;

  return {
    generatedAt: snapshot.generatedAt,
    missionId: mission.id,
    missionTitle: mission.title,
    operatingSummary: {
      activeMissions: activeMissions.length,
      failedMissions: failedMissions.length,
      scheduledPosts: snapshot.posting.scheduled + snapshot.posting.queued,
      publishHealth,
      repliesSent: snapshot.replies.sent,
      repliesAwaitingApproval: snapshot.replies.awaitingApproval,
      agentRuns: snapshot.agents.total,
      agentFailures: snapshot.failures.agents
    },
    topPlatforms: snapshot.platformBreakdown.slice(0, 5),
    recommendations: [
      snapshot.failures.total > 0 ? "Review failed publish, reply, and agent rows before raising autonomy caps." : null,
      snapshot.replies.awaitingApproval > 0 ? "Convert recurring approval reasons into safer reply rules or blocked phrases." : null,
      snapshot.posting.queued + snapshot.posting.scheduled === 0 ? "Create a content_pipeline mission for the next publishing window." : null,
      activeMissions.some((candidate) => candidate.status === "paused") ? "Inspect paused missions before resuming provider-side actions." : null
    ].filter((recommendation): recommendation is string => Boolean(recommendation))
  };
}

async function executeReport(
  context: MissionTaskExecutionContext,
  {
    allowMemoryFallback,
    getAnalyticsSnapshot
  }: {
    allowMemoryFallback: boolean;
    getAnalyticsSnapshot: AnalyticsSnapshotReader;
  }
) {
  const [snapshot, missions, policyEvents] = await Promise.all([
    getAnalyticsSnapshot({
      workspaceId: context.mission.workspaceId,
      isLocalPreview: allowMemoryFallback,
      now: context.now()
    }),
    context.repositories.missions.list(context.mission.workspaceId),
    context.repositories.policyEvents.listForMission({
      workspaceId: context.mission.workspaceId,
      missionId: context.mission.id
    })
  ]);
  const report = buildReportSummary({ mission: context.mission, missions, snapshot });

  return {
    summary: `Compiled report with ${report.recommendations.length} next recommendations.`,
    report,
    policyEvents: policyEvents.slice(0, 20).map((event) => ({
      id: event.id,
      severity: event.severity,
      action: event.action,
      policyKey: event.policyKey,
      message: event.message,
      occurredAt: event.occurredAt
    }))
  };
}

export function createAutonomousMissionTaskExecutor({
  allowMemoryFallback = false,
  getAnalyticsSnapshot = getWorkspaceAnalyticsSnapshot,
  runContent = runContentAgent,
  runReply = runCommentReplyWorkflow,
  schedulePost = createScheduledPost
}: AutonomousMissionTaskExecutorOptions = {}): MissionTaskExecutor {
  return async (context) => {
    if (context.task.action === "research.collect") {
      return buildResearchOutput(context.mission);
    }

    if (context.task.action === "task.execute") {
      return buildStrategyOutput(context.mission);
    }

    if (context.task.action === "content.generate") {
      return executeContentGeneration(context, { allowMemoryFallback, runContent });
    }

    if (context.task.action === "content.schedule" || context.task.action === "content.publish") {
      return executeContentScheduling(context, { allowMemoryFallback, schedulePost });
    }

    if (context.task.action === "reply.send") {
      return executeEngagement(context, { allowMemoryFallback, runReply });
    }

    if (context.task.action === "report.generate") {
      return executeReport(context, { allowMemoryFallback, getAnalyticsSnapshot });
    }

    return {
      summary: `${context.profile.name} completed ${context.task.taskName}.`
    };
  };
}
