import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("worker runtime readiness", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("REDIS_URL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("reports preview mode without requiring Redis", async () => {
    const { getWorkerRuntimeReadiness } = await import("@/lib/scheduler/worker-health");
    const readiness = await getWorkerRuntimeReadiness({
      isLocalPreview: true,
      workspaceId: "00000000-0000-0000-0000-000000000001"
    });

    expect(readiness.queues).toHaveLength(2);
    expect(readiness.queues.every((queue) => queue.status === "preview")).toBe(true);
  });

  it("distinguishes unconfigured queues from Redis outages", async () => {
    const { getWorkerRuntimeReadiness } = await import("@/lib/scheduler/worker-health");
    const readiness = await getWorkerRuntimeReadiness({
      isLocalPreview: false,
      workspaceId: "00000000-0000-0000-0000-000000000001"
    });

    expect(readiness.queues.every((queue) => queue.status === "queue_not_configured")).toBe(true);
    expect(readiness.summary.blocked).toBe(2);
  });
});
