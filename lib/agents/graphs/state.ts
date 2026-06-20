import { Annotation } from "@langchain/langgraph";
import { z } from "zod";
import { agentToolCallSchema } from "@/lib/agents/schemas/agent-run";
import { contentAgentInputSchema, contentPackSchema, type ContentAgentInput } from "@/lib/agents/schemas/content-pack";
import { platformVariantSchema } from "@/lib/agents/schemas/platform-variant";
import { scheduleSuggestionSchema } from "@/lib/agents/schemas/schedule-suggestion";
import { contentModelPlanSchema } from "@/lib/agents/langchain/model-factory";
import { brandProfileOutputSchema } from "@/lib/agents/tools/read-brand-profile";
import { researchTopicOutputSchema } from "@/lib/agents/tools/research-topic";
import { retrievePastPostsOutputSchema } from "@/lib/agents/tools/retrieve-past-posts";
import type { SaveDraftOutput } from "@/lib/agents/tools/save-draft";

export const contentWorkflowNodeSchema = z.enum([
  "intake",
  "research",
  "strategy",
  "draft",
  "platform_adaptation",
  "safety",
  "schedule_suggestion",
  "review",
  "save"
]);

export const contentWorkflowStatusSchema = z.enum([
  "running",
  "awaiting_review",
  "paused",
  "changes_requested",
  "succeeded",
  "failed"
]);

export const contentWorkflowApprovalStatusSchema = z.enum([
  "not_requested",
  "pending",
  "approved",
  "changes_requested",
  "paused"
]);

export const contentWorkflowApprovalActionSchema = z.enum(["approve", "request_changes", "pause"]);

export const contentWorkflowErrorSchema = z.object({
  node: contentWorkflowNodeSchema,
  message: z.string().min(1),
  occurredAt: z.string().min(1)
});

export const contentWorkflowReviewSchema = z.object({
  requestedAt: z.string().min(1).optional(),
  approvedAt: z.string().min(1).optional(),
  changesRequestedAt: z.string().min(1).optional(),
  pausedAt: z.string().min(1).optional(),
  comment: z.string().max(1000).optional()
});

export const saveDraftOutputStateSchema = z.object({
  draftId: z.string().min(1),
  status: z.enum(["saved"]),
  savedAt: z.string().min(1)
}) satisfies z.ZodType<SaveDraftOutput>;

export const contentWorkflowStateSchema = z.object({
  runId: z.string().min(1),
  userId: z.string().min(1),
  workspaceId: z.string().min(1),
  traceId: z.string().min(1),
  traceIds: z.array(z.string().min(1)).min(1),
  provider: z.enum(["openai", "gemini"]),
  model: z.string().min(1),
  status: contentWorkflowStatusSchema,
  currentNode: contentWorkflowNodeSchema,
  approvalStatus: contentWorkflowApprovalStatusSchema,
  input: contentAgentInputSchema,
  topic: z.string().min(1),
  sources: z.array(z.string().min(1).max(1000)).max(8),
  researchResult: researchTopicOutputSchema.nullable(),
  brandProfile: brandProfileOutputSchema.nullable(),
  pastPosts: retrievePastPostsOutputSchema.nullable(),
  plan: contentModelPlanSchema.nullable(),
  variants: z.array(platformVariantSchema),
  scheduleSuggestions: z.array(scheduleSuggestionSchema),
  contentPack: contentPackSchema.nullable(),
  savedDraft: saveDraftOutputStateSchema.nullable(),
  toolCalls: z.array(agentToolCallSchema),
  errors: z.array(contentWorkflowErrorSchema),
  reviewDecision: contentWorkflowReviewSchema,
  startedAt: z.string().min(1),
  updatedAt: z.string().min(1),
  completedAt: z.string().min(1).nullable()
});

export type ContentWorkflowNode = z.infer<typeof contentWorkflowNodeSchema>;
export type ContentWorkflowStatus = z.infer<typeof contentWorkflowStatusSchema>;
export type ContentWorkflowApprovalStatus = z.infer<typeof contentWorkflowApprovalStatusSchema>;
export type ContentWorkflowApprovalAction = z.infer<typeof contentWorkflowApprovalActionSchema>;
export type ContentWorkflowError = z.infer<typeof contentWorkflowErrorSchema>;
export type ContentWorkflowState = z.infer<typeof contentWorkflowStateSchema>;

export const ContentWorkflowAnnotation = Annotation.Root({
  runId: Annotation<ContentWorkflowState["runId"]>(),
  userId: Annotation<ContentWorkflowState["userId"]>(),
  workspaceId: Annotation<ContentWorkflowState["workspaceId"]>(),
  traceId: Annotation<ContentWorkflowState["traceId"]>(),
  traceIds: Annotation<ContentWorkflowState["traceIds"]>(),
  provider: Annotation<ContentWorkflowState["provider"]>(),
  model: Annotation<ContentWorkflowState["model"]>(),
  status: Annotation<ContentWorkflowState["status"]>(),
  currentNode: Annotation<ContentWorkflowState["currentNode"]>(),
  approvalStatus: Annotation<ContentWorkflowState["approvalStatus"]>(),
  input: Annotation<ContentWorkflowState["input"]>(),
  topic: Annotation<ContentWorkflowState["topic"]>(),
  sources: Annotation<ContentWorkflowState["sources"]>(),
  researchResult: Annotation<ContentWorkflowState["researchResult"]>(),
  brandProfile: Annotation<ContentWorkflowState["brandProfile"]>(),
  pastPosts: Annotation<ContentWorkflowState["pastPosts"]>(),
  plan: Annotation<ContentWorkflowState["plan"]>(),
  variants: Annotation<ContentWorkflowState["variants"]>(),
  scheduleSuggestions: Annotation<ContentWorkflowState["scheduleSuggestions"]>(),
  contentPack: Annotation<ContentWorkflowState["contentPack"]>(),
  savedDraft: Annotation<ContentWorkflowState["savedDraft"]>(),
  toolCalls: Annotation<ContentWorkflowState["toolCalls"]>(),
  errors: Annotation<ContentWorkflowState["errors"]>(),
  reviewDecision: Annotation<ContentWorkflowState["reviewDecision"]>(),
  startedAt: Annotation<ContentWorkflowState["startedAt"]>(),
  updatedAt: Annotation<ContentWorkflowState["updatedAt"]>(),
  completedAt: Annotation<ContentWorkflowState["completedAt"]>()
});

export function createInitialContentWorkflowState({
  input,
  model,
  provider,
  runId,
  traceId,
  userId,
  workspaceId,
  now = () => new Date()
}: {
  input: ContentAgentInput;
  model: string;
  provider: ContentWorkflowState["provider"];
  runId: string;
  traceId: string;
  userId: string;
  workspaceId: string;
  now?: () => Date;
}) {
  const parsedInput = contentAgentInputSchema.parse(input);
  const timestamp = now().toISOString();

  return contentWorkflowStateSchema.parse({
    runId,
    userId,
    workspaceId,
    traceId,
    traceIds: [traceId],
    provider,
    model,
    status: "running",
    currentNode: "intake",
    approvalStatus: "not_requested",
    input: parsedInput,
    topic: parsedInput.topic,
    sources: parsedInput.sources,
    researchResult: null,
    brandProfile: null,
    pastPosts: null,
    plan: null,
    variants: [],
    scheduleSuggestions: [],
    contentPack: null,
    savedDraft: null,
    toolCalls: [],
    errors: [],
    reviewDecision: {},
    startedAt: timestamp,
    updatedAt: timestamp,
    completedAt: null
  });
}

export function markContentWorkflowNode(
  state: ContentWorkflowState,
  node: ContentWorkflowNode,
  now: () => Date,
  updates: Partial<ContentWorkflowState> = {}
) {
  return contentWorkflowStateSchema.parse({
    ...state,
    ...updates,
    currentNode: node,
    updatedAt: now().toISOString()
  });
}

export function failContentWorkflowState(
  state: ContentWorkflowState,
  node: ContentWorkflowNode,
  error: unknown,
  now: () => Date
) {
  const timestamp = now().toISOString();

  return contentWorkflowStateSchema.parse({
    ...state,
    status: "failed",
    currentNode: node,
    errors: [
      ...state.errors,
      {
        node,
        message: error instanceof Error ? error.message : "Unknown workflow error",
        occurredAt: timestamp
      }
    ],
    updatedAt: timestamp,
    completedAt: timestamp
  });
}

export function applyContentWorkflowApprovalDecision({
  action,
  comment,
  now,
  state
}: {
  action: ContentWorkflowApprovalAction;
  comment?: string;
  now: () => Date;
  state: ContentWorkflowState;
}) {
  contentWorkflowApprovalActionSchema.parse(action);

  if (!state.contentPack) {
    throw new Error("Workflow has no content pack to review.");
  }

  if (!["awaiting_review", "paused", "changes_requested"].includes(state.status)) {
    throw new Error(`Workflow cannot be reviewed while ${state.status}.`);
  }

  const timestamp = now().toISOString();

  if (action === "approve") {
    return contentWorkflowStateSchema.parse({
      ...state,
      status: "running",
      currentNode: "save",
      approvalStatus: "approved",
      reviewDecision: {
        ...state.reviewDecision,
        approvedAt: timestamp,
        comment: comment?.trim() || state.reviewDecision.comment
      },
      updatedAt: timestamp
    });
  }

  if (action === "request_changes") {
    return contentWorkflowStateSchema.parse({
      ...state,
      status: "changes_requested",
      currentNode: "review",
      approvalStatus: "changes_requested",
      reviewDecision: {
        ...state.reviewDecision,
        changesRequestedAt: timestamp,
        comment: comment?.trim() || state.reviewDecision.comment
      },
      updatedAt: timestamp
    });
  }

  return contentWorkflowStateSchema.parse({
    ...state,
    status: "paused",
    currentNode: "review",
    approvalStatus: "paused",
    reviewDecision: {
      ...state.reviewDecision,
      pausedAt: timestamp,
      comment: comment?.trim() || state.reviewDecision.comment
    },
    updatedAt: timestamp
  });
}

export function parseContentWorkflowState(value: unknown) {
  const raw = value && typeof value === "object" ? { ...(value as Record<string, unknown>) } : value;

  if (raw && typeof raw === "object" && "__interrupt__" in raw) {
    delete (raw as Record<string, unknown>).__interrupt__;
  }

  return contentWorkflowStateSchema.parse(raw);
}
