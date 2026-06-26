import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearMediaGenerationJobsForTests,
  createMediaGenerationJobForWorkspace
} from "@/lib/jobs/media";
import { executeMediaGenerationWorkflow } from "@/lib/jobs/media-workflows";

const workspaceId = "workspace_media_workflows";
const createdByUserId = "user_media_workflows";

async function createJob({
  input,
  jobKind,
  sourceAssetId
}: {
  jobKind:
    | "media.detect-short-clips"
    | "media.generate-avatar-video"
    | "media.generate-influencer-asset"
    | "media.render-short-clip"
    | "media.transcribe-video";
  input: Record<string, unknown>;
  sourceAssetId?: string;
}) {
  const result = await createMediaGenerationJobForWorkspace({
    allowMemoryFallback: true,
    createdByUserId,
    idempotencyKey: `${jobKind}:${JSON.stringify(input).slice(0, 80)}`,
    input,
    jobKind,
    sourceAssetId,
    workspaceId
  });

  return result.job;
}

describe("media generation workflows", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    clearMediaGenerationJobsForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    clearMediaGenerationJobsForTests();
  });

  it("persists transcript and caption output and treats replays as idempotent", async () => {
    const job = await createJob({
      jobKind: "media.transcribe-video",
      sourceAssetId: "source_asset_1",
      input: {
        sourceUrl: "https://media.example.com/source.mp4",
        transcriptText: "Start with a strong hook. End with a schedule-ready CTA."
      }
    });
    const payload = {
      input: job.input,
      jobId: job.id,
      sourceAssetId: job.sourceAssetId,
      workspaceId
    };

    const firstRun = await executeMediaGenerationWorkflow({
      allowMemoryFallback: true,
      payload
    });
    const replay = await executeMediaGenerationWorkflow({
      allowMemoryFallback: true,
      payload
    });

    expect(firstRun.replayed).toBe(false);
    expect(firstRun.job.status).toBe("succeeded");
    expect(firstRun.job.output.transcript).toMatchObject({
      text: "Start with a strong hook. End with a schedule-ready CTA."
    });
    expect(firstRun.job.output.captions).toEqual([
      expect.objectContaining({
        format: "srt",
        text: expect.stringContaining("-->")
      })
    ]);
    expect(replay.replayed).toBe(true);
    expect(replay.job.output).toEqual(firstRun.job.output);
  });

  it("creates scored clip candidates and render schedule handoff output", async () => {
    const clipJob = await createJob({
      jobKind: "media.detect-short-clips",
      input: {
        transcriptText: "Open with a sharp hook. Add the proof point. Close with a direct next step."
      }
    });
    const clipRun = await executeMediaGenerationWorkflow({
      allowMemoryFallback: true,
      payload: {
        input: clipJob.input,
        jobId: clipJob.id,
        workspaceId
      }
    });
    const clipCandidates = clipRun.job.output.clipCandidates as Array<{
      id: string;
      score: number;
      title: string;
    }>;

    expect(clipCandidates[0]).toMatchObject({
      score: 92
    });

    const renderJob = await createJob({
      jobKind: "media.render-short-clip",
      input: {
        clipCandidate: clipCandidates[0],
        cta: "Review and schedule."
      }
    });
    const renderRun = await executeMediaGenerationWorkflow({
      allowMemoryFallback: true,
      payload: {
        input: renderJob.input,
        jobId: renderJob.id,
        workspaceId
      }
    });

    expect(renderRun.job.output.renderedClip).toMatchObject({
      artifactManifestUrl: expect.stringContaining(".json?download=1"),
      clipCandidateId: clipCandidates[0]!.id,
      format: "mp4",
      status: "succeeded"
    });
    expect(renderRun.job.output.scheduleHandoff).toMatchObject({
      target: "schedule"
    });
  });

  it("creates influencer review handoff output through the provider boundary", async () => {
    const job = await createJob({
      jobKind: "media.generate-influencer-asset",
      input: {
        personaName: "Synthetic Founder",
        prompt: "Launch asset for operators"
      }
    });
    const result = await executeMediaGenerationWorkflow({
      allowMemoryFallback: true,
      payload: {
        input: job.input,
        jobId: job.id,
        workspaceId
      }
    });

    expect(result.job.output.influencerAsset).toMatchObject({
      artifactManifestUrl: expect.stringContaining(".json?download=1"),
      assetType: "synthetic_influencer",
      provider: "mock",
      syntheticMediaLabel: "AI-generated synthetic influencer asset."
    });
    expect(result.job.output.reviewHandoff).toMatchObject({
      target: "review"
    });
  });

  it("requires explicit consent before avatar and voice video output is persisted", async () => {
    const job = await createJob({
      jobKind: "media.generate-avatar-video",
      input: {
        avatarName: "Consented Avatar",
        script: "Ready for review."
      }
    });
    const failed = await executeMediaGenerationWorkflow({
      allowMemoryFallback: true,
      payload: {
        input: job.input,
        jobId: job.id,
        workspaceId
      }
    });

    expect(failed.job.status).toBe("failed");
    expect(failed.job.error).toContain("consentAccepted=true");

    const consentedJob = await createJob({
      jobKind: "media.generate-avatar-video",
      input: {
        avatarName: "Consented Avatar",
        consentAccepted: true,
        script: "Ready for review.",
        retentionDays: 14
      }
    });
    const result = await executeMediaGenerationWorkflow({
      allowMemoryFallback: true,
      payload: {
        input: consentedJob.input,
        jobId: consentedJob.id,
        workspaceId
      }
    });

    expect(result.job.output.consentRecord).toMatchObject({
      accepted: true,
      retentionDays: 14
    });
    expect(result.job.output.avatarVideo).toMatchObject({
      artifactManifestUrl: expect.stringContaining(".json?download=1"),
      provider: "mock",
      syntheticMediaLabel: "AI-generated avatar and voice video."
    });
  });
});
