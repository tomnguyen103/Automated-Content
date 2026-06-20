import { END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import { agentRunSchema, type AgentRun } from "@/lib/agents/schemas/agent-run";
import {
  contentAgentInputSchema,
  contentPackSchema,
  type ContentAgentInput,
  type ContentPack
} from "@/lib/agents/schemas/content-pack";
import type { PlatformVariant } from "@/lib/agents/schemas/platform-variant";
import { AgentRunRecorder, createTraceId } from "@/lib/agents/langchain/middleware";
import { createContentModel, type ContentModel } from "@/lib/agents/langchain/model-factory";
import { createAgentStorage, type AgentStorage } from "@/lib/agents/langchain/storage";
import { createContentAgentTools, type ContentAgentToolset } from "@/lib/agents/langchain/content-agent";
import { createSaveDraftTool } from "@/lib/agents/tools/save-draft";
import {
  applyContentWorkflowApprovalDecision,
  ContentWorkflowAnnotation,
  contentWorkflowApprovalActionSchema,
  createInitialContentWorkflowState,
  failContentWorkflowState,
  markContentWorkflowNode,
  parseContentWorkflowState,
  type ContentWorkflowApprovalAction,
  type ContentWorkflowNode,
  type ContentWorkflowState
} from "@/lib/agents/graphs/state";
import {
  createContentWorkflowCheckpointStore,
  type ContentWorkflowCheckpointStore
} from "@/lib/agents/graphs/checkpoints";

export type RunContentWorkflowOptions = {
  userId: string;
  workspaceId: string;
  model?: ContentModel;
  tools?: Partial<ContentAgentToolset>;
  storage?: AgentStorage;
  checkpoints?: ContentWorkflowCheckpointStore;
  now?: () => Date;
};

export type ContentWorkflowResult = {
  run: AgentRun;
  workflow: ContentWorkflowState;
  contentPack: ContentWorkflowState["contentPack"];
  draft: ContentWorkflowState["savedDraft"];
};

export type ApplyContentWorkflowApprovalOptions = {
  userId: string;
  workspaceId: string;
  action: ContentWorkflowApprovalAction;
  comment?: string;
  contentPack?: ContentPack;
  storage?: AgentStorage;
  checkpoints?: ContentWorkflowCheckpointStore;
  tools?: Partial<ContentAgentToolset>;
  now?: () => Date;
};

type ContentWorkflowRuntime = {
  model: ContentModel;
  tools: ContentAgentToolset;
  recorder: AgentRunRecorder;
  now: () => Date;
  priorToolCalls: AgentRun["toolCalls"];
};

export class ContentWorkflowExecutionError extends Error {
  constructor(
    message: string,
    readonly run: AgentRun,
    readonly workflow: ContentWorkflowState
  ) {
    super(message);
    this.name = "ContentWorkflowExecutionError";
  }
}

export class WorkflowNotFoundError extends Error {
  constructor(message = "Workflow checkpoint not found.") {
    super(message);
    this.name = "WorkflowNotFoundError";
  }
}

export class WorkflowForbiddenError extends Error {
  constructor(message = "Workflow is not available to this user.") {
    super(message);
    this.name = "WorkflowForbiddenError";
  }
}

export class WorkflowValidationError extends Error {
  constructor(message = "Workflow request is invalid.") {
    super(message);
    this.name = "WorkflowValidationError";
  }
}

function createStartedRun({
  input,
  model,
  now,
  runId,
  traceId,
  userId,
  workspaceId
}: {
  input: ContentAgentInput;
  model: ContentModel;
  now: () => Date;
  runId: string;
  traceId: string;
  userId: string;
  workspaceId: string;
}) {
  return agentRunSchema.parse({
    id: runId,
    traceId,
    status: "running",
    provider: model.provider,
    model: model.model,
    userId,
    workspaceId,
    input,
    toolCalls: [],
    startedAt: now().toISOString()
  });
}

function createWorkflowRuntime({
  model,
  now,
  storage,
  tools,
  traceId,
  priorToolCalls = []
}: {
  model: ContentModel;
  now: () => Date;
  storage: AgentStorage;
  tools?: Partial<ContentAgentToolset>;
  traceId: string;
  priorToolCalls?: AgentRun["toolCalls"];
}): ContentWorkflowRuntime {
  return {
    model,
    now,
    priorToolCalls,
    recorder: new AgentRunRecorder(traceId, now),
    tools: createContentAgentTools({
      ...tools,
      saveDraft:
        tools?.saveDraft ??
        createSaveDraftTool((input) =>
          storage.saveDraft({
            ...input,
            draftId: `draft_${crypto.randomUUID()}`,
            savedAt: now().toISOString()
          })
        )
    })
  };
}

function mergePolicy(variant: PlatformVariant, status: PlatformVariant["policyStatus"], warnings: string[]) {
  return {
    ...variant,
    policyStatus: status,
    policyWarnings: warnings
  };
}

function requireStateValue<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }

  return value;
}

function withToolCalls(runtime: ContentWorkflowRuntime) {
  return [...runtime.priorToolCalls, ...runtime.recorder.calls];
}

function buildWorkflowResult(run: AgentRun, workflow: ContentWorkflowState): ContentWorkflowResult {
  return {
    run,
    workflow,
    contentPack: workflow.contentPack,
    draft: workflow.savedDraft
  };
}

async function createWorkflowResult(
  storage: AgentStorage,
  run: AgentRun,
  workflow: ContentWorkflowState
): Promise<ContentWorkflowResult> {
  const updatedRun = await saveRunFromWorkflow(storage, run, workflow);

  return {
    run: updatedRun,
    workflow,
    contentPack: workflow.contentPack,
    draft: workflow.savedDraft
  };
}

async function createCurrentWorkflowResult(
  storage: AgentStorage,
  run: AgentRun,
  workflow: ContentWorkflowState
) {
  if (workflow.status === "succeeded" || workflow.status === "failed") {
    return createWorkflowResult(storage, run, workflow);
  }

  return buildWorkflowResult(run, workflow);
}

function applyReviewedContentPack(
  state: ContentWorkflowState,
  contentPack: ContentPack | undefined,
  now: () => Date
) {
  if (!contentPack) {
    return state;
  }

  const parsed = contentPackSchema.parse(contentPack);

  if (!state.contentPack) {
    throw new WorkflowValidationError("Workflow has no content pack to update.");
  }

  if (parsed.id !== state.contentPack.id) {
    throw new WorkflowValidationError("Edited content pack does not match this workflow.");
  }

  return markContentWorkflowNode(state, state.currentNode, now, {
    contentPack: parsed,
    variants: parsed.variants,
    scheduleSuggestions: parsed.scheduleSuggestions
  });
}

function createNode(
  node: ContentWorkflowNode,
  runtime: ContentWorkflowRuntime,
  execute: (state: ContentWorkflowState) => Promise<Partial<ContentWorkflowState>> | Partial<ContentWorkflowState>,
  remember?: (state: ContentWorkflowState) => void
) {
  return async (rawState: typeof ContentWorkflowAnnotation.State) => {
    const state = markContentWorkflowNode(parseContentWorkflowState(rawState), node, runtime.now, {
      status: "running"
    });
    remember?.(state);

    try {
      const updates = await execute(state);
      const nextState = markContentWorkflowNode(state, node, runtime.now, {
        ...updates,
        toolCalls: withToolCalls(runtime)
      });
      remember?.(nextState);
      return nextState;
    } catch (error) {
      const failedState = failContentWorkflowState(state, node, error, runtime.now);
      remember?.({
        ...failedState,
        toolCalls: withToolCalls(runtime)
      });
      throw error;
    }
  };
}

function createContentWorkflowGraph(runtime: ContentWorkflowRuntime, remember?: (state: ContentWorkflowState) => void) {
  return new StateGraph(ContentWorkflowAnnotation)
    .addNode(
      "intake",
      createNode("intake", runtime, (state) => ({
        topic: state.input.topic,
        sources: state.input.sources,
        approvalStatus: "not_requested"
      }), remember)
    )
    .addNode(
      "research",
      createNode("research", runtime, async (state) => {
        const research = await runtime.recorder.execute(runtime.tools.researchTopic, {
          topic: state.topic,
          audience: state.input.audience,
          sources: state.sources
        });
        const brandProfile = await runtime.recorder.execute(runtime.tools.readBrandProfile, {
          workspaceId: state.workspaceId,
          userId: state.userId,
          topic: state.topic
        });
        const pastPosts = await runtime.recorder.execute(runtime.tools.retrievePastPosts, {
          workspaceId: state.workspaceId,
          topic: state.topic,
          platforms: state.input.platforms
        });

        return {
          researchResult: research,
          brandProfile,
          pastPosts
        };
      }, remember)
    )
    .addNode(
      "strategy",
      createNode("strategy", runtime, async (state) => {
        const research = requireStateValue(state.researchResult, "Research is required before strategy.");
        const brandProfile = requireStateValue(state.brandProfile, "Brand profile is required before strategy.");
        const pastPosts = requireStateValue(state.pastPosts, "Past posts are required before strategy.");
        const plan = await runtime.model.generatePlan(state.input, {
          traceId: state.traceId,
          research,
          brandProfile,
          pastPosts
        });

        return { plan };
      }, remember)
    )
    .addNode(
      "draft",
      createNode("draft", runtime, (state) => {
        requireStateValue(state.plan, "Strategy plan is required before draft.");
        return {};
      }, remember)
    )
    .addNode(
      "platform_adaptation",
      createNode("platform_adaptation", runtime, async (state) => {
        const plan = requireStateValue(state.plan, "Strategy plan is required before platform adaptation.");
        const brandProfile = requireStateValue(
          state.brandProfile,
          "Brand profile is required before platform adaptation."
        );
        const research = requireStateValue(state.researchResult, "Research is required before platform adaptation.");
        const variants = await Promise.all(
          state.input.platforms.map((platform) =>
            runtime.recorder.execute(runtime.tools.generatePlatformVariant, {
              topic: state.topic,
              platform,
              ideaTitle: plan.ideas[0]?.title ?? state.topic,
              angle: plan.ideas[0]?.angle ?? research.summary,
              audience: state.input.audience || brandProfile.defaultAudience,
              tone: state.input.tone || brandProfile.voice,
              goal: state.input.goal,
              hashtags: plan.hashtags,
              media: []
            })
          )
        );

        return { variants };
      }, remember)
    )
    .addNode(
      "safety",
      createNode("safety", runtime, async (state) => {
        const variants = await Promise.all(
          state.variants.map(async (variant) => {
            const policy = await runtime.recorder.execute(runtime.tools.checkPlatformPolicy, { variant });
            return mergePolicy(variant, policy.status, policy.warnings);
          })
        );

        return { variants };
      }, remember)
    )
    .addNode(
      "schedule_suggestion",
      createNode("schedule_suggestion", runtime, async (state) => {
        const plan = requireStateValue(state.plan, "Strategy plan is required before schedule suggestion.");
        const schedule = await runtime.recorder.execute(runtime.tools.suggestSchedule, {
          topic: state.topic,
          platforms: state.input.platforms,
          timezone: state.input.timezone ?? "America/Chicago",
          startDate: runtime.now().toISOString()
        });
        const policyWarnings = state.variants.flatMap((variant) => variant.policyWarnings);
        const contentPack = contentPackSchema.parse({
          id: `pack_${crypto.randomUUID()}`,
          topic: state.topic,
          summary: plan.summary,
          audience: state.input.audience,
          tone: state.input.tone,
          goal: state.input.goal,
          ideas: plan.ideas,
          captions: plan.captions,
          variants: state.variants,
          hashtags: plan.hashtags,
          ctaOptions: plan.ctaOptions,
          scheduleSuggestions: schedule.suggestions,
          warnings: [...plan.warnings, ...policyWarnings],
          createdAt: runtime.now().toISOString(),
          metadata: {
            provider: runtime.model.provider,
            model: runtime.model.model,
            traceId: state.traceId,
            toolCallCount: runtime.recorder.calls.length
          }
        });

        return {
          contentPack,
          scheduleSuggestions: schedule.suggestions
        };
      }, remember)
    )
    .addNode(
      "review",
      createNode("review", runtime, (state) => {
        requireStateValue(state.contentPack, "Content pack is required before review.");
        const requestedAt = runtime.now().toISOString();

        return {
          status: "awaiting_review",
          approvalStatus: "pending",
          reviewDecision: {
            ...state.reviewDecision,
            requestedAt
          }
        };
      }, remember)
    )
    .addNode(
      "save",
      createNode("save", runtime, async (state) => {
        if (state.approvalStatus !== "approved") {
          throw new Error("Approval is required before saving the workflow draft.");
        }

        const contentPack = requireStateValue(state.contentPack, "Content pack is required before save.");
        const draft = await runtime.recorder.execute(runtime.tools.saveDraft, {
          workspaceId: state.workspaceId,
          userId: state.userId,
          agentRunId: state.runId,
          sources: state.sources,
          contentPack
        });
        const completedAt = runtime.now().toISOString();

        return {
          savedDraft: draft,
          status: "succeeded",
          completedAt
        };
      }, remember)
    )
    .addEdge(START, "intake")
    .addEdge("intake", "research")
    .addEdge("research", "strategy")
    .addEdge("strategy", "draft")
    .addEdge("draft", "platform_adaptation")
    .addEdge("platform_adaptation", "safety")
    .addEdge("safety", "schedule_suggestion")
    .addEdge("schedule_suggestion", "review")
    .addEdge("review", "save")
    .addEdge("save", END);
}

async function saveRunFromWorkflow(storage: AgentStorage, run: AgentRun, workflow: ContentWorkflowState) {
  return storage.saveRun({
    ...run,
    status: workflow.status === "succeeded" ? "succeeded" : workflow.status === "failed" ? "failed" : "running",
    output: workflow.contentPack ?? undefined,
    toolCalls: workflow.toolCalls,
    error: workflow.errors.at(-1)?.message,
    completedAt: workflow.completedAt ?? undefined
  });
}

export async function runContentWorkflow(
  rawInput: ContentAgentInput,
  options: RunContentWorkflowOptions
): Promise<ContentWorkflowResult> {
  const input = contentAgentInputSchema.parse(rawInput);
  const now = options.now ?? (() => new Date());
  const model = options.model ?? createContentModel();
  const storage = options.storage ?? createAgentStorage();
  const checkpoints = options.checkpoints ?? createContentWorkflowCheckpointStore();
  const traceId = createTraceId("workflow");
  const runId = `run_${crypto.randomUUID()}`;
  const startedRun = await storage.saveRun(
    createStartedRun({
      input,
      model,
      now,
      runId,
      traceId,
      userId: options.userId,
      workspaceId: options.workspaceId
    })
  );
  const initialState = createInitialContentWorkflowState({
    input,
    model: model.model,
    provider: model.provider,
    runId,
    traceId,
    userId: options.userId,
    workspaceId: options.workspaceId,
    now
  });
  const runtime = createWorkflowRuntime({
    model,
    now,
    storage,
    tools: options.tools,
    traceId
  });
  let latestState = initialState;
  const graph = createContentWorkflowGraph(runtime, (state) => {
    latestState = state;
  }).compile({
    checkpointer: new MemorySaver(),
    interruptBefore: ["save"],
    name: "content-workflow",
    description: "Generate a review-ready content pack and stop before saving until approval."
  });

  try {
    const graphState = parseContentWorkflowState(
      await graph.invoke(initialState, {
        configurable: {
          thread_id: runId
        }
      })
    );
    const workflow = await checkpoints.save(graphState);
    const run = await saveRunFromWorkflow(storage, startedRun, workflow);

    return {
      run,
      workflow,
      contentPack: workflow.contentPack,
      draft: workflow.savedDraft
    };
  } catch (error) {
    const failedWorkflow = await checkpoints.save(
      failContentWorkflowState(latestState, latestState.currentNode, error, now)
    );
    const failedRun = await saveRunFromWorkflow(storage, startedRun, failedWorkflow);

    throw new ContentWorkflowExecutionError(failedWorkflow.errors.at(-1)?.message ?? "Content workflow failed.", failedRun, failedWorkflow);
  }
}

export async function applyContentWorkflowApproval(
  runId: string,
  options: ApplyContentWorkflowApprovalOptions
): Promise<ContentWorkflowResult> {
  const action = contentWorkflowApprovalActionSchema.parse(options.action);
  const now = options.now ?? (() => new Date());
  const storage = options.storage ?? createAgentStorage();
  const checkpoints = options.checkpoints ?? createContentWorkflowCheckpointStore();
  const state = await checkpoints.get(runId, options.workspaceId);

  if (!state) {
    throw new WorkflowNotFoundError();
  }

  if (state.userId !== options.userId) {
    throw new WorkflowForbiddenError();
  }

  const run = await storage.getRun(runId, options.workspaceId);

  if (!run) {
    throw new WorkflowNotFoundError("Agent run not found.");
  }

  if (action === "approve" && state.status === "succeeded" && state.approvalStatus === "approved") {
    return createWorkflowResult(storage, run, state);
  }

  if (
    action === "approve" &&
    state.status === "running" &&
    state.approvalStatus === "approved" &&
    state.currentNode === "save"
  ) {
    return buildWorkflowResult(run, state);
  }

  const reviewState = applyReviewedContentPack(state, options.contentPack, now);
  const decidedState = applyContentWorkflowApprovalDecision({
    action,
    comment: options.comment,
    now,
    state: reviewState
  });

  if (action !== "approve") {
    const transition = await checkpoints.transition(decidedState, {
      status: state.status,
      updatedAt: state.updatedAt
    });
    const workflow = transition.state;

    if (!workflow) {
      throw new Error("Workflow checkpoint not found.");
    }

    return transition.transitioned
      ? createWorkflowResult(storage, run, workflow)
      : createCurrentWorkflowResult(storage, run, workflow);
  }

  const approvalClaim = await checkpoints.transition(decidedState, {
    status: state.status,
    updatedAt: state.updatedAt
  });

  if (!approvalClaim.state) {
    throw new Error("Workflow checkpoint not found.");
  }

  if (!approvalClaim.transitioned) {
    return createCurrentWorkflowResult(storage, run, approvalClaim.state);
  }

  const model: ContentModel = {
    provider: approvalClaim.state.provider,
    model: approvalClaim.state.model,
    mode: "local",
    async generatePlan() {
      throw new Error("Approval resume does not invoke the strategy model.");
    }
  };
  const runtime = createWorkflowRuntime({
    model,
    now,
    storage,
    tools: options.tools,
    traceId: approvalClaim.state.traceId,
    priorToolCalls: approvalClaim.state.toolCalls
  });
  let latestState = approvalClaim.state;
  const saveOnly = createNode(
    "save",
    runtime,
    async (currentState) => {
      if (currentState.approvalStatus !== "approved") {
        throw new Error("Approval is required before saving the workflow draft.");
      }

      const contentPack = requireStateValue(currentState.contentPack, "Content pack is required before save.");
      const draft = await runtime.recorder.execute(runtime.tools.saveDraft, {
        workspaceId: currentState.workspaceId,
        userId: currentState.userId,
        agentRunId: currentState.runId,
        sources: currentState.sources,
        contentPack
      });
      const completedAt = runtime.now().toISOString();

      return {
        savedDraft: draft,
        status: "succeeded",
        completedAt
      };
    },
    (nextState) => {
      latestState = nextState;
    }
  );

  try {
    const savedState = parseContentWorkflowState(await saveOnly(approvalClaim.state));
    const completion = await checkpoints.transition(savedState, {
      status: approvalClaim.state.status,
      updatedAt: approvalClaim.state.updatedAt
    });
    const workflow = completion.state;

    if (!workflow) {
      throw new Error("Workflow checkpoint not found.");
    }

    return completion.transitioned
      ? createWorkflowResult(storage, run, workflow)
      : createCurrentWorkflowResult(storage, run, workflow);
  } catch (error) {
    const failedState = failContentWorkflowState(latestState, "save", error, now);
    const failure = await checkpoints.transition(failedState, {
      status: approvalClaim.state.status,
      updatedAt: approvalClaim.state.updatedAt
    });

    if (failure.state?.status === "succeeded") {
      return createWorkflowResult(storage, run, failure.state);
    }

    const failedWorkflow = failure.state ?? failedState;
    const failedRun = failure.transitioned
      ? await saveRunFromWorkflow(storage, run, failedWorkflow)
      : run;

    throw new ContentWorkflowExecutionError(failedWorkflow.errors.at(-1)?.message ?? "Content workflow failed.", failedRun, failedWorkflow);
  }
}
