export type BillingPlan = "free" | "premium";

export type UsageLimitKey =
  | "aiGenerationsPerMonth"
  | "scheduledPostsPerDay"
  | "providerConnections"
  | "mediaTransformsPerMonth"
  | "autoRepliesPerMonth";

export type FeatureKey =
  | "multiPlatformPublishing"
  | "advancedAiGeneration"
  | "imageTransformations"
  | "keywordAutoReplies"
  | "analyticsHistory";

export type PlanEntitlements = {
  label: string;
  description: string;
  price: string;
  limits: Record<UsageLimitKey, number>;
  features: Record<FeatureKey, boolean>;
};

export const planEntitlements = {
  free: {
    label: "Free",
    description: "For validating the workflow with a small posting cadence.",
    price: "$0",
    limits: {
      aiGenerationsPerMonth: 25,
      scheduledPostsPerDay: 1,
      providerConnections: 1,
      mediaTransformsPerMonth: 10,
      autoRepliesPerMonth: 0
    },
    features: {
      multiPlatformPublishing: false,
      advancedAiGeneration: false,
      imageTransformations: false,
      keywordAutoReplies: false,
      analyticsHistory: false
    }
  },
  premium: {
    label: "Premium",
    description: "For daily multi-platform automation with reply and media workflows.",
    price: "$29",
    limits: {
      aiGenerationsPerMonth: 1000,
      scheduledPostsPerDay: 7,
      providerConnections: 8,
      mediaTransformsPerMonth: 250,
      autoRepliesPerMonth: 500
    },
    features: {
      multiPlatformPublishing: true,
      advancedAiGeneration: true,
      imageTransformations: true,
      keywordAutoReplies: true,
      analyticsHistory: true
    }
  }
} as const satisfies Record<BillingPlan, PlanEntitlements>;

export function normalizeBillingPlan(plan: string | null | undefined): BillingPlan {
  return plan === "premium" ? "premium" : "free";
}

export function getPlanEntitlements(plan: string | null | undefined) {
  return planEntitlements[normalizeBillingPlan(plan)];
}

export function getUsageLimit(plan: string | null | undefined, key: UsageLimitKey) {
  return getPlanEntitlements(plan).limits[key];
}

export function getRemainingUsage({
  plan,
  key,
  used
}: {
  plan: string | null | undefined;
  key: UsageLimitKey;
  used: number;
}) {
  const normalizedUsed = Number.isFinite(used) ? Math.max(used, 0) : 0;
  return Math.max(getUsageLimit(plan, key) - normalizedUsed, 0);
}

export function canConsumeUsage({
  plan,
  key,
  used,
  requested = 1
}: {
  plan: string | null | undefined;
  key: UsageLimitKey;
  used: number;
  requested?: number;
}) {
  if (!Number.isFinite(used) || !Number.isFinite(requested) || used < 0 || requested < 1) {
    return false;
  }

  return used + requested <= getUsageLimit(plan, key);
}

export function hasFeature(plan: string | null | undefined, key: FeatureKey) {
  return getPlanEntitlements(plan).features[key];
}
