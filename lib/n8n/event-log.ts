import "server-only";

import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { n8nEvents } from "@/db/schema";
import { isDatabaseConfigured } from "@/lib/env";
import { logger } from "@/lib/observability/logger";

export type N8nEventLogInput = {
  id: string;
  workspaceId?: string;
  direction: "outbound" | "callback";
  eventType?: string;
  callbackId?: string;
  workflow?: string;
  status: string;
  payload?: Record<string, unknown>;
  responseStatus?: number;
  error?: string;
  occurredAt?: Date;
};

export type N8nEventLogEntry = N8nEventLogInput & {
  workspaceId?: string;
  createdAt: Date;
  updatedAt: Date;
};

const memoryEvents = new Map<string, N8nEventLogInput & { createdAt: Date; updatedAt: Date }>();
let n8nAuditQueryFailureLogged = false;

function toEventLogEntry(input: N8nEventLogEntry): N8nEventLogEntry {
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    direction: input.direction,
    eventType: input.eventType,
    callbackId: input.callbackId,
    workflow: input.workflow,
    status: input.status,
    payload: input.payload ?? {},
    responseStatus: input.responseStatus,
    error: input.error,
    occurredAt: input.occurredAt,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt
  };
}

export async function recordN8nEvent(input: N8nEventLogInput) {
  const now = new Date();
  const row = {
    id: input.id,
    workspaceId: input.workspaceId,
    direction: input.direction,
    eventType: input.eventType,
    callbackId: input.callbackId,
    workflow: input.workflow,
    status: input.status,
    payload: input.payload ?? {},
    responseStatus: input.responseStatus,
    error: input.error,
    occurredAt: input.occurredAt,
    updatedAt: now
  };

  if (!isDatabaseConfigured) {
    const existing = memoryEvents.get(input.id);
    memoryEvents.set(input.id, {
      ...existing,
      ...row,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    });
    return;
  }

  await getDb()
    .insert(n8nEvents)
    .values({
      id: input.id,
      workspaceId: input.workspaceId ?? null,
      direction: input.direction,
      eventType: input.eventType ?? null,
      callbackId: input.callbackId ?? null,
      workflow: input.workflow ?? null,
      status: input.status,
      payload: input.payload ?? {},
      responseStatus: input.responseStatus ?? null,
      error: input.error ?? null,
      occurredAt: input.occurredAt ?? null,
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: n8nEvents.id,
      set: {
        workspaceId: input.workspaceId ?? null,
        direction: input.direction,
        eventType: input.eventType ?? null,
        callbackId: input.callbackId ?? null,
        workflow: input.workflow ?? null,
        status: input.status,
        payload: input.payload ?? {},
        responseStatus: input.responseStatus ?? null,
        error: input.error ?? null,
        occurredAt: input.occurredAt ?? null,
        updatedAt: now
      }
    });
}

export function clearN8nEventsForTests() {
  memoryEvents.clear();
}

export function listN8nEventsForTests() {
  return [...memoryEvents.values()];
}

export async function listN8nEventsForWorkspace({
  limit = 50,
  workspaceId
}: {
  workspaceId: string;
  limit?: number;
}) {
  if (!isDatabaseConfigured) {
    return [...memoryEvents.values()]
      .filter((event) => event.workspaceId === workspaceId)
      .sort((a, b) => (b.occurredAt ?? b.createdAt).getTime() - (a.occurredAt ?? a.createdAt).getTime())
      .slice(0, limit)
      .map((event) => toEventLogEntry(event));
  }

  let rows: Array<typeof n8nEvents.$inferSelect>;

  try {
    rows = await getDb()
      .select()
      .from(n8nEvents)
      .where(eq(n8nEvents.workspaceId, workspaceId))
      .orderBy(desc(sql`coalesce(${n8nEvents.occurredAt}, ${n8nEvents.createdAt})`))
      .limit(limit);
  } catch (error) {
    if (!n8nAuditQueryFailureLogged) {
      n8nAuditQueryFailureLogged = true;
      logger.warn("n8n event audit query failed", {
        error: error instanceof Error ? error.message : String(error),
        limit,
        workspaceId
      });
    }
    return [];
  }

  return rows.map((row) =>
    toEventLogEntry({
      id: row.id,
      workspaceId: row.workspaceId ?? undefined,
      direction: row.direction as "outbound" | "callback",
      eventType: row.eventType ?? undefined,
      callbackId: row.callbackId ?? undefined,
      workflow: row.workflow ?? undefined,
      status: row.status,
      payload: row.payload,
      responseStatus: row.responseStatus ?? undefined,
      error: row.error ?? undefined,
      occurredAt: row.occurredAt ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    })
  );
}
