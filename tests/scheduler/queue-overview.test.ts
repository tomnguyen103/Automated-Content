import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("queue overview", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("@/db");
    vi.doUnmock("@/lib/env");
    vi.resetModules();
  });

  it("uses preview queue rows only for local preview", async () => {
    const { getQueueRows, getQueueStats } = await import("@/lib/scheduler/queue-overview");

    await expect(getQueueRows({ isLocalPreview: false, workspaceId: null })).resolves.toEqual([]);

    const previewRows = await getQueueRows({ isLocalPreview: true, limit: 2, workspaceId: null });

    expect(previewRows).toHaveLength(2);
    expect(getQueueStats(previewRows)).toEqual({
      scheduled: 2,
      queued: 1,
      recoverable: 1
    });
  });

  it("classifies failed publish rows from the latest failed publish attempt", async () => {
    vi.resetModules();

    const workspaceId = "00000000-0000-0000-0000-000000000001";
    const scheduledRows = [
      {
        id: "10000000-0000-0000-0000-000000000001",
        title: "Launch post",
        provider: "LinkedIn Account",
        fallbackProvider: "linkedin",
        scheduledFor: new Date("2026-06-22T17:00:00.000Z"),
        status: "failed",
        enqueueStatus: "queued",
        enqueueError: null
      }
    ];
    const failedAttemptRows = [
      {
        scheduledJobId: scheduledRows[0].id,
        errorCode: "capability_unsupported",
        errorMessage: "Connected account account_1 does not expose scheduled_publish."
      }
    ];
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn(() => ({
            innerJoin: vi.fn(() => ({
              leftJoin: vi.fn(() => ({
                where: vi.fn(() => ({
                  orderBy: vi.fn(() => ({
                    limit: vi.fn(async () => scheduledRows)
                  }))
                }))
              }))
            }))
          }))
        })
        .mockReturnValueOnce({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn(async () => failedAttemptRows)
            }))
          }))
        })
    };

    vi.doMock("@/db", () => ({
      getDb: () => db
    }));
    vi.doMock("@/lib/env", () => ({
      isDatabaseConfigured: true
    }));

    const { getQueueRows } = await import("@/lib/scheduler/queue-overview");
    const rows = await getQueueRows({ isLocalPreview: false, workspaceId });

    expect(rows).toEqual([
      expect.objectContaining({
        id: scheduledRows[0].id,
        enqueue: "Queued",
        recovery: expect.objectContaining({
          category: "provider_capability",
          actions: ["reschedule", "manual_review"]
        })
      })
    ]);
  });
});
