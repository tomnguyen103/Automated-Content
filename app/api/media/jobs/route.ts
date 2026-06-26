import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  consumeUsageForLimit,
  UsageLimitExceededError
} from "@/lib/billing/usage";
import {
  attachMediaGenerationJobRun,
  createMediaGenerationJobForWorkspace,
  listMediaGenerationJobsForWorkspace
} from "@/lib/jobs/media";
import { dispatchMediaGenerationJob } from "@/lib/jobs/trigger";
import { createMediaGenerationJobSchema } from "@/lib/jobs/types";
import {
  assertExpensiveEndpointAllowed,
  ExpensiveEndpointRateLimitError
} from "@/lib/security/expensive-endpoint-protection";
import { resolvePersonalWorkspaceForUser } from "@/lib/workspaces/personal-workspace";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  const workspace = await resolvePersonalWorkspaceForUser(user);
  const jobs = await listMediaGenerationJobsForWorkspace({
    workspaceId: workspace.id,
    allowMemoryFallback: workspace.isLocalPreview
  });

  return NextResponse.json({ jobs });
}

export async function POST(request: NextRequest) {
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
    const input = createMediaGenerationJobSchema.parse(body);
    const workspace = await resolvePersonalWorkspaceForUser(user);
    assertExpensiveEndpointAllowed({
      route: "media.jobs.create",
      userId: user.id,
      workspaceId: workspace.id,
      skip: workspace.isLocalPreview
    });
    const usageSourceId = input.idempotencyKey
      ? `media_generation_job:${workspace.id}:${input.idempotencyKey}`
      : `media_generation_job:${randomUUID()}`;

    await consumeUsageForLimit({
      workspaceId: workspace.id,
      key: "mediaTransformsPerMonth",
      sourceId: usageSourceId,
      metadata: {
        jobKind: input.kind,
        sourceAssetId: input.sourceAssetId,
        userId: user.id
      },
      skip: workspace.isLocalPreview
    });

    const { created, job: createdJob } = await createMediaGenerationJobForWorkspace({
      workspaceId: workspace.id,
      createdByUserId: user.id,
      jobKind: input.kind,
      input: input.input,
      sourceAssetId: input.sourceAssetId,
      idempotencyKey: input.idempotencyKey,
      allowMemoryFallback: workspace.isLocalPreview
    });

    if (!created) {
      return NextResponse.json({
        job: createdJob,
        dispatch: null
      });
    }

    const dispatch = await dispatchMediaGenerationJob({ job: createdJob });
    const job = await attachMediaGenerationJobRun({
      workspaceId: workspace.id,
      jobId: createdJob.id,
      triggerTaskId: dispatch.taskId,
      triggerRunId: dispatch.runId,
      allowMemoryFallback: workspace.isLocalPreview
    });

    return NextResponse.json(
      {
        job,
        dispatch
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid media generation job payload.",
          issues: error.issues
        },
        { status: 400 }
      );
    }

    if (error instanceof UsageLimitExceededError) {
      return NextResponse.json(
        {
          error: "Media transforms limit reached for the current plan.",
          usage: error.metric
        },
        { status: 429 }
      );
    }

    if (error instanceof ExpensiveEndpointRateLimitError) {
      return NextResponse.json(
        {
          error: error.message,
          limit: error.limit,
          resetAt: error.resetAt,
          windowMs: error.windowMs
        },
        { status: 429 }
      );
    }

    console.error("Unexpected media generation job creation error", error);
    return NextResponse.json({ error: "Unable to create media generation job." }, { status: 500 });
  }
}
