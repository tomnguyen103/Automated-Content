import "server-only";

import { and, desc, eq, gte, ne, sql } from "drizzle-orm";
import { getDb, type DatabaseClient } from "@/db";
import {
  agentMissions,
  brandMemoryProposals,
  connectedAccounts,
  subscriptions,
  usageLedger,
  type usageEventTypeEnum
} from "@/db/schema";
import {
  canConsumeUsage,
  getRemainingUsage,
  getUsageLimit,
  hasFeature,
  normalizeBillingPlan,
  type BillingPlan,
  type FeatureKey,
  type UsageLimitKey
} from "@/lib/billing/entitlements";
import { isDatabaseConfigured } from "@/lib/env";

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

type UsageTransaction = Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0];

export type ConsumeUsageForLimitInput = {
  workspaceId: string;
  key: UsageLimitKey;
  quantity?: number;
  sourceId?: string;
  metadata?: Record<string, unknown>;
  now?: Date;
  skip?: boolean;
};

export type UsageLedgerRecord = {
  id: string;
  workspaceId: string;
  type: UsageEventType;
  quantity: number;
  sourceId?: string;
  metadata?: Record<string, unknown>;
  occurredAt: string;
};

export class UsageLimitExceededError extends Error {
  readonly metric: UsageMetric;

  constructor(metric: UsageMetric) {
    super(`${metric.label} limit reached for the current plan.`);
    this.name = "UsageLimitExceededError";
    this.metric = metric;
  }
}

export class FeatureAccessError extends Error {
  readonly feature: FeatureKey;
  readonly plan: BillingPlan;
  readonly requiredPlan = "premium";

  constructor({
    feature,
    plan
  }: {
    feature: FeatureKey;
    plan: BillingPlan;
  }) {
    super("This feature requires a Premium plan.");
    this.name = "FeatureAccessError";
    this.feature = feature;
    this.plan = plan;
  }
}

export const usageLimitToLedgerType: Record<UsageLimitKey, UsageEventType | null> = {
  aiGenerationsPerMonth: "ai_generation",
  scheduledPostsPerDay: "scheduled_post",
  providerConnections: null,
  mediaTransformsPerMonth: "media_transform",
  autoRepliesPerMonth: "auto_reply",
  agentMissionsPerMonth: null,
  brandMemoryProposalsPerMonth: null
};

export const usageMetricLabels: Record<UsageLimitKey, string> = {
  aiGenerationsPerMonth: "AI generations",
  scheduledPostsPerDay: "Scheduled posts",
  providerConnections: "Provider connections",
  mediaTransformsPerMonth: "Media transforms",
  autoRepliesPerMonth: "Auto replies",
  agentMissionsPerMonth: "Agent missions",
  brandMemoryProposalsPerMonth: "Brand memory proposals"
};

const usageCadence: Record<UsageLimitKey, UsageMetric["cadence"]> = {
  aiGenerationsPerMonth: "monthly",
  scheduledPostsPerDay: "daily",
  providerConnections: "current",
  mediaTransformsPerMonth: "monthly",
  autoRepliesPerMonth: "monthly",
  agentMissionsPerMonth: "monthly",
  brandMemoryProposalsPerMonth: "monthly"
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

export async function ensureUsageAllowed({
  quantity = 1,
  workspaceId,
  key,
  now = new Date(),
  skip = false
}: {
  workspaceId: string;
  key: UsageLimitKey;
  quantity?: number;
  now?: Date;
  skip?: boolean;
}) {
  if (skip) {
    return null;
  }

  const billingState = await getWorkspaceBillingState({ workspaceId, now });
  const metric = billingState.usageMetrics.find((candidate) => candidate.key === key);

  if (!metric) {
    throw new Error(`Usage metric ${key} is not configured.`);
  }

  if (!canConsumeUsage({ plan: billingState.activePlan, key, used: metric.used, requested: quantity })) {
    throw new UsageLimitExceededError({
      ...metric,
      allowed: false
    });
  }

  return metric;
}

export async function withUsageLimitLock<T>({
  key,
  workspaceId,
  skip = false
}: {
  workspaceId: string;
  key: UsageLimitKey;
  skip?: boolean;
}, callback: () => Promise<T>) {
  if (skip) {
    return callback();
  }

  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${workspaceId}), hashtext(${key}))`);
    return callback();
  });
}

export async function getWorkspaceBillingPlan(workspaceId: string): Promise<BillingPlan> {
  const [subscription] = await getDb()
    .select({ plan: subscriptions.plan })
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspaceId))
    .limit(1);

  return normalizeBillingPlan(subscription?.plan);
}

export async function ensureFeatureAllowed({
  feature,
  workspaceId,
  skip = false
}: {
  workspaceId: string;
  feature: FeatureKey;
  skip?: boolean;
}) {
  if (skip) {
    return null;
  }

  const plan = await getWorkspaceBillingPlan(workspaceId);

  if (!hasFeature(plan, feature)) {
    throw new FeatureAccessError({
      feature,
      plan
    });
  }

  return {
    feature,
    plan
  };
}

export async function recordUsageForLimit({
  workspaceId,
  key,
  quantity = 1,
  sourceId,
  metadata,
  skip = false
}: {
  workspaceId: string;
  key: UsageLimitKey;
  quantity?: number;
  sourceId?: string;
  metadata?: Record<string, unknown>;
  skip?: boolean;
}) {
  if (skip) {
    return;
  }

  const type = usageLimitToLedgerType[key];

  if (!type) {
    throw new Error(`Usage metric ${key} does not map to a ledger event type.`);
  }

  await recordUsage({
    workspaceId,
    type,
    quantity,
    sourceId,
    metadata
  });
}

export async function consumeUsageForLimit({
  workspaceId,
  key,
  quantity = 1,
  sourceId,
  metadata,
  now = new Date(),
  skip = false
}: ConsumeUsageForLimitInput) {
  if (skip) {
    return null;
  }

  return getDb().transaction((tx) =>
    consumeUsageForLimitInTransaction({
      tx,
      workspaceId,
      key,
      quantity,
      sourceId,
      metadata,
      now,
      skip
    })
  );
}

export async function consumeUsageForLimitInTransaction({
  tx,
  workspaceId,
  key,
  quantity = 1,
  sourceId,
  metadata,
  now = new Date(),
  skip = false
}: ConsumeUsageForLimitInput & { tx: UsageTransaction }) {
  if (skip) {
    return null;
  }

  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error("Usage quantity must be a positive integer.");
  }

  const type = usageLimitToLedgerType[key];

  if (!type) {
    throw new Error(`Usage metric ${key} does not map to a ledger event type.`);
  }

  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${workspaceId}), hashtext(${key}))`);

  const [subscription] = await tx
    .select({ plan: subscriptions.plan })
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspaceId))
    .limit(1);
  const activePlan = normalizeBillingPlan(subscription?.plan);
  const conditions = [eq(usageLedger.workspaceId, workspaceId), eq(usageLedger.type, type)];
  const since = getUsageWindowStart(key, now);

  if (since) {
    conditions.push(gte(usageLedger.occurredAt, since));
  }

  const [usageTotal] = await tx
    .select({ total: sql<number>`coalesce(sum(${usageLedger.quantity}), 0)::int` })
    .from(usageLedger)
    .where(and(...conditions));
  const used = usageTotal?.total ?? 0;
  const metric = buildUsageMetric(activePlan, key, used);

  if (sourceId) {
    const [existing] = await tx
      .select({ id: usageLedger.id })
      .from(usageLedger)
      .where(
        and(
          eq(usageLedger.workspaceId, workspaceId),
          eq(usageLedger.type, type),
          eq(usageLedger.sourceId, sourceId)
        )
      )
      .limit(1);

    if (existing) {
      return metric;
    }
  }

  if (!canConsumeUsage({ plan: activePlan, key, used, requested: quantity })) {
    throw new UsageLimitExceededError({
      ...metric,
      allowed: false
    });
  }

  const insert = tx.insert(usageLedger).values({
    workspaceId,
    type,
    quantity,
    sourceId,
    metadata
  });

  if (sourceId) {
    await insert.onConflictDoNothing({
      target: [usageLedger.workspaceId, usageLedger.type, usageLedger.sourceId],
      where: sql`${usageLedger.sourceId} is not null`
    });
  } else {
    await insert;
  }

  return buildUsageMetric(activePlan, key, used + quantity);
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
        : await getCountedUsageTotal({
            key,
            workspaceId,
            since: getUsageWindowStart(key, now)
          });
    })
  );

  return {
    activePlan,
    usageMetrics: buildUsageMetrics(activePlan, used)
  };
}

async function getCountedUsageTotal({
  key,
  since,
  workspaceId
}: {
  workspaceId: string;
  key: UsageLimitKey;
  since: Date | null;
}) {
  const db = getDb();

  if (key === "providerConnections") {
    const [row] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(connectedAccounts)
      .where(
        and(
          eq(connectedAccounts.workspaceId, workspaceId),
          ne(connectedAccounts.status, "disconnected")
        )
      );

    return row?.total ?? 0;
  }

  if (key === "agentMissionsPerMonth") {
    const conditions = [eq(agentMissions.workspaceId, workspaceId)];

    if (since) {
      conditions.push(gte(agentMissions.createdAt, since));
    }

    const [row] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(agentMissions)
      .where(and(...conditions));

    return row?.total ?? 0;
  }

  if (key === "brandMemoryProposalsPerMonth") {
    const conditions = [eq(brandMemoryProposals.workspaceId, workspaceId)];

    if (since) {
      conditions.push(gte(brandMemoryProposals.createdAt, since));
    }

    const [row] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(brandMemoryProposals)
      .where(and(...conditions));

    return row?.total ?? 0;
  }

  return 0;
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

  const insert = db.insert(usageLedger).values({
    workspaceId,
    type,
    quantity,
    sourceId,
    metadata
  });

  if (sourceId) {
    await insert.onConflictDoNothing({
      target: [usageLedger.workspaceId, usageLedger.type, usageLedger.sourceId],
      where: sql`${usageLedger.sourceId} is not null`
    });
    return;
  }

  await insert;
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

export async function listUsageLedgerRecords({
  limit = 100,
  workspaceId
}: {
  workspaceId: string;
  limit?: number;
}): Promise<UsageLedgerRecord[]> {
  if (!isDatabaseConfigured) {
    return [];
  }

  const rows = await getDb()
    .select()
    .from(usageLedger)
    .where(eq(usageLedger.workspaceId, workspaceId))
    .orderBy(desc(usageLedger.occurredAt))
    .limit(Math.max(1, Math.min(500, Math.floor(limit))));

  return rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspaceId,
    type: row.type,
    quantity: row.quantity,
    sourceId: row.sourceId ?? undefined,
    metadata: row.metadata ?? undefined,
    occurredAt: row.occurredAt.toISOString()
  }));
}
