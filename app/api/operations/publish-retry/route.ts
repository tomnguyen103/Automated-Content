import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  PublishRetryError,
  retryScheduledPublish
} from "@/lib/scheduler/publish-retry";
import { resolvePersonalWorkspaceForUser } from "@/lib/workspaces/personal-workspace";

export const runtime = "nodejs";

const publishRetryRequestSchema = z.object({
  scheduledJobId: z.string().uuid()
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication is required.", code: "authentication_required" }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload.", code: "invalid_json" }, { status: 400 });
  }

  try {
    const input = publishRetryRequestSchema.parse(body);
    const workspace = await resolvePersonalWorkspaceForUser(user);
    const result = await retryScheduledPublish({
      workspaceId: workspace.id,
      scheduledJobId: input.scheduledJobId
    });

    return NextResponse.json({
      scheduledJob: result.scheduledJob,
      enqueue: result.enqueue,
      recovery: result.recovery
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid publish retry request.", code: "invalid_publish_retry_request", issues: error.issues },
        { status: 400 }
      );
    }

    if (error instanceof PublishRetryError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          recovery: error.recovery
        },
        { status: error.status }
      );
    }

    console.error("Unexpected publish retry error", error);
    return NextResponse.json({ error: "Unable to retry scheduled publish.", code: "publish_retry_failed" }, { status: 500 });
  }
}
