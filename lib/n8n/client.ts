import "server-only";

import { env } from "@/lib/env";
import {
  createN8nSignature,
  n8nEventPayloadSchema,
  type N8nEventPayload,
  type N8nEventType
} from "@/lib/n8n/events";
import { recordN8nEvent } from "@/lib/n8n/event-log";

type N8nFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type EmitN8nEventInput = {
  id?: string;
  event: N8nEventType;
  workspaceId: string;
  occurredAt?: Date;
  data?: Record<string, unknown>;
};

export type N8nClientOptions = {
  fetcher?: N8nFetch;
  now?: () => Date;
  secret?: string;
  webhookUrl?: string;
};

export class N8nConfigurationError extends Error {
  constructor(message = "N8N_WEBHOOK_URL and N8N_WEBHOOK_SECRET are required to emit n8n events.") {
    super(message);
    this.name = "N8nConfigurationError";
  }
}

export class N8nDispatchError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "N8nDispatchError";
  }
}

export function createN8nClient({
  fetcher = fetch,
  now = () => new Date(),
  secret = env.N8N_WEBHOOK_SECRET,
  webhookUrl = env.N8N_WEBHOOK_URL
}: N8nClientOptions = {}) {
  return {
    async emit(input: EmitN8nEventInput) {
      if (!webhookUrl || !secret) {
        throw new N8nConfigurationError();
      }

      const occurredAt = input.occurredAt ?? now();
      const payload: N8nEventPayload = n8nEventPayloadSchema.parse({
        id: input.id ?? `evt_${crypto.randomUUID()}`,
        event: input.event,
        workspaceId: input.workspaceId,
        occurredAt: occurredAt.toISOString(),
        data: input.data ?? {}
      });
      const body = JSON.stringify(payload);
      const timestamp = String(now().getTime());
      const signature = createN8nSignature({ body, secret, timestamp });
      let response: Response;

      await recordN8nEvent({
        id: payload.id,
        workspaceId: payload.workspaceId,
        direction: "outbound",
        eventType: payload.event,
        status: "pending",
        payload,
        occurredAt
      });

      try {
        response = await fetcher(webhookUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-automated-content-event": payload.event,
            "x-automated-content-signature": signature,
            "x-automated-content-timestamp": timestamp
          },
          body,
          signal: AbortSignal.timeout(10_000)
        });
      } catch (error) {
        await recordN8nEvent({
          id: payload.id,
          workspaceId: payload.workspaceId,
          direction: "outbound",
          eventType: payload.event,
          status: "failed",
          payload,
          responseStatus: 0,
          error: error instanceof Error ? error.message : "Dispatch failed before response.",
          occurredAt
        });
        throw new N8nDispatchError("n8n event dispatch failed before receiving a response.", 0);
      }

      if (!response.ok) {
        await recordN8nEvent({
          id: payload.id,
          workspaceId: payload.workspaceId,
          direction: "outbound",
          eventType: payload.event,
          status: "failed",
          payload,
          responseStatus: response.status,
          error: `Dispatch failed with status ${response.status}.`,
          occurredAt
        });
        throw new N8nDispatchError(`n8n event dispatch failed with status ${response.status}.`, response.status);
      }

      await recordN8nEvent({
        id: payload.id,
        workspaceId: payload.workspaceId,
        direction: "outbound",
        eventType: payload.event,
        status: "delivered",
        payload,
        responseStatus: response.status,
        occurredAt
      });

      return {
        eventId: payload.id,
        responseStatus: response.status,
        status: "delivered" as const
      };
    }
  };
}

export const n8nClient = createN8nClient();
