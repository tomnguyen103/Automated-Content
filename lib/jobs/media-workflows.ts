import "server-only";

import {
  getMediaGenerationJobForWorkspace,
  MediaGenerationJobNotFoundError,
  setMediaGenerationJobStatus
} from "@/lib/jobs/media";
import {
  mediaGenerationTaskPayloadSchema,
  type MediaGenerationJobRecord,
  type MediaGenerationTaskPayload
} from "@/lib/jobs/types";
import {
  getMediaWorkflowProviderAdapter,
  MediaWorkflowInputError,
  type MediaWorkflowProviderAdapter
} from "@/lib/media/workflow-adapters";

export type MediaWorkflowExecutionResult = {
  job: MediaGenerationJobRecord;
  replayed: boolean;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Media workflow failed.";
}

function outputHasWorkflowResult(job: MediaGenerationJobRecord) {
  return Boolean(job.output && Object.keys(job.output).length > 0);
}

async function buildWorkflowOutput({
  adapter,
  job,
  payload
}: {
  adapter: MediaWorkflowProviderAdapter;
  job: MediaGenerationJobRecord;
  payload: MediaGenerationTaskPayload;
}) {
  const input = {
    input: payload.input,
    jobId: payload.jobId,
    jobKind: job.jobKind,
    sourceAssetId: payload.sourceAssetId,
    workspaceId: payload.workspaceId
  };

  if (job.jobKind === "media.transcribe-video") {
    return adapter.transcribeVideo(input);
  }

  if (job.jobKind === "media.detect-short-clips") {
    return adapter.detectShortClips(input);
  }

  if (job.jobKind === "media.render-short-clip") {
    return adapter.renderShortClip(input);
  }

  if (job.jobKind === "media.generate-influencer-asset") {
    return adapter.generateInfluencerAsset(input);
  }

  if (job.jobKind === "media.generate-avatar-video") {
    return adapter.generateAvatarVideo(input);
  }

  throw new MediaWorkflowInputError(`Unsupported media workflow kind: ${job.jobKind}`);
}

export async function executeMediaGenerationWorkflow({
  adapter = getMediaWorkflowProviderAdapter(),
  allowMemoryFallback = false,
  payload
}: {
  payload: unknown;
  adapter?: MediaWorkflowProviderAdapter;
  allowMemoryFallback?: boolean;
}): Promise<MediaWorkflowExecutionResult> {
  const parsed = mediaGenerationTaskPayloadSchema.parse(payload);
  const existing = await getMediaGenerationJobForWorkspace({
    allowMemoryFallback,
    jobId: parsed.jobId,
    workspaceId: parsed.workspaceId
  });

  if (!existing) {
    throw new MediaGenerationJobNotFoundError();
  }

  if (existing.status === "canceled") {
    return {
      job: existing,
      replayed: true
    };
  }

  if (existing.status === "succeeded" && outputHasWorkflowResult(existing)) {
    return {
      job: existing,
      replayed: true
    };
  }

  await setMediaGenerationJobStatus({
    allowMemoryFallback,
    jobId: parsed.jobId,
    progress: Math.max(existing.progress, 10),
    status: "running",
    workspaceId: parsed.workspaceId
  });

  try {
    const output = await buildWorkflowOutput({
      adapter,
      job: existing,
      payload: parsed
    });
    const job = await setMediaGenerationJobStatus({
      allowMemoryFallback,
      jobId: parsed.jobId,
      output: {
        ...output,
        workflow: {
          adapterMode: adapter.mode,
          completedAt: new Date().toISOString(),
          liveProviderVerification: "BLOCKED-EXTERNAL: Real provider credentials and dashboard callbacks are required."
        }
      },
      progress: 100,
      status: "succeeded",
      workspaceId: parsed.workspaceId
    });

    return {
      job,
      replayed: false
    };
  } catch (error) {
    const failedJob = await setMediaGenerationJobStatus({
      allowMemoryFallback,
      error: getErrorMessage(error),
      jobId: parsed.jobId,
      progress: 100,
      status: "failed",
      workspaceId: parsed.workspaceId
    });

    if (error instanceof MediaWorkflowInputError) {
      return {
        job: failedJob,
        replayed: false
      };
    }

    throw error;
  }
}
