import { describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "@/db";
import { createDatabaseAgentStorage } from "@/lib/agents/langchain/storage";
import type { ContentPack } from "@/lib/agents/schemas/content-pack";
import type { MediaAttachment } from "@/lib/media/types";

const mediaAttachment: MediaAttachment = {
  assetId: "media_1",
  provider: "imagekit",
  name: "Launch image",
  url: "https://ik.imagekit.io/test/launch-image.png",
  thumbnailUrl: "https://ik.imagekit.io/test/launch-image-thumb.png",
  mediaType: "image",
  mimeType: "image/png",
  width: 1200,
  height: 900,
  sizeBytes: 24000,
  altText: "Launch image"
};

function createContentPack(): ContentPack {
  return {
    id: "content_pack_1",
    topic: "Launch workflow",
    summary: "Summary",
    audience: "operators",
    tone: "clear",
    goal: "educate",
    ideas: [
      {
        id: "idea_1",
        title: "Launch idea",
        angle: "Show the system",
        audiencePromise: "Understand the workflow"
      }
    ],
    captions: ["Caption"],
    variants: [
      {
        id: "variant_1",
        platform: "linkedin",
        title: "Launch post",
        hook: "Hook",
        body: "Body",
        cta: "CTA",
        hashtags: ["#launch"],
        media: [mediaAttachment],
        mediaPrompt: "Use the uploaded launch image",
        characterCount: 10,
        policyStatus: "pass",
        policyWarnings: []
      }
    ],
    hashtags: ["#launch"],
    ctaOptions: ["CTA"],
    scheduleSuggestions: [],
    warnings: [],
    createdAt: "2026-06-20T18:00:00.000Z",
    metadata: {
      provider: "gemini",
      model: "mock-gemini",
      traceId: "trace_1",
      toolCallCount: 3
    }
  };
}

describe("agent storage", () => {
  it("persists approved media attachments into platform variant rows", async () => {
    const insertedValues: unknown[] = [];
    const tx = {
      insert: vi.fn(() => ({
        values: vi.fn(async (values: unknown) => {
          insertedValues.push(values);
        })
      }))
    };
    const db = {
      transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx))
    } as unknown as DatabaseClient;
    const storage = createDatabaseAgentStorage(db);

    await storage.saveDraft({
      draftId: "draft_1",
      savedAt: "2026-06-20T18:05:00.000Z",
      workspaceId: "workspace_1",
      userId: "user_1",
      sources: ["Source"],
      contentPack: createContentPack()
    });

    const platformInsert = insertedValues.find(Array.isArray) as Array<{ media?: unknown }> | undefined;

    expect(platformInsert?.[0]?.media).toEqual([mediaAttachment]);
  });
});
