import { describe, expect, it } from "vitest";
import {
  isBillingStatusEntitled,
  normalizeBillingSubscriptionStatus,
  resolveEntitledBillingPlan
} from "@/lib/billing/subscription-state";

describe("billing subscription state", () => {
  it("normalizes Clerk status names into stored subscription states", () => {
    expect(normalizeBillingSubscriptionStatus("active")).toBe("active");
    expect(normalizeBillingSubscriptionStatus("pastDue")).toBe("past_due");
    expect(normalizeBillingSubscriptionStatus("past_due")).toBe("past_due");
    expect(normalizeBillingSubscriptionStatus("unexpected")).toBe("incomplete");
  });

  it("only grants paid entitlements for active billing status", () => {
    expect(isBillingStatusEntitled("active")).toBe(true);
    expect(isBillingStatusEntitled("past_due")).toBe(false);
    expect(isBillingStatusEntitled("canceled")).toBe(false);
    expect(resolveEntitledBillingPlan({ plan: "premium", status: "active" })).toBe("premium");
    expect(resolveEntitledBillingPlan({ plan: "premium", status: "canceled" })).toBe("free");
    expect(resolveEntitledBillingPlan({ plan: "premium", status: "pastDue" })).toBe("free");
  });
});
