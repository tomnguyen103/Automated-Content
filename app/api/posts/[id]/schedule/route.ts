import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { providerKeys } from "@/lib/providers/types";
import {
  createScheduledPost,
  createSchedulerRepository
} from "@/lib/scheduler/create-scheduled-post";
import { resolvePersonalWorkspaceForUser } from "@/lib/workspaces/personal-workspace";

export const runtime = "nodejs";

const scheduleRequestSchema = z.object({
  provider: z.enum(providerKeys),
  connectedAccountId: z.string().uuid().nullable().optional(),
  scheduledFor: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export async function POST(
  request: NextRequest,
  {
    params
  }: {
    params: Promise<{ id: string }>;
  }
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  try {
    const { id: platformVariantId } = await params;
    const input = scheduleRequestSchema.parse(body);
    const workspace = await resolvePersonalWorkspaceForUser(user);
    const result = await createScheduledPost({
      input: {
        workspaceId: workspace.id,
        platformVariantId,
        provider: input.provider,
        connectedAccountId: input.connectedAccountId ?? null,
        scheduledFor: new Date(input.scheduledFor),
        metadata: input.metadata
      },
      repository: createSchedulerRepository({
        allowMemoryFallback: workspace.isLocalPreview
      })
    });

    return NextResponse.json(
      {
        scheduledJob: result.scheduledJob,
        enqueue: result.enqueue
      },
      {
        status: result.enqueue.status === "queued" ? 201 : 202
      }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid schedule request.",
          issues: error.issues
        },
        { status: 400 }
      );
    }

    console.error("Unexpected schedule request error", error);
    return NextResponse.json({ error: "Unable to schedule post." }, { status: 500 });
  }
}
