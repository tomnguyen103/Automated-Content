import { describe, expect, it } from "vitest";
import { runContentAgent } from "@/lib/agents/langchain/content-agent";
import { createContentModel } from "@/lib/agents/langchain/model-factory";
import { createMemoryAgentStorage } from "@/lib/agents/langchain/storage";

describe("content agent integration", () => {
  it("runs with a mock model and records metadata", async () => {
    const storage = createMemoryAgentStorage();
    const result = await runContentAgent(
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
        now: () => new Date("2026-06-19T12:00:00.000Z"),
        model: createContentModel({
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
        })
      }
    );

    expect(result.run.status).toBe("succeeded");
    expect(result.run.provider).toBe("gemini");
    expect(result.contentPack.variants).toHaveLength(2);
    expect(result.contentPack.scheduleSuggestions.every((suggestion) => suggestion.timezone === "UTC")).toBe(true);
    expect(result.contentPack.metadata.toolCallCount).toBe(result.run.toolCalls.length - 1);
    expect(result.run.toolCalls.map((call) => call.name)).toContain("save_draft");
    await expect(storage.getRun(result.run.id, "workspace_1")).resolves.toMatchObject({
      id: result.run.id,
      status: "succeeded"
    });
    expect(storage.getDraft(result.draft.draftId)?.contentPack.id).toBe(result.contentPack.id);
  });
});
