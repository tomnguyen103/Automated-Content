import { task } from "@trigger.dev/sdk";
import { executeMediaGenerationWorkflow } from "../lib/jobs/media-workflows";
import { mediaGenerationTaskPayloadSchema } from "../lib/jobs/types";

function createMediaWorkflowTask(id: string) {
  return task({
    id,
    maxDuration: 900,
    queue: {
      concurrencyLimit: 5
    },
    run: async (payload: unknown) => {
      const parsed = mediaGenerationTaskPayloadSchema.parse(payload);
      const result = await executeMediaGenerationWorkflow({
        payload: parsed
      });

      return {
        job: result.job,
        jobId: parsed.jobId,
        replayed: result.replayed,
        status: result.job.status,
        taskId: id,
        workspaceId: parsed.workspaceId
      };
    }
  });
}

export const transcribeVideo = createMediaWorkflowTask("media.transcribe-video");
export const detectShortClips = createMediaWorkflowTask("media.detect-short-clips");
export const renderShortClip = createMediaWorkflowTask("media.render-short-clip");
export const generateInfluencerAsset = createMediaWorkflowTask("media.generate-influencer-asset");
export const generateAvatarVideo = createMediaWorkflowTask("media.generate-avatar-video");
