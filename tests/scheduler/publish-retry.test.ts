import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const workspaceId = "00000000-0000-0000-0000-000000000001";
const scheduledJobId = "10000000-0000-0000-0000-000000000001";

function selectLimit(rows: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(async () => rows)
      }))
    }))
  };
}

function selectOrderLimit(rows: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          limit: vi.fn(async () => rows)
        }))
      }))
    }))
  };
}

function createJob(overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-06-22T12:00:00.000Z");

  return {
    id: scheduledJobId,
    workspaceId,
    platformVariantId: "variant_1",
    connectedAccountId: null,
    provider: "mock",
    scheduledFor: new Date("2026-06-22T13:00:00.000Z"),
    status: "failed",
    enqueueStatus: "queued",
    queueJobId: "queue_1",
    enqueueError: null,
    attemptCount: 1,
    lockedAt: null,
    publishedAt: null,
    failedAt: now,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

describe("publish retry safety", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@example.test/db");
    vi.doMock("@/lib/scheduler/enqueue", () => ({
      enqueueScheduledPost: vi.fn(async () => ({
        queueJobId: "retry_queue_1",
        delayMs: 0
      }))
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("@/lib/scheduler/enqueue");
    vi.resetModules();
  });

  it("requeues retryable provider transient failures", async () => {
    const job = createJob();
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(selectLimit([job]))
        .mockReturnValueOnce(selectLimit([]))
        .mockReturnValueOnce(selectOrderLimit([{ errorCode: "provider_transient", errorMessage: "timeout" }])),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(async () => [
              {
                ...job,
                status: "queued",
                queueJobId: "retry_queue_1"
              }
            ])
          }))
        }))
      }))
    };
    const { retryScheduledPublish } = await import("@/lib/scheduler/publish-retry");
    const result = await retryScheduledPublish({
      db: db as never,
      workspaceId,
      scheduledJobId
    });

    expect(result.recovery.retryable).toBe(true);
    expect(result.scheduledJob.status).toBe("queued");
  });

  it("blocks non-retryable provider failures", async () => {
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(selectLimit([createJob()]))
        .mockReturnValueOnce(selectLimit([]))
        .mockReturnValueOnce(selectOrderLimit([{ errorCode: "token_scope", errorMessage: "missing scope" }])),
      update: vi.fn()
    };
    const { retryScheduledPublish } = await import("@/lib/scheduler/publish-retry");

    await expect(
      retryScheduledPublish({
        db: db as never,
        workspaceId,
        scheduledJobId
      })
    ).rejects.toMatchObject({
      code: "publish_retry_not_allowed"
    });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("blocks duplicate sends when a success attempt exists", async () => {
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(selectLimit([createJob()]))
        .mockReturnValueOnce(selectLimit([{ id: "attempt_success" }])),
      update: vi.fn()
    };
    const { retryScheduledPublish } = await import("@/lib/scheduler/publish-retry");

    await expect(
      retryScheduledPublish({
        db: db as never,
        workspaceId,
        scheduledJobId
      })
    ).rejects.toMatchObject({
      code: "duplicate_send_blocked"
    });
    expect(db.update).not.toHaveBeenCalled();
  });
});
