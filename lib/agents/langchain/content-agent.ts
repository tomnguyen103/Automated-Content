import { agentRunSchema, type AgentRun } from "@/lib/agents/schemas/agent-run";
import {
  contentAgentInputSchema,
  contentPackSchema,
  type ContentAgentInput,
  type ContentPack
} from "@/lib/agents/schemas/content-pack";
import type { PlatformVariant } from "@/lib/agents/schemas/platform-variant";
import { createCheckPlatformPolicyTool } from "@/lib/agents/tools/check-platform-policy";
import { createGeneratePlatformVariantTool } from "@/lib/agents/tools/generate-platform-variant";
import { createReadBrandProfileTool } from "@/lib/agents/tools/read-brand-profile";
import { createResearchTopicTool } from "@/lib/agents/tools/research-topic";
import { createRetrievePastPostsTool } from "@/lib/agents/tools/retrieve-past-posts";
import { createSaveDraftTool, type SaveDraftOutput } from "@/lib/agents/tools/save-draft";
import { createSuggestScheduleTool } from "@/lib/agents/tools/suggest-schedule";
import { AgentRunRecorder, createTraceId } from "@/lib/agents/langchain/middleware";
import { createContentModel, type ContentModel } from "@/lib/agents/langchain/model-factory";
import { createAgentStorage, type AgentStorage } from "@/lib/agents/langchain/storage";
import { createAgentTraceMetadata, recordAgentEvent } from "@/lib/observability/agent-events";

export type ContentAgentToolset = {
  researchTopic: ReturnType<typeof createResearchTopicTool>;
  readBrandProfile: ReturnType<typeof createReadBrandProfileTool>;
  retrievePastPosts: ReturnType<typeof createRetrievePastPostsTool>;
  generatePlatformVariant: ReturnType<typeof createGeneratePlatformVariantTool>;
  checkPlatformPolicy: ReturnType<typeof createCheckPlatformPolicyTool>;
  suggestSchedule: ReturnType<typeof createSuggestScheduleTool>;
  saveDraft: ReturnType<typeof createSaveDraftTool>;
};

export type RunContentAgentOptions = {
  userId: string;
  workspaceId: string;
  model?: ContentModel;
  tools?: Partial<ContentAgentToolset>;
  storage?: AgentStorage;
  now?: () => Date;
};

export type ContentAgentResult = {
  run: AgentRun;
  contentPack: ContentPack;
  draft: SaveDraftOutput;
};

export class ContentAgentExecutionError extends Error {
  constructor(
    message: string,
    readonly run: AgentRun
  ) {
    super(message);
    this.name = "ContentAgentExecutionError";
  }
}

export function createContentAgentTools(overrides: Partial<ContentAgentToolset> = {}): ContentAgentToolset {
  return {
    researchTopic: createResearchTopicTool(),
    readBrandProfile: createReadBrandProfileTool(),
    retrievePastPosts: createRetrievePastPostsTool(),
    generatePlatformVariant: createGeneratePlatformVariantTool(),
    checkPlatformPolicy: createCheckPlatformPolicyTool(),
    suggestSchedule: createSuggestScheduleTool(),
    saveDraft: createSaveDraftTool(),
    ...overrides
  };
}

function createStartedRun(input: ContentAgentInput, model: ContentModel, options: RunContentAgentOptions, traceId: string) {
  return agentRunSchema.parse({
    id: `run_${crypto.randomUUID()}`,
    traceId,
    status: "running",
    provider: model.provider,
    model: model.model,
    userId: options.userId,
    workspaceId: options.workspaceId,
    input,
    toolCalls: [],
    startedAt: (options.now ?? (() => new Date()))().toISOString()
  });
}

function mergePolicy(variant: PlatformVariant, status: PlatformVariant["policyStatus"], warnings: string[]) {
  return {
    ...variant,
    policyStatus: status,
    policyWarnings: warnings
  };
}

export async function runContentAgent(
  rawInput: ContentAgentInput,
  options: RunContentAgentOptions
): Promise<ContentAgentResult> {
  const input = contentAgentInputSchema.parse(rawInput);
  const now = options.now ?? (() => new Date());
  const traceId = createTraceId("content");
  const model = options.model ?? createContentModel();
  const storage = options.storage ?? createAgentStorage();
  const tools = createContentAgentTools({
    ...options.tools,
    saveDraft:
      options.tools?.saveDraft ??
      createSaveDraftTool((input) =>
        storage.saveDraft({
          ...input,
          draftId: `draft_${crypto.randomUUID()}`,
          savedAt: now().toISOString()
        })
      )
  });
  const recorder = new AgentRunRecorder(traceId, now);
  const startedRun = await storage.saveRun(createStartedRun(input, model, { ...options, now }, traceId));
  const traceMetadata = createAgentTraceMetadata({
    agentType: "content",
    model: model.model,
    provider: model.provider,
    runId: startedRun.id,
    runtime: model.mode,
    traceId,
    userId: options.userId,
    workflow: "content_agent",
    workspaceId: options.workspaceId
  });

  recordAgentEvent("content_agent.started", traceMetadata);

  try {
    const research = await recorder.execute(tools.researchTopic, {
      topic: input.topic,
      audience: input.audience,
      sources: input.sources
    });
    const brandProfile = await recorder.execute(tools.readBrandProfile, {
      workspaceId: options.workspaceId,
      userId: options.userId,
      topic: input.topic
    });
    const pastPosts = await recorder.execute(tools.retrievePastPosts, {
      workspaceId: options.workspaceId,
      topic: input.topic,
      platforms: input.platforms
    });
    const plan = await model.generatePlan(input, {
      traceId,
      research,
      brandProfile,
      pastPosts,
      metadata: traceMetadata
    });
    const variants = await Promise.all(
      input.platforms.map(async (platform) => {
        const variant = await recorder.execute(tools.generatePlatformVariant, {
          topic: input.topic,
          platform,
          ideaTitle: plan.ideas[0]?.title ?? input.topic,
          angle: plan.ideas[0]?.angle ?? research.summary,
          audience: input.audience || brandProfile.defaultAudience,
          tone: input.tone || brandProfile.voice,
          goal: input.goal,
          hashtags: plan.hashtags,
          media: []
        });
        const policy = await recorder.execute(tools.checkPlatformPolicy, { variant });

        return mergePolicy(variant, policy.status, policy.warnings);
      })
    );
    const schedule = await recorder.execute(tools.suggestSchedule, {
      topic: input.topic,
      platforms: input.platforms,
      timezone: input.timezone ?? "America/Chicago",
      startDate: now().toISOString()
    });
    const policyWarnings = variants.flatMap((variant) => variant.policyWarnings);
    const contentPack = contentPackSchema.parse({
      id: `pack_${crypto.randomUUID()}`,
      topic: input.topic,
      summary: plan.summary,
      audience: input.audience,
      tone: input.tone,
      goal: input.goal,
      ideas: plan.ideas,
      captions: plan.captions,
      variants,
      hashtags: plan.hashtags,
      ctaOptions: plan.ctaOptions,
      scheduleSuggestions: schedule.suggestions,
      warnings: [...plan.warnings, ...policyWarnings],
      createdAt: now().toISOString(),
      metadata: {
        provider: model.provider,
        model: model.model,
        traceId,
        toolCallCount: recorder.calls.length
      }
    });
    const draft = await recorder.execute(tools.saveDraft, {
      workspaceId: options.workspaceId,
      userId: options.userId,
      agentRunId: startedRun.id,
      sources: input.sources,
      contentPack
    });
    const completedRun = await storage.saveRun({
      ...startedRun,
      status: "succeeded",
      output: contentPack,
      toolCalls: recorder.calls,
      completedAt: now().toISOString()
    });

    recordAgentEvent("content_agent.succeeded", {
      ...traceMetadata,
      toolCallCount: recorder.calls.length
    });

    return {
      run: completedRun,
      contentPack,
      draft
    };
  } catch (error) {
    const failedRun = await storage.saveRun({
      ...startedRun,
      status: "failed",
      toolCalls: recorder.calls,
      error: error instanceof Error ? error.message : "Unknown content agent error",
      completedAt: now().toISOString()
    });

    recordAgentEvent("content_agent.failed", {
      ...traceMetadata,
      error: failedRun.error,
      toolCallCount: recorder.calls.length
    });

    throw new ContentAgentExecutionError(failedRun.error ?? "Content agent failed", failedRun);
  }
}
