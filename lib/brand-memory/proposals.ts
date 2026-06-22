import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { getDb, type DatabaseClient } from "@/db";
import { brandMemoryProposals } from "@/db/schema";
import {
  brandMemoryProposalSchema,
  type BrandMemoryProposal,
  type BrandMemoryProposalStatus
} from "@/lib/brand-memory/schemas";
import { contentPackSchema, type ContentPack } from "@/lib/agents/schemas/content-pack";
import { socialPlatformSchema } from "@/lib/agents/schemas/platform-variant";
import {
  brandProfileOutputSchema,
  defaultBrandProfile,
  type BrandProfileInput,
  type BrandProfileOutput
} from "@/lib/agents/tools/read-brand-profile";
import { isDatabaseConfigured } from "@/lib/env";

export type BrandMemoryProposalRepository = {
  saveMany: (proposals: BrandMemoryProposal[]) => Promise<BrandMemoryProposal[]>;
  list: (input: {
    workspaceId: string;
    status?: BrandMemoryProposalStatus;
    limit?: number;
  }) => Promise<BrandMemoryProposal[]>;
  review: (input: {
    workspaceId: string;
    id: string;
    status: Extract<BrandMemoryProposalStatus, "accepted" | "rejected">;
    userId: string;
    now?: Date;
  }) => Promise<BrandMemoryProposal | null>;
};

export type BuildBrandMemoryProposalsInput = {
  workspaceId: string;
  userId: string;
  agentRunId?: string;
  before: ContentPack;
  after: ContentPack;
  now?: Date;
};

const MAX_LEARNED_RULES = 4;
const DEFAULT_PROPOSAL_LIMIT = 25;
const sharedMemoryProposals = new Map<string, BrandMemoryProposal>();

function toIso(value: Date | string | null | undefined) {
  if (!value) {
    return undefined;
  }

  return value instanceof Date ? value.toISOString() : value;
}

function proposalFromRow(row: typeof brandMemoryProposals.$inferSelect): BrandMemoryProposal {
  return brandMemoryProposalSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    createdByUserId: row.createdByUserId ?? undefined,
    sourceAgentRunId: row.sourceAgentRunId ?? undefined,
    sourceContentPackId: row.sourceContentPackId ?? undefined,
    sourceVariantId: row.sourceVariantId ?? undefined,
    scope: row.scope,
    platform: row.platform ?? undefined,
    originalText: row.originalText,
    editedText: row.editedText,
    inferredRule: row.inferredRule,
    confidence: row.confidence,
    status: row.status,
    evidence: row.evidence,
    reviewedByUserId: row.reviewedByUserId ?? undefined,
    reviewedAt: toIso(row.reviewedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  });
}

function proposalToRow(proposal: BrandMemoryProposal) {
  return {
    id: proposal.id,
    workspaceId: proposal.workspaceId,
    createdByUserId: proposal.createdByUserId ?? null,
    sourceAgentRunId: proposal.sourceAgentRunId ?? null,
    sourceContentPackId: proposal.sourceContentPackId ?? null,
    sourceVariantId: proposal.sourceVariantId ?? null,
    scope: proposal.scope,
    platform: proposal.platform ? socialPlatformSchema.parse(proposal.platform) : null,
    originalText: proposal.originalText,
    editedText: proposal.editedText,
    inferredRule: proposal.inferredRule,
    confidence: proposal.confidence,
    status: proposal.status,
    evidence: proposal.evidence,
    reviewedByUserId: proposal.reviewedByUserId ?? null,
    reviewedAt: proposal.reviewedAt ? new Date(proposal.reviewedAt) : null,
    createdAt: new Date(proposal.createdAt),
    updatedAt: new Date(proposal.updatedAt)
  };
}

function normalizeText(value: string | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function wordCount(value: string) {
  return normalizeText(value).split(" ").filter(Boolean).length;
}

function inferRule({
  edited,
  original,
  platform,
  topic
}: {
  original: string;
  edited: string;
  platform?: string;
  topic: string;
}) {
  const originalWords = wordCount(original);
  const editedWords = wordCount(edited);
  const platformPrefix = platform ? `For ${platform}, ` : "";
  const normalizedEdited = edited.toLowerCase();

  if (editedWords > 0 && originalWords > editedWords * 1.3) {
    return `${platformPrefix}prefer tighter copy that removes extra setup while preserving the concrete takeaway.`;
  }

  if (/\b(we|our|i|my)\b/.test(normalizedEdited)) {
    return `${platformPrefix}keep approved copy in a founder-led first-person voice when the topic is ${topic}.`;
  }

  if (edited.includes("\n")) {
    return `${platformPrefix}use scannable line breaks when an approved edit separates hooks, proof, and call to action.`;
  }

  return `${platformPrefix}prefer the phrasing pattern from approved edits when generating future copy about ${topic}.`;
}

function buildProposal({
  agentRunId,
  after,
  beforeText,
  evidence,
  platform,
  scope,
  sourceVariantId,
  userId,
  workspaceId,
  now
}: {
  workspaceId: string;
  userId: string;
  agentRunId?: string;
  after: ContentPack;
  beforeText: string;
  evidence: Record<string, unknown>;
  platform?: string;
  scope: "workspace" | "platform";
  sourceVariantId?: string;
  now: Date;
}): BrandMemoryProposal | null {
  const editedText = sourceVariantId
    ? after.variants.find((variant) => variant.id === sourceVariantId)?.body
    : after.captions[0];
  const originalText = normalizeText(beforeText);
  const normalizedEdited = normalizeText(editedText);

  if (!originalText || !normalizedEdited || originalText === normalizedEdited) {
    return null;
  }

  const timestamp = now.toISOString();

  return brandMemoryProposalSchema.parse({
    id: `brand_memory_${crypto.randomUUID()}`,
    workspaceId,
    createdByUserId: userId,
    sourceAgentRunId: agentRunId,
    sourceContentPackId: after.id,
    sourceVariantId,
    scope,
    platform,
    originalText,
    editedText: normalizedEdited,
    inferredRule: inferRule({
      original: originalText,
      edited: normalizedEdited,
      platform,
      topic: after.topic
    }),
    confidence: scope === "platform" ? 78 : 74,
    status: "pending",
    evidence,
    createdAt: timestamp,
    updatedAt: timestamp
  });
}

export function buildBrandMemoryProposalsFromEdit(input: BuildBrandMemoryProposalsInput) {
  const before = contentPackSchema.parse(input.before);
  const after = contentPackSchema.parse(input.after);
  const now = input.now ?? new Date();
  const proposals: BrandMemoryProposal[] = [];
  const primaryCaptionProposal = buildProposal({
    workspaceId: input.workspaceId,
    userId: input.userId,
    agentRunId: input.agentRunId,
    beforeText: before.captions[0],
    after,
    scope: "workspace",
    now,
    evidence: {
      changedFields: ["captions[0]"],
      contentPackId: after.id,
      originalLength: normalizeText(before.captions[0]).length,
      editedLength: normalizeText(after.captions[0]).length,
      topic: after.topic
    }
  });

  if (primaryCaptionProposal) {
    proposals.push(primaryCaptionProposal);
  }

  for (const afterVariant of after.variants) {
    const beforeVariant = before.variants.find((variant) => variant.id === afterVariant.id);

    if (!beforeVariant || normalizeText(beforeVariant.body) === normalizeText(afterVariant.body)) {
      continue;
    }

    const variantProposal = buildProposal({
      workspaceId: input.workspaceId,
      userId: input.userId,
      agentRunId: input.agentRunId,
      beforeText: beforeVariant.body,
      after,
      scope: "platform",
      platform: afterVariant.platform,
      sourceVariantId: afterVariant.id,
      now,
      evidence: {
        changedFields: [`variants.${afterVariant.platform}.body`],
        contentPackId: after.id,
        originalLength: normalizeText(beforeVariant.body).length,
        editedLength: normalizeText(afterVariant.body).length,
        platform: afterVariant.platform,
        topic: after.topic
      }
    });

    if (variantProposal) {
      proposals.push(variantProposal);
    }

    if (proposals.length >= 3) {
      break;
    }
  }

  return proposals;
}

function createMemoryBrandMemoryProposalRepository(): BrandMemoryProposalRepository & { clear: () => void } {
  return {
    async saveMany(proposals) {
      const parsed = proposals.map((proposal) => brandMemoryProposalSchema.parse(proposal));

      for (const proposal of parsed) {
        sharedMemoryProposals.set(proposal.id, proposal);
      }

      return parsed;
    },

    async list({ workspaceId, status, limit = DEFAULT_PROPOSAL_LIMIT }) {
      return [...sharedMemoryProposals.values()]
        .filter((proposal) => proposal.workspaceId === workspaceId && (!status || proposal.status === status))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, Math.max(1, Math.min(100, Math.floor(limit))));
    },

    async review({ workspaceId, id, status, userId, now = new Date() }) {
      const existing = sharedMemoryProposals.get(id);

      if (!existing || existing.workspaceId !== workspaceId) {
        return null;
      }

      const reviewed = brandMemoryProposalSchema.parse({
        ...existing,
        status,
        reviewedByUserId: userId,
        reviewedAt: now.toISOString(),
        updatedAt: now.toISOString()
      });

      sharedMemoryProposals.set(id, reviewed);
      return reviewed;
    },

    clear() {
      sharedMemoryProposals.clear();
    }
  };
}

export function createDatabaseBrandMemoryProposalRepository(
  db: DatabaseClient = getDb()
): BrandMemoryProposalRepository {
  return {
    async saveMany(proposals) {
      const parsed = proposals.map((proposal) => brandMemoryProposalSchema.parse(proposal));

      if (parsed.length === 0) {
        return [];
      }

      await db
        .insert(brandMemoryProposals)
        .values(parsed.map(proposalToRow))
        .onConflictDoNothing({
          target: brandMemoryProposals.id
        });

      return parsed;
    },

    async list({ workspaceId, status, limit = DEFAULT_PROPOSAL_LIMIT }) {
      const rows = await db
        .select()
        .from(brandMemoryProposals)
        .where(
          status
            ? and(eq(brandMemoryProposals.workspaceId, workspaceId), eq(brandMemoryProposals.status, status))
            : eq(brandMemoryProposals.workspaceId, workspaceId)
        )
        .orderBy(desc(brandMemoryProposals.createdAt))
        .limit(Math.max(1, Math.min(100, Math.floor(limit))));

      return rows.map(proposalFromRow);
    },

    async review({ workspaceId, id, status, userId, now = new Date() }) {
      const [row] = await db
        .update(brandMemoryProposals)
        .set({
          status,
          reviewedByUserId: userId,
          reviewedAt: now,
          updatedAt: now
        })
        .where(and(eq(brandMemoryProposals.workspaceId, workspaceId), eq(brandMemoryProposals.id, id)))
        .returning();

      return row ? proposalFromRow(row) : null;
    }
  };
}

const sharedMemoryBrandMemoryProposalRepository = createMemoryBrandMemoryProposalRepository();

export function createBrandMemoryProposalRepository({
  allowMemoryFallback = false,
  preferMemoryFallback = false
} = {}) {
  if (allowMemoryFallback && preferMemoryFallback) {
    return sharedMemoryBrandMemoryProposalRepository;
  }

  if (isDatabaseConfigured) {
    return createDatabaseBrandMemoryProposalRepository();
  }

  if (allowMemoryFallback) {
    return sharedMemoryBrandMemoryProposalRepository;
  }

  throw new Error("DATABASE_URL is required for brand memory persistence.");
}

export function clearBrandMemoryProposalsForTests() {
  sharedMemoryBrandMemoryProposalRepository.clear();
}

export function applyAcceptedBrandMemoryToProfile(
  profile: BrandProfileOutput,
  proposals: BrandMemoryProposal[]
): BrandProfileOutput {
  const acceptedRules = proposals
    .filter((proposal) => proposal.status === "accepted")
    .map((proposal) => proposal.inferredRule.trim())
    .filter(Boolean)
    .filter((rule, index, rules) => rules.indexOf(rule) === index)
    .slice(0, MAX_LEARNED_RULES);

  if (acceptedRules.length === 0) {
    return brandProfileOutputSchema.parse(profile);
  }

  const learnedPillars = acceptedRules
    .map((rule) => `Learned: ${rule}`)
    .filter((pillar, index, pillars) => pillars.indexOf(pillar) === index);
  const retainedPillars = profile.pillars
    .filter((pillar) => !learnedPillars.includes(pillar))
    .slice(0, Math.max(0, 8 - learnedPillars.length));

  return brandProfileOutputSchema.parse({
    ...profile,
    pillars: [...retainedPillars, ...learnedPillars].slice(0, 8)
  });
}

export async function readBrandProfileWithAcceptedMemory(
  input: BrandProfileInput,
  baseProfile: BrandProfileOutput = defaultBrandProfile
): Promise<BrandProfileOutput> {
  try {
    const proposals = await createBrandMemoryProposalRepository({ allowMemoryFallback: true }).list({
      workspaceId: input.workspaceId,
      status: "accepted",
      limit: MAX_LEARNED_RULES
    });

    return applyAcceptedBrandMemoryToProfile(baseProfile, proposals);
  } catch {
    return brandProfileOutputSchema.parse(baseProfile);
  }
}
