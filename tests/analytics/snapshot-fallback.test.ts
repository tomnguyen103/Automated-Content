import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const now = new Date("2026-06-20T12:00:00.000Z");

describe("getWorkspaceAnalyticsSnapshot fallback", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns empty production counters when no workspace data source is available", async () => {
    const { getWorkspaceAnalyticsSnapshot } = await import("@/lib/analytics/metrics");
    const snapshot = await getWorkspaceAnalyticsSnapshot({
      isLocalPreview: false,
      now,
      workspaceId: null
    });

    expect(snapshot.posting.total).toBe(0);
    expect(snapshot.replies.matched).toBe(0);
    expect(snapshot.usage.totalQuantity).toBe(0);
    expect(snapshot.agents.total).toBe(0);
  });

  it("keeps sample counters scoped to local preview", async () => {
    const { getWorkspaceAnalyticsSnapshot } = await import("@/lib/analytics/metrics");
    const snapshot = await getWorkspaceAnalyticsSnapshot({
      isLocalPreview: true,
      now,
      workspaceId: "local-preview-workspace"
    });

    expect(snapshot.posting.total).toBeGreaterThan(0);
    expect(snapshot.agents.total).toBeGreaterThan(0);
  });
});
