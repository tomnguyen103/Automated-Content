import { describe, expect, it, vi } from "vitest";
import { dispatchMediaGenerationJob } from "@/lib/jobs/trigger";
import type { MediaGenerationJobRecord } from "@/lib/jobs/types";

const sampleJob: MediaGenerationJobRecord = {
  id: "media_job_123",
  workspaceId: "workspace_123",
  createdByUserId: "user_123",
  jobKind: "media.render-short-clip",
  status: "queued",
  idempotencyKey: "render-job-123",
  sourceAssetId: "media_source_123",
  progress: 0,
  input: {
    clipId: "clip_123"
  },
  output: {},
  cost: {},
  audit: {},
  queuedAt: "2026-06-25T12:00:00.000Z",
  createdAt: "2026-06-25T12:00:00.000Z",
  updatedAt: "2026-06-25T12:00:00.000Z"
};

describe("Trigger.dev media dispatch", () => {
  it("uses local dispatch handles when Trigger.dev is not configured", async () => {
    const handle = await dispatchMediaGenerationJob({
      job: sampleJob,
      envMap: {
        TRIGGER_PROJECT_REF: undefined,
        TRIGGER_SECRET_KEY: undefined,
        TRIGGER_VERSION: undefined
      }
    });

    expect(handle).toEqual({
      mode: "local",
      runId: "local-trigger-media_job_123",
      taskId: "media.render-short-clip"
    });
  });

  it("passes idempotency and workspace concurrency to the Trigger client", async () => {
    const trigger = vi.fn(async () => ({
      id: "run_123",
      publicAccessToken: "pat_123"
    }));

    const handle = await dispatchMediaGenerationJob({
      job: sampleJob,
      client: { trigger },
      envMap: {
        TRIGGER_PROJECT_REF: "proj_prod_123",
        TRIGGER_SECRET_KEY: "tr_prod_123",
        TRIGGER_VERSION: "20260625.1"
      }
    });

    expect(trigger).toHaveBeenCalledWith(
      "media.render-short-clip",
      {
        idempotencyKey: "render-job-123",
        input: {
          clipId: "clip_123"
        },
        jobId: "media_job_123",
        sourceAssetId: "media_source_123",
        workspaceId: "workspace_123"
      },
      {
        concurrencyKey: "workspace_123",
        idempotencyKey: "render-job-123"
      }
    );
    expect(handle).toEqual({
      mode: "trigger.dev",
      publicAccessToken: "pat_123",
      runId: "run_123",
      taskId: "media.render-short-clip"
    });
  });
});
