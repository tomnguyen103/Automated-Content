import { describe, expect, it, beforeEach } from "vitest";
import {
  applyAcceptedBrandMemoryToProfile,
  buildBrandMemoryProposalsFromEdit,
  clearBrandMemoryProposalsForTests,
  createBrandMemoryProposalRepository
} from "@/lib/brand-memory/proposals";
import { defaultBrandProfile } from "@/lib/agents/tools/read-brand-profile";
import { contentPackSchema, type ContentPack } from "@/lib/agents/schemas/content-pack";

const workspaceId = "00000000-0000-0000-0000-000000000001";
const timestamp = "2026-06-22T12:00:00.000Z";

function createContentPack(overrides: Partial<ContentPack> = {}) {
  return contentPackSchema.parse({
    id: "pack_1",
    topic: "Agent governance",
    summary: "A governed content pack.",
    audience: "founders",
    tone: "clear",
    goal: "educate",
    ideas: [
      {
        id: "idea_1",
        title: "Governed agents",
        angle: "Review before autonomy",
        audiencePromise: "Safer agent operations"
      }
    ],
    captions: ["Autonomous agents need clear review gates before they touch customer-facing channels."],
    variants: [
      {
        id: "variant_linkedin",
        platform: "linkedin",
        title: "Governed agents",
        hook: "Autonomy needs review gates.",
        body: "Autonomous agents need clear review gates before they touch customer-facing channels.",
        cta: "Reply with your current review step.",
        hashtags: ["#agents"],
        media: [],
        characterCount: 88,
        policyStatus: "pass",
        policyWarnings: []
      }
    ],
    hashtags: ["#agents"],
    ctaOptions: ["Reply with your current review step."],
    scheduleSuggestions: [],
    warnings: [],
    createdAt: timestamp,
    metadata: {
      provider: "gemini",
      model: "mock",
      traceId: "trace_1",
      toolCallCount: 3
    },
    ...overrides
  });
}

describe("brand memory proposals", () => {
  beforeEach(() => {
    clearBrandMemoryProposalsForTests();
  });

  it("turns approved edits into pending proposals and only applies accepted rules", async () => {
    const before = createContentPack();
    const after = createContentPack({
      captions: ["We keep agents useful by putting human review before every customer-facing action."],
      variants: [
        {
          ...before.variants[0],
          body: "We keep agents useful by putting human review before every customer-facing action.",
          characterCount: 78
        }
      ]
    });
    const proposals = buildBrandMemoryProposalsFromEdit({
      workspaceId,
      userId: "user_1",
      agentRunId: "run_1",
      before,
      after,
      now: new Date(timestamp)
    });

    expect(proposals).toHaveLength(2);
    expect(proposals[0]).toMatchObject({
      status: "pending",
      sourceAgentRunId: "run_1",
      originalText: before.captions[0],
      editedText: after.captions[0]
    });
    expect(applyAcceptedBrandMemoryToProfile(defaultBrandProfile, proposals).pillars).toEqual(
      defaultBrandProfile.pillars
    );

    const repository = createBrandMemoryProposalRepository({
      allowMemoryFallback: true,
      preferMemoryFallback: true
    });
    await repository.saveMany(proposals);
    const accepted = await repository.review({
      workspaceId,
      id: proposals[0].id,
      status: "accepted",
      userId: "user_1",
      now: new Date(timestamp)
    });
    await repository.review({
      workspaceId,
      id: proposals[1].id,
      status: "rejected",
      userId: "user_1",
      now: new Date(timestamp)
    });

    const profile = applyAcceptedBrandMemoryToProfile(defaultBrandProfile, accepted ? [accepted] : []);

    expect(profile.pillars).toContain(`Learned: ${accepted?.inferredRule}`);
    await expect(repository.list({ workspaceId, status: "accepted" })).resolves.toEqual([accepted]);
  });

  it("reserves room for accepted memory when a brand profile already has maximum pillars", () => {
    const fullProfile = {
      ...defaultBrandProfile,
      pillars: ["one", "two", "three", "four", "five", "six", "seven", "eight"]
    };
    const profile = applyAcceptedBrandMemoryToProfile(fullProfile, [
      {
        id: "brand_memory_full_1",
        workspaceId,
        inferredRule: "prefer concise operator language.",
        confidence: 80,
        status: "accepted",
        scope: "workspace",
        originalText: "Long copy",
        editedText: "Concise copy",
        evidence: {},
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ]);

    expect(profile.pillars).toHaveLength(8);
    expect(profile.pillars).toContain("Learned: prefer concise operator language.");
  });
});
