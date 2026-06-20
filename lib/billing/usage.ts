import "server-only";

import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { subscriptions, usageLedger, type usageEventTypeEnum } from "@/db/schema";
import {
  canConsumeUsage,
  getRemainingUsage,
  getUsageLimit,
  normalizeBillingPlan,
  type BillingPlan,
  type UsageLimitKey
} from "@/lib/billing/entitlements";

export type UsageEventType = (typeof usageEventTypeEnum.enumValues)[number];

export type UsageMetric = {
  key: UsageLimitKey;
  label: string;
  used: number;
  limit: number;
  remaining: number;
  allowed: boolean;
  cadence: "daily" | "monthly" | "current";
};

export const usageLimitToLedgerType: Record<UsageLimitKey, UsageEventType | null> = {
  aiGenerationsPerMonth: "ai_generation",
  scheduledPostsPerDay: "scheduled_post",
  providerConnections: null,
  mediaTransformsPerMonth: "media_transform",
  autoRepliesPerMonth: "auto_reply"
};

export const usageMetricLabels: Record<UsageLimitKey, string> = {
  aiGenerationsPerMonth: "AI generations",
  scheduledPostsPerDay: "Scheduled posts",
  providerConnections: "Provider connections",
  mediaTransformsPerMonth: "Media transforms",
  autoRepliesPerMonth: "Auto replies"
};

const usageCadence: Record<UsageLimitKey, UsageMetric["cadence"]> = {
  aiGenerationsPerMonth: "monthly",
  scheduledPostsPerDay: "daily",
  providerConnections: "current",
  mediaTransformsPerMonth: "monthly",
  autoRepliesPerMonth: "monthly"
};

export function buildUsageMetric(plan: BillingPlan, key: UsageLimitKey, used: number): UsageMetric {
  return {
    key,
    label: usageMetricLabels[key],
    used,
    limit: getUsageLimit(plan, key),
    remaining: getRemainingUsage({ plan, key, used }),
    allowed: canConsumeUsage({ plan, key, used }),
    cadence: usageCadence[key]
  };
}

export function buildUsageMetrics(plan: BillingPlan, used: Partial<Record<UsageLimitKey, number>>) {
  return (Object.keys(usageMetricLabels) as UsageLimitKey[]).map((key) =>
    buildUsageMetric(plan, key, used[key] ?? 0)
  );
}

export async function getWorkspaceBillingState({
  workspaceId,
  now = new Date()
}: {
  workspaceId: string;
  now?: Date;
}) {
  const db = getDb();
  const [subscription] = await db
    .select({ plan: subscriptions.plan })
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspaceId))
    .limit(1);
  const activePlan = normalizeBillingPlan(subscription?.plan);
  const used: Partial<Record<UsageLimitKey, number>> = {};

  await Promise.all(
    (Object.keys(usageMetricLabels) as UsageLimitKey[]).map(async (key) => {
      const ledgerType = usageLimitToLedgerType[key];
      used[key] = ledgerType
        ? await getLedgerUsageTotal({
            workspaceId,
            type: ledgerType,
            since: getUsageWindowStart(key, now)
          })
        : 0;
    })
  );

  return {
    activePlan,
    usageMetrics: buildUsageMetrics(activePlan, used)
  };
}

export function getUsageWindowStart(key: UsageLimitKey, now = new Date()) {
  if (usageCadence[key] === "daily") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  if (usageCadence[key] === "monthly") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }

  return null;
}

export async function recordUsage({
  workspaceId,
  type,
  quantity = 1,
  sourceId,
  metadata
}: {
  workspaceId: string;
  type: UsageEventType;
  quantity?: number;
  sourceId?: string;
  metadata?: Record<string, unknown>;
}) {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error("Usage quantity must be a positive integer.");
  }

  const db = getDb();

  await db.insert(usageLedger).values({
    workspaceId,
    type,
    quantity,
    sourceId,
    metadata
  });
}

export async function getLedgerUsageTotal({
  workspaceId,
  type,
  since
}: {
  workspaceId: string;
  type: UsageEventType;
  since: Date | null;
}) {
  const db = getDb();
  const conditions = [eq(usageLedger.workspaceId, workspaceId), eq(usageLedger.type, type)];

  if (since) {
    conditions.push(gte(usageLedger.occurredAt, since));
  }

  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${usageLedger.quantity}), 0)::int` })
    .from(usageLedger)
    .where(and(...conditions));

  return row?.total ?? 0;
}
