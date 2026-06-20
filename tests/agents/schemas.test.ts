import { describe, expect, it } from "vitest";
import { contentPackSchema } from "@/lib/agents/schemas/content-pack";
import { platformVariantSchema } from "@/lib/agents/schemas/platform-variant";

const baseVariant = {
  id: "variant_1",
  platform: "linkedin",
  title: "LinkedIn post",
  hook: "A clear hook",
  body: "A practical body",
  cta: "Save this",
  hashtags: ["#content"],
  mediaPrompt: "Workflow visual",
  characterCount: 48,
  policyStatus: "pass",
  policyWarnings: []
};

describe("Phase 3 agent schemas", () => {
  it("validates structured content packs", () => {
    const parsed = contentPackSchema.parse({
      id: "pack_1",
      topic: "AI content operations",
      summary: "A practical content pack summary.",
      audience: "founders",
      tone: "clear",
      goal: "educate",
      ideas: [
        {
          id: "idea_1",
          title: "Make the workflow visible",
          angle: "Show the system behind the post.",
          audiencePromise: "Founders can reuse the same system."
        }
      ],
      captions: ["A reusable caption."],
      variants: [baseVariant],
      hashtags: ["#content"],
      ctaOptions: ["Save this"],
      scheduleSuggestions: [
        {
          id: "schedule_1",
          platform: "linkedin",
          scheduledFor: "2026-06-20T15:00:00.000Z",
          timezone: "America/Chicago",
          reason: "Review window",
          confidence: 0.8
        }
      ],
      warnings: [],
      createdAt: "2026-06-19T12:00:00.000Z",
      metadata: {
        provider: "openai",
        model: "gpt-4.1-mini",
        traceId: "trace_1",
        toolCallCount: 7
      }
    });

    expect(parsed.variants[0].platform).toBe("linkedin");
  });

  it("rejects invalid platform variants", () => {
    expect(() =>
      platformVariantSchema.parse({
        ...baseVariant,
        platform: "myspace"
      })
    ).toThrow();
  });
});
