import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const billingMocks = vi.hoisted(() => {
  class UsageLimitExceededError extends Error {
    readonly metric: unknown;

    constructor(metric: unknown) {
      super("Usage limit exceeded.");
      this.name = "UsageLimitExceededError";
      this.metric = metric;
    }
  }

  return {
    consumeUsageForLimit: vi.fn(),
    UsageLimitExceededError
  };
});

vi.mock("@/lib/billing/usage", () => ({
  consumeUsageForLimit: billingMocks.consumeUsageForLimit,
  UsageLimitExceededError: billingMocks.UsageLimitExceededError
}));

describe("auto reply usage", () => {
  beforeEach(() => {
    vi.resetModules();
    billingMocks.consumeUsageForLimit.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("atomically consumes auto reply usage before provider send", async () => {
    const now = new Date("2026-06-20T12:00:00.000Z");
    const metric = {
      key: "autoRepliesPerMonth",
      label: "Auto replies",
      used: 1,
      limit: 500,
      remaining: 499,
      allowed: true,
      cadence: "monthly"
    };
    billingMocks.consumeUsageForLimit.mockResolvedValue(metric);

    const { enforceAutoReplyUsage } = await import("@/lib/replies/usage");
    const result = await enforceAutoReplyUsage({
      workspaceId: "workspace_1",
      commentId: "comment_1",
      ruleId: "rule_1",
      now
    });

    expect(result).toEqual({
      allowed: true,
      metric
    });
    expect(billingMocks.consumeUsageForLimit).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      key: "autoRepliesPerMonth",
      sourceId: "comment_1",
      metadata: {
        ruleId: "rule_1"
      },
      now
    });
  });

  it("returns a denial decision when the paid plan limit is exhausted", async () => {
    const metric = {
      key: "autoRepliesPerMonth",
      label: "Auto replies",
      used: 0,
      limit: 0,
      remaining: 0,
      allowed: false,
      cadence: "monthly"
    };
    billingMocks.consumeUsageForLimit.mockRejectedValue(new billingMocks.UsageLimitExceededError(metric));

    const { enforceAutoReplyUsage } = await import("@/lib/replies/usage");
    const result = await enforceAutoReplyUsage({
      workspaceId: "workspace_1",
      commentId: "comment_1"
    });

    expect(result).toEqual({
      allowed: false,
      reason: "Auto reply usage is not available for this workspace plan or monthly limit.",
      metric
    });
  });
});
