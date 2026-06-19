import { describe, expect, it } from "vitest";
import {
  canConsumeUsage,
  getRemainingUsage,
  getUsageLimit,
  hasFeature,
  normalizeBillingPlan
} from "@/lib/billing/entitlements";

describe("billing entitlements", () => {
  it("normalizes unknown plans to free", () => {
    expect(normalizeBillingPlan(null)).toBe("free");
    expect(normalizeBillingPlan("enterprise")).toBe("free");
    expect(normalizeBillingPlan("premium")).toBe("premium");
  });

  it("represents premium seven-post-per-day scheduling", () => {
    expect(getUsageLimit("premium", "scheduledPostsPerDay")).toBe(7);
    expect(canConsumeUsage({ plan: "premium", key: "scheduledPostsPerDay", used: 6 })).toBe(true);
    expect(canConsumeUsage({ plan: "premium", key: "scheduledPostsPerDay", used: 7 })).toBe(false);
  });

  it("keeps free scheduling limited below premium capacity", () => {
    expect(getUsageLimit("free", "scheduledPostsPerDay")).toBeLessThan(
      getUsageLimit("premium", "scheduledPostsPerDay")
    );
    expect(getRemainingUsage({ plan: "free", key: "scheduledPostsPerDay", used: 1 })).toBe(0);
  });

  it("gates premium-only features", () => {
    expect(hasFeature("free", "keywordAutoReplies")).toBe(false);
    expect(hasFeature("premium", "keywordAutoReplies")).toBe(true);
    expect(hasFeature("premium", "multiPlatformPublishing")).toBe(true);
  });

  it("rejects invalid usage consumption requests", () => {
    expect(canConsumeUsage({ plan: "premium", key: "aiGenerationsPerMonth", used: -1 })).toBe(false);
    expect(canConsumeUsage({ plan: "premium", key: "aiGenerationsPerMonth", used: 0, requested: 0 })).toBe(false);
    expect(canConsumeUsage({ plan: "premium", key: "aiGenerationsPerMonth", used: 0, requested: -5 })).toBe(false);
    expect(getRemainingUsage({ plan: "free", key: "aiGenerationsPerMonth", used: -4 })).toBe(
      getUsageLimit("free", "aiGenerationsPerMonth")
    );
  });
});
