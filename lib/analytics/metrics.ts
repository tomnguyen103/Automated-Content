import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  agentRuns,
  commentEvents,
  platformVariants,
  publishAttempts,
  replyAttempts,
  scheduledJobs,
  usageLedger
} from "@/db/schema";
import { isDatabaseConfigured } from "@/lib/env";

export type AnalyticsPlatformKey =
  | "linkedin"
  | "x"
  | "instagram"
  | "facebook"
  | "tiktok"
  | "threads"
  | "mock"
  | "meta"
  | "slack"
  | "discord";

export type PostingMetricRow = {
  id: string;
  platform: AnalyticsPlatformKey;
  provider: string;
  status: "scheduled" | "queued" | "publishing" | "published" | "failed" | "canceled";
  scheduledFor: Date;
  publishedAt?: Date | null;
  failedAt?: Date | null;
  createdAt: Date;
};

export type PublishAttemptMetricRow = {
  id: string;
  provider: string;
  status: "queued" | "publishing" | "succeeded" | "failed";
  errorCode?: string | null;
  createdAt: Date;
  completedAt?: Date | null;
};

export type CommentMetricRow = {
  id: string;
  platform: AnalyticsPlatformKey;
  status: "new" | "matched" | "awaiting_approval" | "replied" | "ignored" | "failed";
  receivedAt: Date;
};

export type ReplyAttemptMetricRow = {
  id: string;
  provider: string;
  platform: AnalyticsPlatformKey;
  status: "approved" | "awaiting_approval" | "sent" | "failed" | "skipped";
  error?: string | null;
  createdAt: Date;
  sentAt?: Date | null;
};

export type UsageMetricRow = {
  id: string;
  type: "ai_generation" | "scheduled_post" | "publish_attempt" | "media_transform" | "auto_reply";
  quantity: number;
  occurredAt: Date;
};

export type AgentRunMetricRow = {
  id: string;
  traceId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  provider: "openai" | "gemini";
  model: string;
  toolCalls: Array<Record<string, unknown>>;
  error?: string | null;
  startedAt: Date;
  completedAt?: Date | null;
};

export type AnalyticsAggregationInput = {
  posts: PostingMetricRow[];
  publishAttempts: PublishAttemptMetricRow[];
  comments: CommentMetricRow[];
  replies: ReplyAttemptMetricRow[];
  usage: UsageMetricRow[];
  agentRuns: AgentRunMetricRow[];
  now?: Date;
};

export type AnalyticsStat = {
  value: number;
  label: string;
  detail: string;
};

export type PlatformBreakdownItem = {
  platform: string;
  posts: number;
  published: number;
  comments: number;
  replies: number;
  failures: number;
};

export type UsageBreakdownItem = {
  type: UsageMetricRow["type"];
  label: string;
  quantity: number;
};

export type UsageChartPoint = {
  date: string;
  label: string;
  quantity: number;
};

export type AgentRunSummary = {
  id: string;
  traceId: string;
  status: AgentRunMetricRow["status"];
  provider: AgentRunMetricRow["provider"];
  model: string;
  toolCallCount: number;
  durationMs: number | null;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
};

export type AnalyticsSnapshot = {
  generatedAt: string;
  posting: {
    total: number;
    scheduled: number;
    queued: number;
    publishing: number;
    published: number;
    failed: number;
    canceled: number;
  };
  failures: {
    total: number;
    publishing: number;
    replies: number;
    agents: number;
  };
  replies: {
    comments: number;
    matched: number;
    awaitingApproval: number;
    sent: number;
    failed: number;
  };
  usage: {
    totalQuantity: number;
    byType: UsageBreakdownItem[];
    daily: UsageChartPoint[];
  };
  agents: {
    total: number;
    running: number;
    succeeded: number;
    failed: number;
    averageToolCalls: number;
    recent: AgentRunSummary[];
  };
  platformBreakdown: PlatformBreakdownItem[];
};

const usageTypeLabels: Record<UsageMetricRow["type"], string> = {
  ai_generation: "AI generations",
  scheduled_post: "Scheduled posts",
  publish_attempt: "Publish attempts",
  media_transform: "Media transforms",
  auto_reply: "Auto replies"
};

const platformLabels: Record<AnalyticsPlatformKey, string> = {
  linkedin: "LinkedIn",
  x: "X",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  threads: "Threads",
  mock: "Mock",
  meta: "Meta",
  slack: "Slack",
  discord: "Discord"
};

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDateLabel(key: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(new Date(`${key}T00:00:00.000Z`));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function createEmptyPlatformItem(platform: AnalyticsPlatformKey): PlatformBreakdownItem {
  return {
    platform: platformLabels[platform] ?? platform,
    posts: 0,
    published: 0,
    comments: 0,
    replies: 0,
    failures: 0
  };
}

function getPlatformItem(
  map: Map<AnalyticsPlatformKey, PlatformBreakdownItem>,
  platform: AnalyticsPlatformKey
) {
  const existing = map.get(platform);

  if (existing) {
    return existing;
  }

  const item = createEmptyPlatformItem(platform);
  map.set(platform, item);
  return item;
}

function countByStatus<T extends string>(rows: Array<{ status: T }>, status: T) {
  return rows.filter((row) => row.status === status).length;
}

function buildUsageBreakdown(usageRows: UsageMetricRow[]): UsageBreakdownItem[] {
  const totals = new Map<UsageMetricRow["type"], number>();

  for (const row of usageRows) {
    totals.set(row.type, (totals.get(row.type) ?? 0) + row.quantity);
  }

  return [...totals.entries()]
    .map(([type, quantity]) => ({
      type,
      label: usageTypeLabels[type],
      quantity
    }))
    .sort((a, b) => b.quantity - a.quantity || a.label.localeCompare(b.label));
}

function buildDailyUsage(usageRows: UsageMetricRow[], now: Date, days = 14): UsageChartPoint[] {
  const totals = new Map<string, number>();
  const start = addDays(now, -(days - 1));

  for (let index = 0; index < days; index += 1) {
    const key = dateKey(addDays(start, index));
    totals.set(key, 0);
  }

  for (const row of usageRows) {
    const key = dateKey(row.occurredAt);
    if (totals.has(key)) {
      totals.set(key, (totals.get(key) ?? 0) + row.quantity);
    }
  }

  return [...totals.entries()].map(([date, quantity]) => ({
    date,
    label: formatDateLabel(date),
    quantity
  }));
}

function buildPlatformBreakdown({
  comments,
  posts,
  replies
}: Pick<AnalyticsAggregationInput, "comments" | "posts" | "replies">) {
  const platforms = new Map<AnalyticsPlatformKey, PlatformBreakdownItem>();

  for (const post of posts) {
    const item = getPlatformItem(platforms, post.platform);
    item.posts += 1;
    if (post.status === "published") {
      item.published += 1;
    }
    if (post.status === "failed") {
      item.failures += 1;
    }
  }

  for (const comment of comments) {
    const item = getPlatformItem(platforms, comment.platform);
    item.comments += 1;
    if (comment.status === "failed") {
      item.failures += 1;
    }
  }

  for (const reply of replies) {
    const item = getPlatformItem(platforms, reply.platform);
    if (reply.status === "sent" || reply.status === "approved") {
      item.replies += 1;
    }
    if (reply.status === "failed") {
      item.failures += 1;
    }
  }

  return [...platforms.values()].sort(
    (a, b) =>
      b.posts + b.comments + b.replies - (a.posts + a.comments + a.replies) ||
      a.platform.localeCompare(b.platform)
  );
}

function summarizeAgentRun(row: AgentRunMetricRow): AgentRunSummary {
  const completedAt = row.completedAt ?? null;

  return {
    id: row.id,
    traceId: row.traceId,
    status: row.status,
    provider: row.provider,
    model: row.model,
    toolCallCount: row.toolCalls.length,
    durationMs: completedAt ? Math.max(0, completedAt.getTime() - row.startedAt.getTime()) : null,
    startedAt: row.startedAt.toISOString(),
    completedAt: completedAt?.toISOString() ?? null,
    error: row.error ?? null
  };
}

export function aggregateAnalyticsMetrics({
  agentRuns: agentRunRows,
  comments,
  now = new Date(),
  posts,
  replies,
  usage
}: AnalyticsAggregationInput): AnalyticsSnapshot {
  const publishingFailures = countByStatus(posts, "failed");
  const replyFailures = countByStatus(replies, "failed");
  const agentFailures = countByStatus(agentRunRows, "failed");
  const totalToolCalls = agentRunRows.reduce((sum, run) => sum + run.toolCalls.length, 0);

  return {
    generatedAt: now.toISOString(),
    posting: {
      total: posts.length,
      scheduled: countByStatus(posts, "scheduled"),
      queued: countByStatus(posts, "queued"),
      publishing: countByStatus(posts, "publishing"),
      published: countByStatus(posts, "published"),
      failed: countByStatus(posts, "failed"),
      canceled: countByStatus(posts, "canceled")
    },
    failures: {
      total: publishingFailures + replyFailures + agentFailures,
      publishing: publishingFailures,
      replies: replyFailures,
      agents: agentFailures
    },
    replies: {
      comments: comments.length,
      matched: countByStatus(comments, "matched"),
      awaitingApproval:
        countByStatus(comments, "awaiting_approval") +
        countByStatus(replies, "awaiting_approval"),
      sent: countByStatus(replies, "sent") + countByStatus(replies, "approved"),
      failed: replyFailures
    },
    usage: {
      totalQuantity: usage.reduce((sum, row) => sum + row.quantity, 0),
      byType: buildUsageBreakdown(usage),
      daily: buildDailyUsage(usage, now)
    },
    agents: {
      total: agentRunRows.length,
      running: countByStatus(agentRunRows, "running") + countByStatus(agentRunRows, "queued"),
      succeeded: countByStatus(agentRunRows, "succeeded"),
      failed: agentFailures,
      averageToolCalls: agentRunRows.length > 0 ? Math.round((totalToolCalls / agentRunRows.length) * 10) / 10 : 0,
      recent: [...agentRunRows]
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
        .slice(0, 8)
        .map(summarizeAgentRun)
    },
    platformBreakdown: buildPlatformBreakdown({ comments, posts, replies })
  };
}

function createPreviewAnalyticsSnapshot(now = new Date()) {
  const posts: PostingMetricRow[] = [
    {
      id: "preview-post-1",
      platform: "linkedin",
      provider: "linkedin",
      status: "published",
      scheduledFor: addDays(now, -3),
      publishedAt: addDays(now, -3),
      failedAt: null,
      createdAt: addDays(now, -4)
    },
    {
      id: "preview-post-2",
      platform: "x",
      provider: "x",
      status: "queued",
      scheduledFor: addDays(now, 1),
      publishedAt: null,
      failedAt: null,
      createdAt: addDays(now, -1)
    },
    {
      id: "preview-post-3",
      platform: "instagram",
      provider: "meta",
      status: "scheduled",
      scheduledFor: addDays(now, 2),
      publishedAt: null,
      failedAt: null,
      createdAt: addDays(now, -1)
    },
    {
      id: "preview-post-4",
      platform: "facebook",
      provider: "meta",
      status: "failed",
      scheduledFor: addDays(now, -1),
      publishedAt: null,
      failedAt: addDays(now, -1),
      createdAt: addDays(now, -2)
    }
  ];
  const publishAttemptsRows: PublishAttemptMetricRow[] = [
    {
      id: "preview-attempt-1",
      provider: "linkedin",
      status: "succeeded",
      createdAt: addDays(now, -3),
      completedAt: addDays(now, -3)
    },
    {
      id: "preview-attempt-2",
      provider: "meta",
      status: "failed",
      errorCode: "provider_rate_limited",
      createdAt: addDays(now, -1),
      completedAt: addDays(now, -1)
    }
  ];
  const comments: CommentMetricRow[] = [
    {
      id: "preview-comment-1",
      platform: "linkedin",
      status: "replied",
      receivedAt: addDays(now, -2)
    },
    {
      id: "preview-comment-2",
      platform: "instagram",
      status: "awaiting_approval",
      receivedAt: addDays(now, -1)
    },
    {
      id: "preview-comment-3",
      platform: "facebook",
      status: "matched",
      receivedAt: addDays(now, -1)
    }
  ];
  const replies: ReplyAttemptMetricRow[] = [
    {
      id: "preview-reply-1",
      provider: "linkedin",
      platform: "linkedin",
      status: "sent",
      createdAt: addDays(now, -2),
      sentAt: addDays(now, -2)
    },
    {
      id: "preview-reply-2",
      provider: "meta",
      platform: "instagram",
      status: "awaiting_approval",
      createdAt: addDays(now, -1),
      sentAt: null
    }
  ];
  const usage: UsageMetricRow[] = [
    {
      id: "preview-usage-1",
      type: "ai_generation",
      quantity: 4,
      occurredAt: addDays(now, -5)
    },
    {
      id: "preview-usage-2",
      type: "scheduled_post",
      quantity: 3,
      occurredAt: addDays(now, -3)
    },
    {
      id: "preview-usage-3",
      type: "publish_attempt",
      quantity: 2,
      occurredAt: addDays(now, -2)
    },
    {
      id: "preview-usage-4",
      type: "auto_reply",
      quantity: 1,
      occurredAt: addDays(now, -1)
    },
    {
      id: "preview-usage-5",
      type: "media_transform",
      quantity: 2,
      occurredAt: now
    }
  ];
  const agentRunRows: AgentRunMetricRow[] = [
    {
      id: "run_preview_content",
      traceId: "workflow_preview_content",
      status: "succeeded",
      provider: "gemini",
      model: "gemini-2.5-flash",
      toolCalls: [{ name: "research_topic" }, { name: "save_draft" }],
      startedAt: addDays(now, -3),
      completedAt: addDays(now, -3),
      error: null
    },
    {
      id: "run_preview_reply",
      traceId: "comment_preview_reply",
      status: "running",
      provider: "openai",
      model: "gpt-4.1-mini",
      toolCalls: [{ name: "match_reply_rules" }],
      startedAt: addDays(now, -1),
      completedAt: null,
      error: null
    }
  ];

  return aggregateAnalyticsMetrics({
    posts,
    publishAttempts: publishAttemptsRows,
    comments,
    replies,
    usage,
    agentRuns: agentRunRows,
    now
  });
}

export async function getWorkspaceAnalyticsSnapshot({
  isLocalPreview = false,
  now = new Date(),
  workspaceId
}: {
  workspaceId: string | null | undefined;
  isLocalPreview?: boolean;
  now?: Date;
}): Promise<AnalyticsSnapshot> {
  if (!isDatabaseConfigured || isLocalPreview || !workspaceId) {
    return createPreviewAnalyticsSnapshot(now);
  }

  const db = getDb();
  const [
    postRows,
    publishAttemptRows,
    commentRows,
    replyRows,
    usageRows,
    agentRunRows
  ] = await Promise.all([
    db
      .select({
        id: scheduledJobs.id,
        platform: platformVariants.platform,
        provider: scheduledJobs.provider,
        status: scheduledJobs.status,
        scheduledFor: scheduledJobs.scheduledFor,
        publishedAt: scheduledJobs.publishedAt,
        failedAt: scheduledJobs.failedAt,
        createdAt: scheduledJobs.createdAt
      })
      .from(scheduledJobs)
      .innerJoin(
        platformVariants,
        and(
          eq(scheduledJobs.workspaceId, platformVariants.workspaceId),
          eq(scheduledJobs.platformVariantId, platformVariants.id)
        )
      )
      .where(eq(scheduledJobs.workspaceId, workspaceId))
      .orderBy(desc(scheduledJobs.createdAt))
      .limit(200),
    db
      .select({
        id: publishAttempts.id,
        provider: publishAttempts.provider,
        status: publishAttempts.status,
        errorCode: publishAttempts.errorCode,
        createdAt: publishAttempts.createdAt,
        completedAt: publishAttempts.completedAt
      })
      .from(publishAttempts)
      .where(eq(publishAttempts.workspaceId, workspaceId))
      .orderBy(desc(publishAttempts.createdAt))
      .limit(200),
    db
      .select({
        id: commentEvents.id,
        platform: commentEvents.platform,
        status: commentEvents.status,
        receivedAt: commentEvents.receivedAt
      })
      .from(commentEvents)
      .where(eq(commentEvents.workspaceId, workspaceId))
      .orderBy(desc(commentEvents.receivedAt))
      .limit(200),
    db
      .select({
        id: replyAttempts.id,
        provider: replyAttempts.provider,
        platform: commentEvents.platform,
        status: replyAttempts.status,
        error: replyAttempts.error,
        createdAt: replyAttempts.createdAt,
        sentAt: replyAttempts.sentAt
      })
      .from(replyAttempts)
      .leftJoin(
        commentEvents,
        and(
          eq(replyAttempts.workspaceId, commentEvents.workspaceId),
          eq(replyAttempts.commentEventId, commentEvents.id)
        )
      )
      .where(eq(replyAttempts.workspaceId, workspaceId))
      .orderBy(desc(replyAttempts.createdAt))
      .limit(200),
    db
      .select({
        id: usageLedger.id,
        type: usageLedger.type,
        quantity: usageLedger.quantity,
        occurredAt: usageLedger.occurredAt
      })
      .from(usageLedger)
      .where(eq(usageLedger.workspaceId, workspaceId))
      .orderBy(desc(usageLedger.occurredAt))
      .limit(500),
    db
      .select({
        id: agentRuns.id,
        traceId: agentRuns.traceId,
        status: agentRuns.status,
        provider: agentRuns.provider,
        model: agentRuns.model,
        toolCalls: agentRuns.toolCalls,
        error: agentRuns.error,
        startedAt: agentRuns.startedAt,
        completedAt: agentRuns.completedAt
      })
      .from(agentRuns)
      .where(eq(agentRuns.workspaceId, workspaceId))
      .orderBy(desc(agentRuns.startedAt))
      .limit(100)
  ]);

  return aggregateAnalyticsMetrics({
    posts: postRows,
    publishAttempts: publishAttemptRows,
    comments: commentRows,
    replies: replyRows.map((row) => ({
      ...row,
      platform: row.platform ?? row.provider
    })),
    usage: usageRows,
    agentRuns: agentRunRows,
    now
  });
}
