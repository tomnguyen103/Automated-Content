import { describe, expect, it, beforeEach } from "vitest";
import {
  applyAcceptedBrandMemoryToProfile,
  buildBrandMemoryProposalsFromEdit,
  clearBrandMemoryProposalsForTests,
  createBrandMemoryProposalRepository,
  readBrandProfileWithAcceptedMemory
} from "@/lib/brand-memory/proposals";
import { buildBrandMemoryCurationSummary } from "@/lib/brand-memory/curator";
import { defaultBrandProfile } from "@/lib/agents/tools/read-brand-profile";
import { contentPackSchema, type ContentPack } from "@/lib/agents/schemas/content-pack";
import type { BrandMemoryProposal } from "@/lib/brand-memory/schemas";

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

function createProposal(overrides: Partial<BrandMemoryProposal> = {}) {
  return {
    id: "brand_memory_test_1",
    workspaceId,
    createdByUserId: "user_1",
    sourceAgentRunId: "run_1",
    sourceContentPackId: "pack_1",
    scope: "workspace",
    originalText: "Original copy",
    editedText: "Edited copy",
    inferredRule: "prefer concise operator language.",
    confidence: 80,
    status: "pending",
    evidence: {},
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  } satisfies BrandMemoryProposal;
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

  it("lists proposals by status, scope, platform, and confidence", async () => {
    const repository = createBrandMemoryProposalRepository({
      allowMemoryFallback: true,
      preferMemoryFallback: true
    });
    const workspaceProposal = createProposal({
      id: "brand_memory_workspace",
      confidence: 92
    });
    const linkedinProposal = createProposal({
      id: "brand_memory_linkedin",
      scope: "platform",
      platform: "linkedin",
      confidence: 76
    });
    const rejectedProposal = createProposal({
      id: "brand_memory_rejected",
      status: "rejected",
      confidence: 60
    });

    await repository.saveMany([workspaceProposal, linkedinProposal, rejectedProposal]);

    await expect(
      repository.list({
        workspaceId,
        status: "pending",
        scope: "platform",
        platform: "linkedin",
        minConfidence: 70,
        maxConfidence: 80
      })
    ).resolves.toEqual([linkedinProposal]);
  });

  it("bulk reviews proposals while preserving workspace scope", async () => {
    const repository = createBrandMemoryProposalRepository({
      allowMemoryFallback: true,
      preferMemoryFallback: true
    });

    await repository.saveMany([
      createProposal({ id: "brand_memory_bulk_1" }),
      createProposal({ id: "brand_memory_bulk_2" }),
      createProposal({
        id: "brand_memory_other_workspace",
        workspaceId: "00000000-0000-0000-0000-000000000099"
      })
    ]);

    const reviewed = await repository.reviewMany({
      workspaceId,
      ids: ["brand_memory_bulk_1", "brand_memory_bulk_2", "brand_memory_other_workspace"],
      status: "accepted",
      userId: "user_1",
      now: new Date(timestamp)
    });

    expect(reviewed).toHaveLength(2);
    expect(reviewed.map((proposal) => proposal.status).sort()).toEqual(["accepted", "accepted"]);
    await expect(repository.list({ workspaceId, status: "accepted" })).resolves.toHaveLength(2);
  });

  it("reads accepted rules through the brand profile path and excludes rejected rules", async () => {
    const repository = createBrandMemoryProposalRepository({
      allowMemoryFallback: true,
      preferMemoryFallback: true
    });
    const accepted = createProposal({
      id: "brand_memory_accepted_rule",
      status: "accepted",
      inferredRule: "keep launches grounded in operator control."
    });
    const rejected = createProposal({
      id: "brand_memory_rejected_rule",
      status: "rejected",
      inferredRule: "use hype-heavy launch claims."
    });

    await repository.saveMany([accepted, rejected]);

    const profile = await readBrandProfileWithAcceptedMemory({ workspaceId, userId: "user_1" });

    expect(profile.pillars).toContain("Learned: keep launches grounded in operator control.");
    expect(profile.pillars).not.toContain("Learned: use hype-heavy launch claims.");
  });

  it("clusters overlapping proposals and recommends the clearest merge candidate", () => {
    const accepted = createProposal({
      id: "brand_memory_cluster_accepted",
      confidence: 82,
      status: "accepted",
      inferredRule: "prefer concise operator language for launch posts.",
      editedText: "We ship launches with operator control and concise proof."
    });
    const pending = createProposal({
      id: "brand_memory_cluster_pending",
      confidence: 91,
      inferredRule: "prefer tighter operator language when writing launch copy.",
      editedText: "Keep launch copy concise and grounded in operator control."
    });
    const rejected = createProposal({
      id: "brand_memory_cluster_rejected",
      status: "rejected",
      inferredRule: "prefer hype-heavy launch claims.",
      editedText: "Launch copy should sound unstoppable."
    });

    const summary = buildBrandMemoryCurationSummary([pending, rejected, accepted]);

    expect(summary.clusters).toHaveLength(1);
    expect(summary.clusters[0]).toMatchObject({
      proposalIds: ["brand_memory_cluster_pending", "brand_memory_cluster_accepted"],
      averageConfidence: 87,
      statusCounts: {
        accepted: 1,
        pending: 1,
        rejected: 0
      }
    });
    expect(summary.mergeSuggestions).toHaveLength(1);
    expect(summary.mergeSuggestions[0]).toMatchObject({
      proposalIds: ["brand_memory_cluster_pending", "brand_memory_cluster_accepted"],
      recommendedRule: accepted.inferredRule
    });
  });

  it("flags contradictions before conflicting memory can be accepted", () => {
    const concise = createProposal({
      id: "brand_memory_conflict_concise",
      status: "accepted",
      inferredRule: "prefer concise first-person operator language for launch copy.",
      editedText: "We keep launches concise."
    });
    const longForm = createProposal({
      id: "brand_memory_conflict_long",
      inferredRule: "use expanded long-form launch copy with more context.",
      editedText: "We keep launches concise, then add detailed setup and more context."
    });

    const summary = buildBrandMemoryCurationSummary([concise, longForm]);

    expect(summary.contradictionWarnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dimension: "brevity",
          proposalIds: ["brand_memory_conflict_concise", "brand_memory_conflict_long"],
          severity: "blocked"
        })
      ])
    );
  });
});
