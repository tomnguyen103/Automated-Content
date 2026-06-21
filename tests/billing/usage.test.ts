import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  execute: vi.fn(async () => undefined),
  insert: vi.fn(),
  onConflictDoNothing: vi.fn(async () => undefined),
  transaction: vi.fn(),
  txInsert: vi.fn(),
  txSelect: vi.fn(),
  txValues: vi.fn(async () => undefined),
  values: vi.fn()
}));

vi.mock("@/db", () => ({
  getDb: vi.fn(() => ({
    insert: dbMocks.insert,
    transaction: dbMocks.transaction
  }))
}));

describe("recordUsage", () => {
  beforeEach(() => {
    vi.resetModules();
    dbMocks.execute.mockClear();
    dbMocks.insert.mockReset();
    dbMocks.values.mockReset();
    dbMocks.onConflictDoNothing.mockReset();
    dbMocks.transaction.mockReset();
    dbMocks.txInsert.mockReset();
    dbMocks.txSelect.mockReset();
    dbMocks.txValues.mockReset();
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

  it("consumes limited usage inside a transaction-scoped advisory lock", async () => {
    dbMocks.transaction.mockImplementation(async (callback) =>
      callback({
        execute: dbMocks.execute,
        insert: dbMocks.txInsert,
        select: dbMocks.txSelect
      })
    );

    const subscriptionLimit = vi.fn(async () => [{ plan: "free" }]);
    const subscriptionWhere = vi.fn(() => ({ limit: subscriptionLimit }));
    const subscriptionFrom = vi.fn(() => ({ where: subscriptionWhere }));
    const usageWhere = vi.fn(async () => [{ total: 0 }]);
    const usageFrom = vi.fn(() => ({ where: usageWhere }));
    dbMocks.txSelect
      .mockReturnValueOnce({ from: subscriptionFrom })
      .mockReturnValueOnce({ from: usageFrom });
    dbMocks.txInsert.mockReturnValue({ values: dbMocks.txValues });

    const { consumeUsageForLimit } = await import("@/lib/billing/usage");

    await consumeUsageForLimit({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      key: "scheduledPostsPerDay"
    });

    expect(dbMocks.transaction).toHaveBeenCalledOnce();
    expect(dbMocks.execute).toHaveBeenCalledOnce();
    expect(dbMocks.txValues).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "00000000-0000-0000-0000-000000000001",
        type: "scheduled_post",
        quantity: 1
      })
    );
  });
});
