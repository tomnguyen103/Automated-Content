import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleClerkWebhookEvent } from "@/lib/billing/clerk-sync";
import { env } from "@/lib/env";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let event: Awaited<ReturnType<typeof verifyWebhook>>;

  try {
    event = await verifyWebhook(request, {
      signingSecret: env.CLERK_WEBHOOK_SIGNING_SECRET
    });
  } catch {
    return NextResponse.json({ error: "Invalid Clerk webhook signature" }, { status: 400 });
  }

  try {
    const result = await handleClerkWebhookEvent(event);

    return NextResponse.json({
      received: true,
      type: event.type,
      result
    });
  } catch (error) {
    console.error("Failed to process Clerk webhook", error);
    return NextResponse.json({ error: "Unable to process Clerk webhook" }, { status: 500 });
  }
}
