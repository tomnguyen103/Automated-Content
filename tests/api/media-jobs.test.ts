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
});
