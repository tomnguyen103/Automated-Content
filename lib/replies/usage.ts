import "server-only";

import type { UsageMetric } from "@/lib/billing/usage";
import { getWorkspaceBillingState, recordUsage } from "@/lib/billing/usage";

export type AutoReplyUsageInput = {
  workspaceId: string;
  commentId: string;
  ruleId?: string;
  now?: Date;
};

export type AutoReplyUsageDecision = {
  allowed: boolean;
  reason?: string;
  metric?: UsageMetric;
};

export type AutoReplyUsageEnforcer = (input: AutoReplyUsageInput) => Promise<AutoReplyUsageDecision>;

export async function enforceAutoReplyUsage({
  commentId,
  now = new Date(),
  ruleId,
  workspaceId
}: AutoReplyUsageInput): Promise<AutoReplyUsageDecision> {
  const billingState = await getWorkspaceBillingState({ workspaceId, now });
  const metric = billingState.usageMetrics.find((candidate) => candidate.key === "autoRepliesPerMonth");

  if (!metric?.allowed) {
    return {
      allowed: false,
      reason: "Auto reply usage is not available for this workspace plan or monthly limit.",
      metric
    };
  }

  await recordUsage({
    workspaceId,
    type: "auto_reply",
    quantity: 1,
    sourceId: commentId,
    metadata: {
      ruleId
    }
  });

  return {
    allowed: true,
    metric
  };
}

export async function allowLocalPreviewAutoReplyUsage(): Promise<AutoReplyUsageDecision> {
  return {
    allowed: true,
    reason: "Local preview auto replies use a non-billed in-memory enforcer."
  };
}
