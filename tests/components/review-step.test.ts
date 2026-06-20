import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReviewStep } from "@/components/create/review-step";
import {
  createInitialContentWorkflowState,
  failContentWorkflowState,
  markContentWorkflowNode,
  type ContentWorkflowState
} from "@/lib/agents/graphs/state";
import { contentPackSchema } from "@/lib/agents/schemas/content-pack";

function createWorkflow(): ContentWorkflowState {
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
    summary: "Mock summary",
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

describe("ReviewStep", () => {
  it("renders approval actions for a review checkpoint", () => {
    const html = renderToStaticMarkup(
      React.createElement(ReviewStep, {
        workflow: createWorkflow(),
        onDecision: () => undefined
      })
    );

    expect(html).toContain("Review");
    expect(html).toContain("Pending review");
    expect(html).toContain("Approve");
    expect(html).toContain("Changes");
    expect(html).toContain("Pause");
    expect(html).toContain("Schedule suggestions");
  });

  it("renders workflow errors when a checkpoint fails before content exists", () => {
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
    const failed = failContentWorkflowState(
      state,
      "research",
      new Error("Research service unavailable"),
      () => new Date("2026-06-19T12:01:00.000Z")
    );
    const html = renderToStaticMarkup(
      React.createElement(ReviewStep, {
        workflow: failed,
        onDecision: () => undefined
      })
    );

    expect(html).toContain("failed");
    expect(html).toContain("Workflow errors");
    expect(html).toContain("Research service unavailable");
  });
});
