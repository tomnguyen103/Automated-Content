import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  attachMediaGenerationJobRun,
  cancelMediaGenerationJob,
  getMediaGenerationJobForWorkspace,
  MediaGenerationJobNotFoundError,
  MediaGenerationJobStateError,
  retryMediaGenerationJob
} from "@/lib/jobs/media";
import { dispatchMediaGenerationJob } from "@/lib/jobs/trigger";
import { updateMediaGenerationJobActionSchema } from "@/lib/jobs/types";
import { resolvePersonalWorkspaceForUser } from "@/lib/workspaces/personal-workspace";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  const { id } = await context.params;
  const workspace = await resolvePersonalWorkspaceForUser(user);
  const job = await getMediaGenerationJobForWorkspace({
    workspaceId: workspace.id,
    jobId: id,
    allowMemoryFallback: workspace.isLocalPreview
  });

  if (!job) {
    return NextResponse.json({ error: "Media generation job was not found." }, { status: 404 });
  }

  return NextResponse.json({ job });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
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
    const input = updateMediaGenerationJobActionSchema.parse(body);
    const { id } = await context.params;
    const workspace = await resolvePersonalWorkspaceForUser(user);

    if (input.action === "cancel") {
      const job = await cancelMediaGenerationJob({
        workspaceId: workspace.id,
        jobId: id,
        allowMemoryFallback: workspace.isLocalPreview
      });

      return NextResponse.json({ job });
    }

    const queuedJob = await retryMediaGenerationJob({
      workspaceId: workspace.id,
      jobId: id,
      allowMemoryFallback: workspace.isLocalPreview
    });
    const dispatch = await dispatchMediaGenerationJob({ job: queuedJob });
    const job = await attachMediaGenerationJobRun({
      workspaceId: workspace.id,
      jobId: queuedJob.id,
      triggerTaskId: dispatch.taskId,
      triggerRunId: dispatch.runId,
      allowMemoryFallback: workspace.isLocalPreview
    });

    return NextResponse.json({
      job,
      dispatch
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid media generation job action.",
          issues: error.issues
        },
        { status: 400 }
      );
    }

    if (error instanceof MediaGenerationJobNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof MediaGenerationJobStateError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    console.error("Unexpected media generation job action error", error);
    return NextResponse.json({ error: "Unable to update media generation job." }, { status: 500 });
  }
}
