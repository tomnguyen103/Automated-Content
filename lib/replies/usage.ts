import "server-only";

import type { UsageMetric } from "@/lib/billing/usage";
import {
  consumeUsageForLimit,
  UsageLimitExceededError
} from "@/lib/billing/usage";

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
export type AutoReplyUsageRecorder = (input: AutoReplyUsageInput) => Promise<void>;

export async function enforceAutoReplyUsage({
  commentId,
  now = new Date(),
  ruleId,
  workspaceId
}: AutoReplyUsageInput): Promise<AutoReplyUsageDecision> {
  try {
    const metric = await consumeUsageForLimit({
      workspaceId,
      key: "autoRepliesPerMonth",
      sourceId: commentId,
      metadata: {
        ruleId
      },
      now
    });

    return {
      allowed: true,
      metric: metric ?? undefined
    };
  } catch (error) {
    if (error instanceof UsageLimitExceededError) {
      return {
        allowed: false,
        reason: "Auto reply usage is not available for this workspace plan or monthly limit.",
        metric: error.metric
      };
    }

    throw error;
  }
}

export async function recordAutoReplyUsage() {
  // Production usage is reserved by enforceAutoReplyUsage before the external provider call.
}

export async function allowLocalPreviewAutoReplyUsage(): Promise<AutoReplyUsageDecision> {
  return {
    allowed: true,
    reason: "Local preview auto replies use a non-billed in-memory enforcer."
  };
}

export async function recordLocalPreviewAutoReplyUsage() {}
