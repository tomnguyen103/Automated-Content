import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadMediaJobRoutes() {
  const [{ GET, POST }, detailRoute, { clearMediaGenerationJobsForTests }] = await Promise.all([
    import("@/app/api/media/jobs/route"),
    import("@/app/api/media/jobs/[id]/route"),
    import("@/lib/jobs/media")
  ]);

  return {
    GET,
    POST,
    detailGET: detailRoute.GET,
    PATCH: detailRoute.PATCH,
    clearMediaGenerationJobsForTests
  };
}

async function loadMediaJobCreateRoute() {
  const { POST } = await import("@/app/api/media/jobs/route");

  return { POST };
}

function routeContext(id: string) {
  return {
    params: Promise.resolve({ id })
  };
}

describe("media generation jobs API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("AUTH_LOCAL_PREVIEW", "1");
    vi.stubEnv("PLAYWRIGHT_AUTH_LOCAL_PREVIEW", "1");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    vi.stubEnv("CLERK_SECRET_KEY", "");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("TRIGGER_SECRET_KEY", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("@/lib/auth/current-user");
    vi.doUnmock("@/lib/billing/usage");
    vi.doUnmock("@/lib/jobs/media");
    vi.doUnmock("@/lib/jobs/trigger");
    vi.doUnmock("@/lib/workspaces/personal-workspace");
    vi.resetModules();
  });

  it("creates, lists, reads, cancels, and retries local preview media jobs", async () => {
    const { GET, POST, PATCH, detailGET, clearMediaGenerationJobsForTests } = await loadMediaJobRoutes();
    clearMediaGenerationJobsForTests();

    const createResponse = await POST(
      new NextRequest("http://localhost:3000/api/media/jobs", {
        method: "POST",
        body: JSON.stringify({
          kind: "media.transcribe-video",
          idempotencyKey: "video-job-001",
          sourceAssetId: "media_source_001",
          input: {
            sourceUrl: "s3://bucket/source/video.mp4"
          }
        })
      })
    );
    const createPayload = await createResponse.json();

    expect(createResponse.status).toBe(201);
    expect(createPayload.dispatch).toMatchObject({
      mode: "local",
      taskId: "media.transcribe-video"
    });
    expect(createPayload.job).toMatchObject({
      idempotencyKey: "video-job-001",
      sourceAssetId: "media_source_001",
      status: "queued",
      triggerRunId: `local-trigger-${createPayload.job.id}`
    });

    const duplicateResponse = await POST(
      new NextRequest("http://localhost:3000/api/media/jobs", {
        method: "POST",
        body: JSON.stringify({
          kind: "media.transcribe-video",
          idempotencyKey: "video-job-001",
          input: {
            sourceUrl: "s3://bucket/source/video.mp4"
          }
        })
      })
    );
    const duplicatePayload = await duplicateResponse.json();

    expect(duplicateResponse.status).toBe(200);
    expect(duplicatePayload.dispatch).toBeNull();
    expect(duplicatePayload.job.id).toBe(createPayload.job.id);
    expect(duplicatePayload.job.triggerRunId).toBe(createPayload.job.triggerRunId);

    const listResponse = await GET();
    const listPayload = await listResponse.json();

    expect(listResponse.status).toBe(200);
    expect(listPayload.jobs).toHaveLength(1);

    const detailResponse = await detailGET(
      new NextRequest(`http://localhost:3000/api/media/jobs/${createPayload.job.id}`),
      routeContext(createPayload.job.id)
    );
    const detailPayload = await detailResponse.json();

    expect(detailResponse.status).toBe(200);
    expect(detailPayload.job.id).toBe(createPayload.job.id);

    const cancelResponse = await PATCH(
      new NextRequest(`http://localhost:3000/api/media/jobs/${createPayload.job.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "cancel" })
      }),
      routeContext(createPayload.job.id)
    );
    const cancelPayload = await cancelResponse.json();

    expect(cancelResponse.status).toBe(200);
    expect(cancelPayload.job.status).toBe("canceled");
    expect(cancelPayload.job.canceledAt).toBeDefined();

    const retryResponse = await PATCH(
      new NextRequest(`http://localhost:3000/api/media/jobs/${createPayload.job.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "retry" })
      }),
      routeContext(createPayload.job.id)
    );
    const retryPayload = await retryResponse.json();

    expect(retryResponse.status).toBe(200);
    expect(retryPayload.dispatch.mode).toBe("local");
    expect(retryPayload.job).toMatchObject({
      id: createPayload.job.id,
      status: "queued",
      triggerRunId: `local-trigger-${createPayload.job.id}`
    });
    expect(retryPayload.job.startedAt).toBeUndefined();
    expect(retryPayload.job.completedAt).toBeUndefined();
    expect(retryPayload.job.canceledAt).toBeUndefined();
  });

  it("rejects unsupported media job kinds", async () => {
    const { POST, clearMediaGenerationJobsForTests } = await loadMediaJobRoutes();
    clearMediaGenerationJobsForTests();

    const response = await POST(
      new NextRequest("http://localhost:3000/api/media/jobs", {
        method: "POST",
        body: JSON.stringify({
          kind: "media.unsupported",
          input: {}
        })
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Invalid media generation job payload.");
  });

  it("reserves media transform usage before dispatching production jobs", async () => {
    vi.resetModules();
    vi.stubEnv("AUTH_LOCAL_PREVIEW", "");
    vi.stubEnv("PLAYWRIGHT_AUTH_LOCAL_PREVIEW", "");
    vi.stubEnv("DATABASE_URL", "postgres://app_user:prod_password@db.example.com:5432/app");

    const job = {
      id: "media_job_prod_1",
      workspaceId: "workspace_prod_1",
      createdByUserId: "user_prod_1",
      jobKind: "media.generate-influencer-asset",
      status: "queued",
      idempotencyKey: "media-job-prod-001",
      progress: 0,
      input: {
        prompt: "Launch asset"
      },
      output: {},
      cost: {},
      audit: {},
      queuedAt: "2026-06-25T12:00:00.000Z",
      createdAt: "2026-06-25T12:00:00.000Z",
      updatedAt: "2026-06-25T12:00:00.000Z"
    };
    const consumeUsageForLimit = vi.fn(async () => null);
    const createMediaGenerationJobForWorkspace = vi.fn(async () => ({
      created: true,
      job
    }));
    const attachMediaGenerationJobRun = vi.fn(async () => ({
      ...job,
      triggerRunId: "run_prod_1",
      triggerTaskId: "media.generate-influencer-asset"
    }));
    const dispatchMediaGenerationJob = vi.fn(async () => ({
      mode: "trigger.dev",
      runId: "run_prod_1",
      taskId: "media.generate-influencer-asset"
    }));

    class UsageLimitExceededError extends Error {
      readonly metric = {
        key: "mediaTransformsPerMonth",
        label: "Media transforms",
        used: 10,
        limit: 10,
        remaining: 0,
        allowed: false,
        cadence: "monthly"
      };
    }

    vi.doMock("@/lib/auth/current-user", () => ({
      getCurrentUser: vi.fn(async () => ({
        id: "user_prod_1",
        email: "prod@example.com",
        name: "Prod User",
        imageUrl: null,
        initials: "PU",
        isLocalPreview: false
      }))
    }));
    vi.doMock("@/lib/workspaces/personal-workspace", () => ({
      resolvePersonalWorkspaceForUser: vi.fn(async () => ({
        id: "workspace_prod_1",
        isLocalPreview: false,
        role: "owner"
      }))
    }));
    vi.doMock("@/lib/billing/usage", () => ({
      UsageLimitExceededError,
      consumeUsageForLimit
    }));
    vi.doMock("@/lib/jobs/media", () => ({
      attachMediaGenerationJobRun,
      createMediaGenerationJobForWorkspace,
      listMediaGenerationJobsForWorkspace: vi.fn()
    }));
    vi.doMock("@/lib/jobs/trigger", () => ({
      dispatchMediaGenerationJob
    }));

    const { POST } = await loadMediaJobCreateRoute();
    const response = await POST(
      new NextRequest("http://localhost:3000/api/media/jobs", {
        method: "POST",
        body: JSON.stringify({
          kind: "media.generate-influencer-asset",
          idempotencyKey: "media-job-prod-001",
          input: {
            prompt: "Launch asset"
          }
        })
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.job.triggerRunId).toBe("run_prod_1");
    expect(consumeUsageForLimit).toHaveBeenCalledWith({
      workspaceId: "workspace_prod_1",
      key: "mediaTransformsPerMonth",
      sourceId: "media_generation_job:workspace_prod_1:media-job-prod-001",
      metadata: {
        jobKind: "media.generate-influencer-asset",
        sourceAssetId: undefined,
        userId: "user_prod_1"
      },
      skip: false
    });
    expect(consumeUsageForLimit.mock.invocationCallOrder[0]).toBeLessThan(
      createMediaGenerationJobForWorkspace.mock.invocationCallOrder[0]!
    );
    expect(dispatchMediaGenerationJob).toHaveBeenCalledWith({
      job
    });
  });
});
