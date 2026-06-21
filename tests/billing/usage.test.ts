import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  insert: vi.fn(),
  onConflictDoNothing: vi.fn(async () => undefined),
  values: vi.fn()
}));

vi.mock("@/db", () => ({
  getDb: vi.fn(() => ({
    insert: dbMocks.insert
  }))
}));

describe("recordUsage", () => {
  beforeEach(() => {
    vi.resetModules();
    dbMocks.insert.mockReset();
    dbMocks.values.mockReset();
    dbMocks.onConflictDoNothing.mockReset();
    dbMocks.values.mockReturnValue({
      onConflictDoNothing: dbMocks.onConflictDoNothing
    });
    dbMocks.insert.mockReturnValue({
      values: dbMocks.values
    });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("deduplicates usage rows when a source id is provided", async () => {
    const { recordUsage } = await import("@/lib/billing/usage");

    await recordUsage({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      type: "scheduled_post",
      sourceId: "scheduled_job_1"
    });

    expect(dbMocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "00000000-0000-0000-0000-000000000001",
        type: "scheduled_post",
        sourceId: "scheduled_job_1"
      })
    );
    expect(dbMocks.onConflictDoNothing).toHaveBeenCalledOnce();
  });

  it("keeps unsourced usage additive", async () => {
    const { recordUsage } = await import("@/lib/billing/usage");

    await recordUsage({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      type: "ai_generation"
    });

    expect(dbMocks.onConflictDoNothing).not.toHaveBeenCalled();
  });
});
