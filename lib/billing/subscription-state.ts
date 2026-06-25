import {
  normalizeBillingPlan,
  type BillingPlan
} from "@/lib/billing/entitlements";

export type BillingSubscriptionStatus =
  | "active"
  | "past_due"
  | "canceled"
  | "ended"
  | "expired"
  | "abandoned"
  | "incomplete"
  | "upcoming";

const billingStatuses = new Set<BillingSubscriptionStatus>([
  "active",
  "past_due",
  "canceled",
  "ended",
  "expired",
  "abandoned",
  "incomplete",
  "upcoming"
]);

export function normalizeBillingSubscriptionStatus(
  status: string | null | undefined
): BillingSubscriptionStatus {
  if (status === "pastDue") {
    return "past_due";
  }

  return billingStatuses.has(status as BillingSubscriptionStatus)
    ? (status as BillingSubscriptionStatus)
    : "incomplete";
}

export function isBillingStatusEntitled(status: string | null | undefined) {
  return normalizeBillingSubscriptionStatus(status) === "active";
}

export function resolveEntitledBillingPlan({
  plan,
  status
}: {
  plan: string | null | undefined;
  status: string | null | undefined;
}): BillingPlan {
  return isBillingStatusEntitled(status) ? normalizeBillingPlan(plan) : "free";
}
