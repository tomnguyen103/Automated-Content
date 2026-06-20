import "server-only";

import { getDb } from "@/db";
import { n8nEvents } from "@/db/schema";
import { isDatabaseConfigured } from "@/lib/env";

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

const memoryEvents = new Map<string, N8nEventLogInput & { createdAt: Date; updatedAt: Date }>();

export async function recordN8nEvent(input: N8nEventLogInput) {
  const now = new Date();
  const row = {
    ...input,
    payload: input.payload ?? {},
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
