import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const signaturePrefix = "sha256=";
const defaultToleranceMs = 5 * 60 * 1000;

export const n8nEventTypeSchema = z.enum([
  "content.workflow.review_requested",
  "content.workflow.approved",
  "content.draft.saved",
  "publishing.post.queued",
  "publishing.post.published",
  "publishing.post.failed",
  "reply.approval_requested",
  "reply.sent",
  "reply.failed",
  "agent.mission.started",
  "agent.mission.completed",
  "agent.mission.simulated",
  "agent.report.generated",
  "agent.task.succeeded",
  "agent.task.failed",
  "agent.policy.evaluated",
  "usage.threshold_reached"
]);

export const n8nEventPayloadSchema = z.object({
  id: z.string().min(1),
  event: n8nEventTypeSchema,
  workspaceId: z.string().min(1),
  occurredAt: z.string().datetime(),
  data: z.record(z.string(), z.unknown()).default({})
});

export const n8nCallbackPayloadSchema = z.object({
  id: z.string().min(1),
  workflow: z.string().min(1),
  status: z.enum(["accepted", "completed", "failed"]),
  eventId: z.string().min(1).optional(),
  workspaceId: z.string().min(1).optional(),
  message: z.string().max(1000).optional(),
  data: z.record(z.string(), z.unknown()).default({})
});

export type N8nEventType = z.infer<typeof n8nEventTypeSchema>;
export type N8nEventPayload = z.infer<typeof n8nEventPayloadSchema>;
export type N8nCallbackPayload = z.infer<typeof n8nCallbackPayloadSchema>;

export function createN8nSignature({
  body,
  secret,
  timestamp
}: {
  body: string;
  secret: string;
  timestamp: string;
}) {
  return `${signaturePrefix}${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyN8nSignature({
  body,
  now = new Date(),
  secret,
  signature,
  timestamp,
  toleranceMs = defaultToleranceMs
}: {
  body: string;
  now?: Date;
  secret: string;
  signature: string | null;
  timestamp: string | null;
  toleranceMs?: number;
}) {
  if (!secret || !signature || !timestamp || !signature.startsWith(signaturePrefix)) {
    return false;
  }

  const timestampMs = Number(timestamp);

  if (!Number.isFinite(timestampMs) || Math.abs(now.getTime() - timestampMs) > toleranceMs) {
    return false;
  }

  const expected = createN8nSignature({ body, secret, timestamp });

  return safeEqual(signature, expected);
}

export function parseN8nCallbackPayload(payload: unknown) {
  return n8nCallbackPayloadSchema.parse(payload);
}
