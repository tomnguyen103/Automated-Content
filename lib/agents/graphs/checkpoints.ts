import "server-only";

import { and, eq } from "drizzle-orm";
import { getDb, type DatabaseClient } from "@/db";
import { workflowCheckpoints } from "@/db/schema";
import { isDatabaseConfigured } from "@/lib/env";
import {
  contentWorkflowStateSchema,
  type ContentWorkflowState,
  type ContentWorkflowStatus
} from "@/lib/agents/graphs/state";

export type ContentWorkflowCheckpointStore = {
  save: (state: ContentWorkflowState) => Promise<ContentWorkflowState>;
  get: (runId: string, workspaceId: string) => Promise<ContentWorkflowState | null>;
  transition: (
    state: ContentWorkflowState,
    expected: {
      status: ContentWorkflowStatus;
      updatedAt: string;
    }
  ) => Promise<{
    state: ContentWorkflowState | null;
    transitioned: boolean;
  }>;
};

function toJsonRecord(value: unknown) {
  return value as Record<string, unknown>;
}

export function createDatabaseContentWorkflowCheckpointStore(
  db: DatabaseClient = getDb()
): ContentWorkflowCheckpointStore {
  return {
    async save(state) {
      const parsed = contentWorkflowStateSchema.parse(state);
      const now = new Date(parsed.updatedAt);

      await db
        .insert(workflowCheckpoints)
        .values({
          id: parsed.runId,
          workspaceId: parsed.workspaceId,
          runId: parsed.runId,
          userId: parsed.userId,
          traceId: parsed.traceId,
          status: parsed.status,
          approvalStatus: parsed.approvalStatus,
          currentNode: parsed.currentNode,
          state: toJsonRecord(parsed),
          updatedAt: now
        })
        .onConflictDoUpdate({
          target: workflowCheckpoints.id,
          set: {
            traceId: parsed.traceId,
            status: parsed.status,
            approvalStatus: parsed.approvalStatus,
            currentNode: parsed.currentNode,
            state: toJsonRecord(parsed),
            updatedAt: now
          }
        });

      return parsed;
    },

    async transition(state, expected) {
      const parsed = contentWorkflowStateSchema.parse(state);
      const now = new Date(parsed.updatedAt);
      const updatedRows = await db
        .update(workflowCheckpoints)
        .set({
          traceId: parsed.traceId,
          status: parsed.status,
          approvalStatus: parsed.approvalStatus,
          currentNode: parsed.currentNode,
          state: toJsonRecord(parsed),
          updatedAt: now
        })
        .where(
          and(
            eq(workflowCheckpoints.runId, parsed.runId),
            eq(workflowCheckpoints.workspaceId, parsed.workspaceId),
            eq(workflowCheckpoints.status, expected.status),
            eq(workflowCheckpoints.updatedAt, new Date(expected.updatedAt))
          )
        )
        .returning({
          state: workflowCheckpoints.state
        });

      if (updatedRows[0]) {
        return {
          state: contentWorkflowStateSchema.parse(updatedRows[0].state),
          transitioned: true
        };
      }

      return {
        state: await this.get(parsed.runId, parsed.workspaceId),
        transitioned: false
      };
    },

    async get(runId, workspaceId) {
      const [row] = await db
        .select()
        .from(workflowCheckpoints)
        .where(and(eq(workflowCheckpoints.runId, runId), eq(workflowCheckpoints.workspaceId, workspaceId)))
        .limit(1);

      return row ? contentWorkflowStateSchema.parse(row.state) : null;
    }
  };
}

export function createMemoryContentWorkflowCheckpointStore(): ContentWorkflowCheckpointStore & {
  clear: () => void;
} {
  const states = new Map<string, ContentWorkflowState>();

  function key(runId: string, workspaceId: string) {
    return `${workspaceId}:${runId}`;
  }

  return {
    async save(state) {
      const parsed = contentWorkflowStateSchema.parse(state);
      states.set(key(parsed.runId, parsed.workspaceId), parsed);
      return parsed;
    },

    async transition(state, expected) {
      const parsed = contentWorkflowStateSchema.parse(state);
      const checkpointKey = key(parsed.runId, parsed.workspaceId);
      const current = states.get(checkpointKey) ?? null;

      if (!current || current.status !== expected.status || current.updatedAt !== expected.updatedAt) {
        return {
          state: current ? contentWorkflowStateSchema.parse(current) : null,
          transitioned: false
        };
      }

      states.set(checkpointKey, parsed);

      return {
        state: parsed,
        transitioned: true
      };
    },

    async get(runId, workspaceId) {
      const state = states.get(key(runId, workspaceId));
      return state ? contentWorkflowStateSchema.parse(state) : null;
    },

    clear() {
      states.clear();
    }
  };
}

const sharedMemoryCheckpointStore = createMemoryContentWorkflowCheckpointStore();

export function createContentWorkflowCheckpointStore({ allowMemoryFallback = false } = {}) {
  if (allowMemoryFallback) {
    return sharedMemoryCheckpointStore;
  }

  if (isDatabaseConfigured) {
    return createDatabaseContentWorkflowCheckpointStore();
  }

  throw new Error("DATABASE_URL is required for workflow checkpoint persistence.");
}

export function clearContentWorkflowCheckpointsForTests() {
  sharedMemoryCheckpointStore.clear();
}
