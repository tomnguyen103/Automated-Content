import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { logger } from "@/lib/observability/logger";
import { parseN8nCallbackPayload, verifyN8nSignature } from "@/lib/n8n/events";
import { recordN8nEvent } from "@/lib/n8n/event-log";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!env.N8N_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "N8N webhook secret is not configured." }, { status: 503 });
  }

  const body = await request.text();
  const validSignature = verifyN8nSignature({
    body,
    secret: env.N8N_WEBHOOK_SECRET,
    signature: request.headers.get("x-automated-content-signature"),
    timestamp: request.headers.get("x-automated-content-timestamp")
  });

  if (!validSignature) {
    return NextResponse.json({ error: "Invalid n8n webhook signature." }, { status: 401 });
  }

  try {
    const payload = parseN8nCallbackPayload(JSON.parse(body));
    await recordN8nEvent({
      id: payload.eventId ? `${payload.eventId}:${payload.id}` : payload.id,
      workspaceId: payload.workspaceId,
      direction: "callback",
      callbackId: payload.id,
      workflow: payload.workflow,
      status: payload.status,
      payload,
      occurredAt: new Date()
    });
    logger.info("n8n callback accepted", {
      callbackId: payload.id,
      eventId: payload.eventId,
      status: payload.status,
      workflow: payload.workflow,
      workspaceId: payload.workspaceId
    });

    return NextResponse.json({
      acknowledged: true,
      callback: payload
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid n8n callback payload.",
          issues: error.issues
        },
        { status: 400 }
      );
    }

    logger.error("n8n callback failed", { error });
    return NextResponse.json({ error: "Unable to process n8n callback." }, { status: 500 });
  }
}
