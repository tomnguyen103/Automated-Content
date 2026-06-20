import { describe, expect, it } from "vitest";
import {
  applyContentWorkflowApproval,
  runContentWorkflow,
  WorkflowValidationError
} from "@/lib/agents/graphs/content-workflow";
import { createMemoryContentWorkflowCheckpointStore } from "@/lib/agents/graphs/checkpoints";
import { createContentModel } from "@/lib/agents/langchain/model-factory";
import { createMemoryAgentStorage } from "@/lib/agents/langchain/storage";
import { createSaveDraftTool } from "@/lib/agents/tools/save-draft";

function createMockModel() {
  return createContentModel({
    env: {
      AI_PROVIDER: "gemini",
      OPENAI_API_KEY: undefined,
      GEMINI_API_KEY: undefined
    },
    model: "mock-gemini",
    generatePlan: async () => ({
      summary: "Mock summary",
      ideas: [
        {
          id: "idea_mock",
          title: "Mock idea",
          angle: "Mock angle",
          audiencePromise: "Mock promise"
        }
      ],
      captions: ["Mock caption"],
      hashtags: ["#mock", "#content"],
      ctaOptions: ["Reply with a platform"],
      warnings: []
    })
  });
}

describe("content workflow integration", () => {
  it("pauses at review and resumes save after approval", async () => {
    const storage = createMemoryAgentStorage();
    const checkpoints = createMemoryContentWorkflowCheckpointStore();
    const result = await runContentWorkflow(
      {
        topic: "AI content calendars",
        audience: "founders",
        tone: "direct",
        goal: "generate replies",
        sources: ["Manual approval remains required."],
        platforms: ["linkedin", "x"],
        timezone: "UTC"
      },
      {
        userId: "user_1",
        workspaceId: "workspace_1",
        storage,
        checkpoints,
        now: () => new Date("2026-06-19T12:00:00.000Z"),
        model: createMockModel()
      }
    );

    expect(result.run.status).toBe("running");
    expect(result.workflow.status).toBe("awaiting_review");
    expect(result.workflow.currentNode).toBe("review");
    expect(result.workflow.approvalStatus).toBe("pending");
    expect(result.contentPack?.variants).toHaveLength(2);
    expect(result.contentPack?.scheduleSuggestions.every((suggestion) => suggestion.timezone === "UTC")).toBe(true);
    expect(result.draft).toBeNull();
    expect(result.run.toolCalls.map((call) => call.name)).not.toContain("save_draft");
    await expect(checkpoints.get(result.run.id, "workspace_1")).resolves.toMatchObject({
      runId: result.run.id,
      status: "awaiting_review"
    });

    const approved = await applyContentWorkflowApproval(result.run.id, {
      action: "approve",
      userId: "user_1",
      workspaceId: "workspace_1",
      storage,
      checkpoints,
      now: () => new Date("2026-06-19T12:05:00.000Z")
    });

    expect(approved.run.status).toBe("succeeded");
    expect(approved.workflow.status).toBe("succeeded");
    expect(approved.workflow.currentNode).toBe("save");
    expect(approved.workflow.approvalStatus).toBe("approved");
    expect(approved.draft?.status).toBe("saved");
    expect(approved.run.toolCalls.map((call) => call.name)).toContain("save_draft");
    expect(storage.getDraft(approved.draft?.draftId ?? "")?.contentPack.id).toBe(result.contentPack?.id);
  });

  it("stores a change request without saving a draft", async () => {
    const storage = createMemoryAgentStorage();
    const checkpoints = createMemoryContentWorkflowCheckpointStore();
    const result = await runContentWorkflow(
      {
        topic: "Approval checkpoints",
        audience: "operators",
        tone: "clear",
        goal: "educate",
        sources: ["Approval checkpoints build trust."],
        platforms: ["linkedin"]
      },
      {
        userId: "user_1",
        workspaceId: "workspace_1",
        storage,
        checkpoints,
        now: () => new Date("2026-06-19T12:00:00.000Z"),
        model: createMockModel()
      }
    );

    const requested = await applyContentWorkflowApproval(result.run.id, {
      action: "request_changes",
      comment: "Make the CTA sharper",
      userId: "user_1",
      workspaceId: "workspace_1",
      storage,
      checkpoints,
      now: () => new Date("2026-06-19T12:05:00.000Z")
    });

    expect(requested.run.status).toBe("running");
    expect(requested.workflow.status).toBe("changes_requested");
    expect(requested.workflow.reviewDecision.comment).toBe("Make the CTA sharper");
    expect(requested.draft).toBeNull();
    expect(requested.run.toolCalls.map((call) => call.name)).not.toContain("save_draft");
  });

  it("saves reviewed content pack edits after approval", async () => {
    const storage = createMemoryAgentStorage();
    const checkpoints = createMemoryContentWorkflowCheckpointStore();
    const result = await runContentWorkflow(
      {
        topic: "Approval checkpoints",
        audience: "operators",
        tone: "clear",
        goal: "educate",
        sources: ["Approval checkpoints build trust."],
        platforms: ["linkedin"]
      },
      {
        userId: "user_1",
        workspaceId: "workspace_1",
        storage,
        checkpoints,
        now: () => new Date("2026-06-19T12:00:00.000Z"),
        model: createMockModel()
      }
    );
    const editedPack = {
      ...result.contentPack!,
      captions: ["Edited primary caption"],
      variants: result.contentPack!.variants.map((variant) => ({
        ...variant,
        body: "Edited platform body",
        cta: "Edited CTA"
      }))
    };

    const approved = await applyContentWorkflowApproval(result.run.id, {
      action: "approve",
      contentPack: editedPack,
      userId: "user_1",
      workspaceId: "workspace_1",
      storage,
      checkpoints,
      now: () => new Date("2026-06-19T12:05:00.000Z")
    });
    const savedDraft = storage.getDraft(approved.draft?.draftId ?? "");

    expect(approved.contentPack?.captions[0]).toBe("Edited primary caption");
    expect(approved.contentPack?.variants[0].body).toBe("Edited platform body");
    expect(savedDraft?.contentPack.captions[0]).toBe("Edited primary caption");
    expect(savedDraft?.contentPack.variants[0].cta).toBe("Edited CTA");
  });

  it("rejects approval edits for a different content pack", async () => {
    const storage = createMemoryAgentStorage();
    const checkpoints = createMemoryContentWorkflowCheckpointStore();
    const result = await runContentWorkflow(
      {
        topic: "Approval checkpoints",
        audience: "operators",
        tone: "clear",
        goal: "educate",
        sources: ["Approval checkpoints build trust."],
        platforms: ["linkedin"]
      },
      {
        userId: "user_1",
        workspaceId: "workspace_1",
        storage,
        checkpoints,
        now: () => new Date("2026-06-19T12:00:00.000Z"),
        model: createMockModel()
      }
    );
    const editedPack = {
      ...result.contentPack!,
      id: "different_content_pack"
    };

    await expect(
      applyContentWorkflowApproval(result.run.id, {
        action: "approve",
        contentPack: editedPack,
        userId: "user_1",
        workspaceId: "workspace_1",
        storage,
        checkpoints,
        now: () => new Date("2026-06-19T12:05:00.000Z")
      })
    ).rejects.toThrow(WorkflowValidationError);
    await expect(checkpoints.get(result.run.id, "workspace_1")).resolves.toMatchObject({
      status: "awaiting_review",
      approvalStatus: "pending"
    });
  });

  it("saves only one draft for duplicate approve requests", async () => {
    const storage = createMemoryAgentStorage();
    const checkpoints = createMemoryContentWorkflowCheckpointStore();
    const result = await runContentWorkflow(
      {
        topic: "Approval checkpoints",
        audience: "operators",
        tone: "clear",
        goal: "educate",
        sources: ["Approval checkpoints build trust."],
        platforms: ["linkedin"]
      },
      {
        userId: "user_1",
        workspaceId: "workspace_1",
        storage,
        checkpoints,
        now: () => new Date("2026-06-19T12:00:00.000Z"),
        model: createMockModel()
      }
    );
    let saveCount = 0;
    const saveDraft = createSaveDraftTool(async () => {
      saveCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));

      return {
        draftId: "draft_once",
        status: "saved",
        savedAt: "2026-06-19T12:05:00.000Z"
      };
    });

    const [firstApproval, duplicateApproval] = await Promise.all([
      applyContentWorkflowApproval(result.run.id, {
        action: "approve",
        userId: "user_1",
        workspaceId: "workspace_1",
        storage,
        checkpoints,
        tools: { saveDraft },
        now: () => new Date("2026-06-19T12:05:00.000Z")
      }),
      applyContentWorkflowApproval(result.run.id, {
        action: "approve",
        userId: "user_1",
        workspaceId: "workspace_1",
        storage,
        checkpoints,
        tools: { saveDraft },
        now: () => new Date("2026-06-19T12:05:00.000Z")
      })
    ]);

    expect(saveCount).toBe(1);
    expect([firstApproval.workflow.status, duplicateApproval.workflow.status]).toContain("succeeded");
    await expect(checkpoints.get(result.run.id, "workspace_1")).resolves.toMatchObject({
      status: "succeeded",
      savedDraft: {
        draftId: "draft_once"
      }
    });

    const replay = await applyContentWorkflowApproval(result.run.id, {
      action: "approve",
      userId: "user_1",
      workspaceId: "workspace_1",
      storage,
      checkpoints,
      tools: { saveDraft },
      now: () => new Date("2026-06-19T12:06:00.000Z")
    });

    expect(saveCount).toBe(1);
    expect(replay.workflow.status).toBe("succeeded");
    expect(replay.draft?.draftId).toBe("draft_once");
  });
});
