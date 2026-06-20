import { describe, expect, it } from "vitest";
import {
  applyContentWorkflowApprovalDecision,
  createInitialContentWorkflowState,
  markContentWorkflowNode,
  type ContentWorkflowState
} from "@/lib/agents/graphs/state";
import { contentPackSchema } from "@/lib/agents/schemas/content-pack";

function createReviewableState(): ContentWorkflowState {
  const state = createInitialContentWorkflowState({
    input: {
      topic: "AI content calendars",
      audience: "founders",
      tone: "clear",
      goal: "educate",
      sources: ["Manual review before publishing."],
      platforms: ["linkedin"]
    },
    model: "mock-gemini",
    provider: "gemini",
    runId: "run_1",
    traceId: "trace_1",
    userId: "user_1",
    workspaceId: "workspace_1",
    now: () => new Date("2026-06-19T12:00:00.000Z")
  });
  const contentPack = contentPackSchema.parse({
    id: "pack_1",
    topic: state.topic,
    summary: "Summary",
    audience: state.input.audience,
    tone: state.input.tone,
    goal: state.input.goal,
    ideas: [
      {
        id: "idea_1",
        title: "Make the workflow visible",
        angle: "Show the approval checkpoint.",
        audiencePromise: "Founders know what to review."
      }
    ],
    captions: ["Caption"],
    variants: [
      {
        id: "linkedin_1",
        platform: "linkedin",
        title: "LinkedIn post",
        hook: "Hook",
        body: "Body",
        cta: "Reply",
        hashtags: ["#ai"],
        characterCount: 20,
        policyStatus: "pass",
        policyWarnings: []
      }
    ],
    hashtags: ["#ai"],
    ctaOptions: ["Reply"],
    scheduleSuggestions: [
      {
        id: "schedule_1",
        platform: "linkedin",
        scheduledFor: "2026-06-20T17:00:00.000Z",
        timezone: "America/Chicago",
        reason: "Review window",
        confidence: 0.8
      }
    ],
    warnings: [],
    createdAt: "2026-06-19T12:00:00.000Z",
    metadata: {
      provider: "gemini",
      model: "mock-gemini",
      traceId: "trace_1",
      toolCallCount: 0
    }
  });

  return markContentWorkflowNode(state, "review", () => new Date("2026-06-19T12:01:00.000Z"), {
    status: "awaiting_review",
    approvalStatus: "pending",
    contentPack,
    scheduleSuggestions: contentPack.scheduleSuggestions,
    variants: contentPack.variants,
    reviewDecision: {
      requestedAt: "2026-06-19T12:01:00.000Z"
    }
  });
}

describe("content workflow state", () => {
  it("creates an initial state from a parsed brief", () => {
    const state = createInitialContentWorkflowState({
      input: {
        topic: "AI content calendars",
        audience: "founders",
        tone: "clear",
        goal: "educate",
        sources: ["Manual review before publishing."],
        platforms: ["linkedin", "x"]
      },
      model: "mock-gemini",
      provider: "gemini",
      runId: "run_1",
      traceId: "trace_1",
      userId: "user_1",
      workspaceId: "workspace_1",
      now: () => new Date("2026-06-19T12:00:00.000Z")
    });

    expect(state).toMatchObject({
      status: "running",
      currentNode: "intake",
      approvalStatus: "not_requested",
      topic: "AI content calendars",
      sources: ["Manual review before publishing."],
      traceIds: ["trace_1"]
    });
    expect(state.variants).toEqual([]);
    expect(state.errors).toEqual([]);
  });

  it("moves a review checkpoint into approved save state", () => {
    const state = createReviewableState();
    const approved = applyContentWorkflowApprovalDecision({
      action: "approve",
      comment: "Looks good",
      state,
      now: () => new Date("2026-06-19T12:02:00.000Z")
    });

    expect(approved.status).toBe("running");
    expect(approved.currentNode).toBe("save");
    expect(approved.approvalStatus).toBe("approved");
    expect(approved.reviewDecision.approvedAt).toBe("2026-06-19T12:02:00.000Z");
    expect(approved.reviewDecision.comment).toBe("Looks good");
  });

  it("records requested changes without leaving review", () => {
    const state = createReviewableState();
    const changes = applyContentWorkflowApprovalDecision({
      action: "request_changes",
      comment: "Tighten the hook",
      state,
      now: () => new Date("2026-06-19T12:03:00.000Z")
    });

    expect(changes.status).toBe("changes_requested");
    expect(changes.currentNode).toBe("review");
    expect(changes.approvalStatus).toBe("changes_requested");
    expect(changes.reviewDecision.comment).toBe("Tighten the hook");
  });
});
