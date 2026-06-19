import { describe, expect, it } from "vitest";
import { createCheckPlatformPolicyTool } from "@/lib/agents/tools/check-platform-policy";
import { createGeneratePlatformVariantTool } from "@/lib/agents/tools/generate-platform-variant";
import { createReadBrandProfileTool } from "@/lib/agents/tools/read-brand-profile";
import { createResearchTopicTool } from "@/lib/agents/tools/research-topic";
import { createRetrievePastPostsTool } from "@/lib/agents/tools/retrieve-past-posts";
import { createSaveDraftTool, type SaveDraftInput } from "@/lib/agents/tools/save-draft";
import { createSuggestScheduleTool } from "@/lib/agents/tools/suggest-schedule";

const context = {
  traceId: "trace_test",
  now: () => new Date("2026-06-19T12:00:00.000Z")
};

describe("Phase 3 LangChain tools", () => {
  it("researches a topic from fixture input", async () => {
    const output = await createResearchTopicTool().execute(
      {
        topic: "AI content calendars",
        audience: "founders",
        sources: ["Batch content before scheduling."]
      },
      context
    );

    expect(output.angles.length).toBeGreaterThan(0);
    expect(output.keywords).toContain("content");
  });

  it("reads a brand profile with safe defaults", async () => {
    const output = await createReadBrandProfileTool().execute(
      {
        workspaceId: "workspace_1",
        userId: "user_1"
      },
      context
    );

    expect(output.pillars).toContain("human review");
  });

  it("retrieves past posts by requested platforms", async () => {
    const output = await createRetrievePastPostsTool().execute(
      {
        workspaceId: "workspace_1",
        topic: "content systems",
        platforms: ["linkedin", "x"]
      },
      context
    );

    expect(output.posts.map((post) => post.platform)).toEqual(["linkedin", "x"]);
  });

  it("generates a platform variant", async () => {
    const output = await createGeneratePlatformVariantTool().execute(
      {
        topic: "content systems",
        platform: "linkedin",
        ideaTitle: "Make the workflow visible",
        angle: "Show the system",
        audience: "founders",
        tone: "clear",
        goal: "educate",
        hashtags: ["#content"]
      },
      context
    );

    expect(output.platform).toBe("linkedin");
    expect(output.body).toContain("content systems");
    expect(output.characterCount).toBe([output.hook, output.body, output.cta, output.hashtags.join(" ")].join(" ").length);
  });

  it("checks platform policy warnings", async () => {
    const variant = await createGeneratePlatformVariantTool().execute(
      {
        topic: "content systems",
        platform: "x",
        ideaTitle: "Make the workflow visible",
        angle: "Show the system",
        audience: "founders",
        tone: "clear",
        goal: "educate",
        hashtags: ["#content"]
      },
      context
    );
    const output = await createCheckPlatformPolicyTool().execute({ variant }, context);

    expect(["pass", "warn", "block"]).toContain(output.status);
    expect(output.checkedAt).toBe("2026-06-19T12:00:00.000Z");
  });

  it("suggests schedule slots", async () => {
    const output = await createSuggestScheduleTool().execute(
      {
        topic: "content systems",
        platforms: ["linkedin", "x"],
        timezone: "America/Chicago",
        startDate: "2026-06-19T12:00:00.000Z"
      },
      context
    );

    expect(output.suggestions).toHaveLength(2);
    expect(output.suggestions[0].platform).toBe("linkedin");
    expect(output.suggestions[0].scheduledFor).toBe("2026-06-20T20:00:00.000Z");
  });

  it("rejects invalid schedule start dates", async () => {
    await expect(
      createSuggestScheduleTool().execute(
        {
          topic: "content systems",
          platforms: ["linkedin"],
          timezone: "America/Chicago",
          startDate: "not-a-date"
        },
        context
      )
    ).rejects.toThrow("Invalid startDate");
  });

  it("saves drafts through an injected dependency", async () => {
    let savedInput: SaveDraftInput | null = null;
    const variant = await createGeneratePlatformVariantTool().execute(
      {
        topic: "content systems",
        platform: "linkedin",
        ideaTitle: "Make the workflow visible",
        angle: "Show the system",
        audience: "founders",
        tone: "clear",
        goal: "educate",
        hashtags: ["#content"]
      },
      context
    );
    const output = await createSaveDraftTool((input) => {
      savedInput = input;

      return {
        draftId: "draft_fixture",
        status: "saved",
        savedAt: "2026-06-19T12:00:00.000Z"
      };
    }).execute(
      {
        workspaceId: "workspace_1",
        userId: "user_1",
        sources: ["Fixture source"],
        contentPack: {
          id: "pack_1",
          topic: "content systems",
          summary: "Summary",
          audience: "founders",
          tone: "clear",
          goal: "educate",
          ideas: [
            {
              id: "idea_1",
              title: "Make the workflow visible",
              angle: "Show the system",
              audiencePromise: "Founders can reuse it."
            }
          ],
          captions: ["Caption"],
          variants: [variant],
          hashtags: ["#content"],
          ctaOptions: ["Save this"],
          scheduleSuggestions: [],
          warnings: [],
          createdAt: "2026-06-19T12:00:00.000Z",
          metadata: {
            provider: "openai",
            model: "gpt-4.1-mini",
            traceId: "trace_test",
            toolCallCount: 1
          }
        }
      },
      context
    );

    expect(output.status).toBe("saved");
    expect(output.draftId).toBe("draft_fixture");
    expect(savedInput).not.toBeNull();
    const saved = savedInput as unknown as SaveDraftInput;
    expect(saved.contentPack.id).toBe("pack_1");
    expect(saved.sources).toEqual(["Fixture source"]);
  });
});
