import "server-only";

import { and, eq } from "drizzle-orm";
import { getDb, type DatabaseClient } from "@/db";
import { agentRuns, contentDrafts, contentTopics, platformVariants } from "@/db/schema";
import { agentRunSchema, type AgentRun } from "@/lib/agents/schemas/agent-run";
import type { ContentPack } from "@/lib/agents/schemas/content-pack";
import { isDatabaseConfigured } from "@/lib/env";
import type { SaveDraftInput, SaveDraftOutput } from "@/lib/agents/tools/save-draft";

type SaveDraftParams = SaveDraftInput & {
  draftId: string;
  savedAt: string;
};

export type AgentStorage = {
  saveRun: (run: AgentRun) => Promise<AgentRun>;
  getRun: (runId: string, workspaceId: string) => Promise<AgentRun | null>;
  saveDraft: (input: SaveDraftParams) => Promise<SaveDraftOutput>;
};

type StoredDraft = SaveDraftOutput & {
  workspaceId: string;
  userId: string;
  contentPack: ContentPack;
};

function toDate(value: string | undefined) {
  return value ? new Date(value) : null;
}

function toJsonRecord(value: unknown) {
  return value as Record<string, unknown>;
}

function toJsonRecords(value: unknown[]) {
  return value as Array<Record<string, unknown>>;
}

export function createDatabaseAgentStorage(db: DatabaseClient = getDb()): AgentStorage {
  return {
    async saveRun(run) {
      const parsed = agentRunSchema.parse(run);
      const now = new Date();

      await db
        .insert(agentRuns)
        .values({
          id: parsed.id,
          workspaceId: parsed.workspaceId,
          userId: parsed.userId,
          traceId: parsed.traceId,
          status: parsed.status,
          provider: parsed.provider,
          model: parsed.model,
          input: toJsonRecord(parsed.input),
          output: parsed.output ? toJsonRecord(parsed.output) : null,
          toolCalls: toJsonRecords(parsed.toolCalls),
          error: parsed.error ?? null,
          startedAt: new Date(parsed.startedAt),
          completedAt: toDate(parsed.completedAt),
          updatedAt: now
        })
        .onConflictDoUpdate({
          target: agentRuns.id,
          set: {
            status: parsed.status,
            output: parsed.output ? toJsonRecord(parsed.output) : null,
            toolCalls: toJsonRecords(parsed.toolCalls),
            error: parsed.error ?? null,
            completedAt: toDate(parsed.completedAt),
            updatedAt: now
          }
        });

      return parsed;
    },

    async getRun(runId, workspaceId) {
      const [row] = await db
        .select()
        .from(agentRuns)
        .where(and(eq(agentRuns.id, runId), eq(agentRuns.workspaceId, workspaceId)))
        .limit(1);

      if (!row) {
        return null;
      }

      return agentRunSchema.parse({
        id: row.id,
        traceId: row.traceId,
        status: row.status,
        provider: row.provider,
        model: row.model,
        userId: row.userId,
        workspaceId: row.workspaceId,
        input: row.input,
        output: row.output ?? undefined,
        toolCalls: row.toolCalls,
        error: row.error ?? undefined,
        startedAt: row.startedAt.toISOString(),
        completedAt: row.completedAt?.toISOString()
      });
    },

    async saveDraft(input) {
      const now = new Date(input.savedAt);
      const topicId = `topic_${crypto.randomUUID()}`;

      await db.insert(contentTopics).values({
        id: topicId,
        workspaceId: input.workspaceId,
        createdByUserId: input.userId,
        topic: input.contentPack.topic,
        audience: input.contentPack.audience,
        tone: input.contentPack.tone,
        goal: input.contentPack.goal,
        sources: input.sources,
        platforms: input.contentPack.variants.map((variant) => variant.platform),
        updatedAt: now
      });

      await db.insert(contentDrafts).values({
        id: input.draftId,
        workspaceId: input.workspaceId,
        createdByUserId: input.userId,
        topicId,
        agentRunId: input.agentRunId ?? null,
        contentPackId: input.contentPack.id,
        status: "draft",
        title: input.contentPack.ideas[0]?.title ?? input.contentPack.topic,
        contentPack: toJsonRecord(input.contentPack),
        savedAt: now,
        updatedAt: now
      });

      if (input.contentPack.variants.length > 0) {
        await db.insert(platformVariants).values(
          input.contentPack.variants.map((variant) => ({
            id: variant.id,
            workspaceId: input.workspaceId,
            draftId: input.draftId,
            platform: variant.platform,
            title: variant.title,
            hook: variant.hook,
            body: variant.body,
            cta: variant.cta,
            hashtags: variant.hashtags,
            mediaPrompt: variant.mediaPrompt ?? null,
            characterCount: variant.characterCount,
            policyStatus: variant.policyStatus,
            policyWarnings: variant.policyWarnings,
            updatedAt: now
          }))
        );
      }

      return {
        draftId: input.draftId,
        status: "saved",
        savedAt: input.savedAt
      };
    }
  };
}

export function createMemoryAgentStorage(): AgentStorage & {
  clear: () => void;
  getDraft: (draftId: string) => StoredDraft | null;
} {
  const runs = new Map<string, AgentRun>();
  const drafts = new Map<string, StoredDraft>();

  return {
    async saveRun(run) {
      const parsed = agentRunSchema.parse(run);
      runs.set(parsed.id, parsed);
      return parsed;
    },
    async getRun(runId, workspaceId) {
      const run = runs.get(runId);

      if (!run || run.workspaceId !== workspaceId) {
        return null;
      }

      return run;
    },
    async saveDraft(input) {
      const output = {
        draftId: input.draftId,
        status: "saved" as const,
        savedAt: input.savedAt
      };

      drafts.set(input.draftId, {
        ...output,
        workspaceId: input.workspaceId,
        userId: input.userId,
        contentPack: input.contentPack
      });

      return output;
    },
    clear() {
      runs.clear();
      drafts.clear();
    },
    getDraft(draftId) {
      return drafts.get(draftId) ?? null;
    }
  };
}

const sharedMemoryStorage = createMemoryAgentStorage();

export function createAgentStorage({ allowMemoryFallback = false } = {}) {
  if (allowMemoryFallback) {
    return sharedMemoryStorage;
  }

  if (isDatabaseConfigured) {
    return createDatabaseAgentStorage();
  }

  throw new Error("DATABASE_URL is required for agent persistence.");
}

export function clearAgentStorageForTests() {
  sharedMemoryStorage.clear();
}

export function getSavedDraftForTests(draftId: string) {
  return sharedMemoryStorage.getDraft(draftId);
}
