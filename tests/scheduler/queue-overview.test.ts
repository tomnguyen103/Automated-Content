import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("queue overview", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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
});
