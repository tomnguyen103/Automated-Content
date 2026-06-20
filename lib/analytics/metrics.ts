import "server-only";

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  agentRuns,
  commentEvents,
  platformVariants,
  replyAttempts,
  scheduledJobs,
  usageLedger
} from "@/db/schema";
import { isDatabaseConfigured } from "@/lib/env";

export type AnalyticsPlatformKey =
  | "linkedin"
  | "x"
  | "instagram"
  | "facebook"
  | "tiktok"
  | "threads"
  | "mock"
  | "meta"
  | "slack"
  | "discord";

export type PostingMetricRow = {
  id: string;
  platform: AnalyticsPlatformKey;
  provider: string;
  status: "scheduled" | "queued" | "publishing" | "published" | "failed" | "canceled";
  scheduledFor: Date;
  publishedAt?: Date | null;
  failedAt?: Date | null;
  createdAt: Date;
};

export type CommentMetricRow = {
  id: string;
  platform: AnalyticsPlatformKey;
  status: "new" | "matched" | "awaiting_approval" | "replied" | "ignored" | "failed";
  receivedAt: Date;
};

export type ReplyAttemptMetricRow = {
  id: string;
  provider: string;
  platform: AnalyticsPlatformKey;
  status: "approved" | "awaiting_approval" | "sent" | "failed" | "skipped";
  error?: string | null;
  createdAt: Date;
  sentAt?: Date | null;
};

export type UsageMetricRow = {
  id: string;
  type: "ai_generation" | "scheduled_post" | "publish_attempt" | "media_transform" | "auto_reply";
  quantity: number;
  occurredAt: Date;
};

export type AgentRunMetricRow = {
  id: string;
  traceId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  provider: "openai" | "gemini";
  model: string;
  toolCalls: Array<Record<string, unknown>>;
  error?: string | null;
  startedAt: Date;
  completedAt?: Date | null;
};

export type AnalyticsAggregationInput = {
  posts: PostingMetricRow[];
  comments: CommentMetricRow[];
  replies: ReplyAttemptMetricRow[];
  usage: UsageMetricRow[];
  agentRuns: AgentRunMetricRow[];
  summary?: AnalyticsAggregateSummary;
  now?: Date;
};

export type AnalyticsStat = {
  value: number;
  label: string;
  detail: string;
};

export type PlatformBreakdownItem = {
  platform: string;
  posts: number;
  published: number;
  comments: number;
  replies: number;
  failures: number;
};

export type UsageBreakdownItem = {
  type: UsageMetricRow["type"];
  label: string;
  quantity: number;
};

export type UsageChartPoint = {
  date: string;
  label: string;
  quantity: number;
};

export type AgentRunSummary = {
  id: string;
  traceId: string;
  status: AgentRunMetricRow["status"];
  provider: AgentRunMetricRow["provider"];
  model: string;
  toolCallCount: number;
  durationMs: number | null;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
};

export type AnalyticsSnapshot = {
  generatedAt: string;
  posting: {
    total: number;
    scheduled: number;
    queued: number;
    publishing: number;
    published: number;
    failed: number;
    canceled: number;
  };
  failures: {
    total: number;
    publishing: number;
    replies: number;
    agents: number;
  };
  replies: {
    comments: number;
    matched: number;
    awaitingApproval: number;
    sent: number;
    failed: number;
  };
  usage: {
    totalQuantity: number;
    byType: UsageBreakdownItem[];
    daily: UsageChartPoint[];
  };
  agents: {
    total: number;
    running: number;
    succeeded: number;
    failed: number;
    averageToolCalls: number;
    recent: AgentRunSummary[];
  };
  platformBreakdown: PlatformBreakdownItem[];
};

type AnalyticsAgentOverview = Omit<AnalyticsSnapshot["agents"], "recent">;

type AnalyticsAggregateSummary = {
  posting: AnalyticsSnapshot["posting"];
  replies: AnalyticsSnapshot["replies"];
  usage: AnalyticsSnapshot["usage"];
  agents: AnalyticsAgentOverview;
  platformBreakdown: PlatformBreakdownItem[];
};

const usageTypeLabels: Record<UsageMetricRow["type"], string> = {
  ai_generation: "AI generations",
  scheduled_post: "Scheduled posts",
  publish_attempt: "Publish attempts",
  media_transform: "Media transforms",
  auto_reply: "Auto replies"
};

const platformLabels: Record<AnalyticsPlatformKey, string> = {
  linkedin: "LinkedIn",
  x: "X",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  threads: "Threads",
  mock: "Mock",
  meta: "Meta",
  slack: "Slack",
  discord: "Discord"
};

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDateLabel(key: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${key}T00:00:00.000Z`));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function createEmptyPlatformItem(platform: AnalyticsPlatformKey): PlatformBreakdownItem {
  return {
    platform: platformLabels[platform] ?? platform,
    posts: 0,
    published: 0,
    comments: 0,
    replies: 0,
    failures: 0
  };
}

function getPlatformItem(
  map: Map<AnalyticsPlatformKey, PlatformBreakdownItem>,
  platform: AnalyticsPlatformKey
) {
  const existing = map.get(platform);

  if (existing) {
    return existing;
  }

  const item = createEmptyPlatformItem(platform);
  map.set(platform, item);
  return item;
}

function countByStatus<T extends string>(rows: Array<{ status: T }>, status: T) {
  return rows.filter((row) => row.status === status).length;
}

function numberOrZero(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function startOfUtcDate(date: Date) {
  return new Date(`${dateKey(date)}T00:00:00.000Z`);
}

function buildPostingSummary(posts: PostingMetricRow[]): AnalyticsSnapshot["posting"] {
  return {
    total: posts.length,
    scheduled: countByStatus(posts, "scheduled"),
    queued: countByStatus(posts, "queued"),
    publishing: countByStatus(posts, "publishing"),
    published: countByStatus(posts, "published"),
    failed: countByStatus(posts, "failed"),
    canceled: countByStatus(posts, "canceled")
  };
}

function buildReplySummary(
  comments: CommentMetricRow[],
  replies: ReplyAttemptMetricRow[]
): AnalyticsSnapshot["replies"] {
  return {
    comments: comments.length,
    matched: countByStatus(comments, "matched"),
    awaitingApproval:
      countByStatus(comments, "awaiting_approval") + countByStatus(replies, "awaiting_approval"),
    sent: countByStatus(replies, "sent") + countByStatus(replies, "approved"),
    failed: countByStatus(replies, "failed")
  };
}

function buildUsageBreakdown(usageRows: UsageMetricRow[]): UsageBreakdownItem[] {
  const totals = new Map<UsageMetricRow["type"], number>();

  for (const row of usageRows) {
    totals.set(row.type, (totals.get(row.type) ?? 0) + row.quantity);
  }

  return [...totals.entries()]
    .map(([type, quantity]) => ({
      type,
      label: usageTypeLabels[type],
      quantity
    }))
    .sort((a, b) => b.quantity - a.quantity || a.label.localeCompare(b.label));
}

function buildDailyUsage(usageRows: UsageMetricRow[], now: Date, days = 14): UsageChartPoint[] {
  const totals = new Map<string, number>();
  const start = addDays(now, -(days - 1));

  for (let index = 0; index < days; index += 1) {
    const key = dateKey(addDays(start, index));
    totals.set(key, 0);
  }

  for (const row of usageRows) {
    const key = dateKey(row.occurredAt);
    if (totals.has(key)) {
      totals.set(key, (totals.get(key) ?? 0) + row.quantity);
    }
  }

  return [...totals.entries()].map(([date, quantity]) => ({
    date,
    label: formatDateLabel(date),
    quantity
  }));
}

function buildDailyUsageFromTotals(totals: Map<string, number>, now: Date, days = 14): UsageChartPoint[] {
  const start = addDays(now, -(days - 1));
  const points: UsageChartPoint[] = [];

  for (let index = 0; index < days; index += 1) {
    const date = dateKey(addDays(start, index));
    points.push({
      date,
      label: formatDateLabel(date),
      quantity: totals.get(date) ?? 0
    });
  }

  return points;
}

function buildUsageSummary(usageRows: UsageMetricRow[], now: Date): AnalyticsSnapshot["usage"] {
  return {
    totalQuantity: usageRows.reduce((sum, row) => sum + row.quantity, 0),
    byType: buildUsageBreakdown(usageRows),
    daily: buildDailyUsage(usageRows, now)
  };
}

function buildPlatformBreakdown({
  comments,
  posts,
  replies
}: Pick<AnalyticsAggregationInput, "comments" | "posts" | "replies">) {
  const platforms = new Map<AnalyticsPlatformKey, PlatformBreakdownItem>();

  for (const post of posts) {
    const item = getPlatformItem(platforms, post.platform);
    item.posts += 1;
    if (post.status === "published") {
      item.published += 1;
    }
    if (post.status === "failed") {
      item.failures += 1;
    }
  }

  for (const comment of comments) {
    const item = getPlatformItem(platforms, comment.platform);
    item.comments += 1;
    if (comment.status === "failed") {
      item.failures += 1;
    }
  }

  for (const reply of replies) {
    const item = getPlatformItem(platforms, reply.platform);
    if (reply.status === "sent" || reply.status === "approved") {
      item.replies += 1;
    }
    if (reply.status === "failed") {
      item.failures += 1;
    }
  }

  return [...platforms.values()].sort(
    (a, b) =>
      b.posts + b.comments + b.replies - (a.posts + a.comments + a.replies) ||
      a.platform.localeCompare(b.platform)
  );
}

function buildPlatformBreakdownFromAggregates({
  comments,
  posts,
  replies
}: {
  comments: Array<{ platform: AnalyticsPlatformKey; comments: number | string; failures: number | string }>;
  posts: Array<{
    platform: AnalyticsPlatformKey;
    posts: number | string;
    published: number | string;
    failures: number | string;
  }>;
  replies: Array<{ platform: AnalyticsPlatformKey; replies: number | string; failures: number | string }>;
}) {
  const platforms = new Map<AnalyticsPlatformKey, PlatformBreakdownItem>();

  for (const row of posts) {
    const item = getPlatformItem(platforms, row.platform);
    item.posts += numberOrZero(row.posts);
    item.published += numberOrZero(row.published);
    item.failures += numberOrZero(row.failures);
  }

  for (const row of comments) {
    const item = getPlatformItem(platforms, row.platform);
    item.comments += numberOrZero(row.comments);
    item.failures += numberOrZero(row.failures);
  }

  for (const row of replies) {
    const item = getPlatformItem(platforms, row.platform);
    item.replies += numberOrZero(row.replies);
    item.failures += numberOrZero(row.failures);
  }

  return [...platforms.values()].sort(
    (a, b) =>
      b.posts + b.comments + b.replies - (a.posts + a.comments + a.replies) ||
      a.platform.localeCompare(b.platform)
  );
}

function summarizeAgentRun(row: AgentRunMetricRow): AgentRunSummary {
  const completedAt = row.completedAt ?? null;

  return {
    id: row.id,
    traceId: row.traceId,
    status: row.status,
    provider: row.provider,
    model: row.model,
    toolCallCount: row.toolCalls.length,
    durationMs: completedAt ? Math.max(0, completedAt.getTime() - row.startedAt.getTime()) : null,
    startedAt: row.startedAt.toISOString(),
    completedAt: completedAt?.toISOString() ?? null,
    error: row.error ?? null
  };
}

function buildAgentOverview(agentRunRows: AgentRunMetricRow[]): AnalyticsAgentOverview {
  const totalToolCalls = agentRunRows.reduce((sum, run) => sum + run.toolCalls.length, 0);

  return {
    total: agentRunRows.length,
    running: countByStatus(agentRunRows, "running") + countByStatus(agentRunRows, "queued"),
    succeeded: countByStatus(agentRunRows, "succeeded"),
    failed: countByStatus(agentRunRows, "failed"),
    averageToolCalls: agentRunRows.length > 0 ? Math.round((totalToolCalls / agentRunRows.length) * 10) / 10 : 0
  };
}

export function aggregateAnalyticsMetrics({
  agentRuns: agentRunRows,
  comments,
  now = new Date(),
  posts,
  replies,
  summary,
  usage
}: AnalyticsAggregationInput): AnalyticsSnapshot {
  const posting = summary?.posting ?? buildPostingSummary(posts);
  const repliesSummary = summary?.replies ?? buildReplySummary(comments, replies);
  const usageSummary = summary?.usage ?? buildUsageSummary(usage, now);
  const agentOverview = summary?.agents ?? buildAgentOverview(agentRunRows);
  const publishingFailures = posting.failed;
  const replyFailures = repliesSummary.failed;
  const agentFailures = agentOverview.failed;

  return {
    generatedAt: now.toISOString(),
    posting,
    failures: {
      total: publishingFailures + replyFailures + agentFailures,
      publishing: publishingFailures,
      replies: replyFailures,
      agents: agentFailures
    },
    replies: repliesSummary,
    usage: usageSummary,
    agents: {
      ...agentOverview,
      recent: [...agentRunRows]
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
        .slice(0, 8)
        .map(summarizeAgentRun)
    },
    platformBreakdown: summary?.platformBreakdown ?? buildPlatformBreakdown({ comments, posts, replies })
  };
}

function createPreviewAnalyticsSnapshot(now = new Date()) {
  const posts: PostingMetricRow[] = [
    {
      id: "preview-post-1",
      platform: "linkedin",
      provider: "linkedin",
      status: "published",
      scheduledFor: addDays(now, -3),
      publishedAt: addDays(now, -3),
      failedAt: null,
      createdAt: addDays(now, -4)
    },
    {
      id: "preview-post-2",
      platform: "x",
      provider: "x",
      status: "queued",
      scheduledFor: addDays(now, 1),
      publishedAt: null,
      failedAt: null,
      createdAt: addDays(now, -1)
    },
    {
      id: "preview-post-3",
      platform: "instagram",
      provider: "meta",
      status: "scheduled",
      scheduledFor: addDays(now, 2),
      publishedAt: null,
      failedAt: null,
      createdAt: addDays(now, -1)
    },
    {
      id: "preview-post-4",
      platform: "facebook",
      provider: "meta",
      status: "failed",
      scheduledFor: addDays(now, -1),
      publishedAt: null,
      failedAt: addDays(now, -1),
      createdAt: addDays(now, -2)
    }
  ];
  const comments: CommentMetricRow[] = [
    {
      id: "preview-comment-1",
      platform: "linkedin",
      status: "replied",
      receivedAt: addDays(now, -2)
    },
    {
      id: "preview-comment-2",
      platform: "instagram",
      status: "awaiting_approval",
      receivedAt: addDays(now, -1)
    },
    {
      id: "preview-comment-3",
      platform: "facebook",
      status: "matched",
      receivedAt: addDays(now, -1)
    }
  ];
  const replies: ReplyAttemptMetricRow[] = [
    {
      id: "preview-reply-1",
      provider: "linkedin",
      platform: "linkedin",
      status: "sent",
      createdAt: addDays(now, -2),
      sentAt: addDays(now, -2)
    },
    {
      id: "preview-reply-2",
      provider: "meta",
      platform: "instagram",
      status: "awaiting_approval",
      createdAt: addDays(now, -1),
      sentAt: null
    }
  ];
  const usage: UsageMetricRow[] = [
    {
      id: "preview-usage-1",
      type: "ai_generation",
      quantity: 4,
      occurredAt: addDays(now, -5)
    },
    {
      id: "preview-usage-2",
      type: "scheduled_post",
      quantity: 3,
      occurredAt: addDays(now, -3)
    },
    {
      id: "preview-usage-3",
      type: "publish_attempt",
      quantity: 2,
      occurredAt: addDays(now, -2)
    },
    {
      id: "preview-usage-4",
      type: "auto_reply",
      quantity: 1,
      occurredAt: addDays(now, -1)
    },
    {
      id: "preview-usage-5",
      type: "media_transform",
      quantity: 2,
      occurredAt: now
    }
  ];
  const agentRunRows: AgentRunMetricRow[] = [
    {
      id: "run_preview_content",
      traceId: "workflow_preview_content",
      status: "succeeded",
      provider: "gemini",
      model: "gemini-2.5-flash",
      toolCalls: [{ name: "research_topic" }, { name: "save_draft" }],
      startedAt: addDays(now, -3),
      completedAt: addDays(now, -3),
      error: null
    },
    {
      id: "run_preview_reply",
      traceId: "comment_preview_reply",
      status: "running",
      provider: "openai",
      model: "gpt-4.1-mini",
      toolCalls: [{ name: "match_reply_rules" }],
      startedAt: addDays(now, -1),
      completedAt: null,
      error: null
    }
  ];

  return aggregateAnalyticsMetrics({
    posts,
    comments,
    replies,
    usage,
    agentRuns: agentRunRows,
    now
  });
}

function createEmptyAnalyticsSnapshot(now = new Date()) {
  return aggregateAnalyticsMetrics({
    posts: [],
    comments: [],
    replies: [],
    usage: [],
    agentRuns: [],
    now
  });
}

async function getWorkspaceAnalyticsSummary(
  db: ReturnType<typeof getDb>,
  workspaceId: string,
  now: Date
): Promise<AnalyticsAggregateSummary> {
  const usageStart = startOfUtcDate(addDays(now, -13));
  const usageDay = sql<string>`to_char(${usageLedger.occurredAt} at time zone 'UTC', 'YYYY-MM-DD')`;
  const replyPlatform = sql<AnalyticsPlatformKey>`coalesce(${commentEvents.platform}::text, ${replyAttempts.provider}::text)`;

  const [
    postTotalsRow,
    commentTotalsRow,
    replyTotalsRow,
    usageTotalsRow,
    agentTotalsRow,
    usageByTypeRows,
    usageDailyRows,
    postPlatformRows,
    commentPlatformRows,
    replyPlatformRows
  ] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        scheduled: sql<number>`count(*) filter (where ${scheduledJobs.status} = 'scheduled')::int`,
        queued: sql<number>`count(*) filter (where ${scheduledJobs.status} = 'queued')::int`,
        publishing: sql<number>`count(*) filter (where ${scheduledJobs.status} = 'publishing')::int`,
        published: sql<number>`count(*) filter (where ${scheduledJobs.status} = 'published')::int`,
        failed: sql<number>`count(*) filter (where ${scheduledJobs.status} = 'failed')::int`,
        canceled: sql<number>`count(*) filter (where ${scheduledJobs.status} = 'canceled')::int`
      })
      .from(scheduledJobs)
      .where(eq(scheduledJobs.workspaceId, workspaceId)),
    db
      .select({
        total: sql<number>`count(*)::int`,
        matched: sql<number>`count(*) filter (where ${commentEvents.status} = 'matched')::int`,
        awaitingApproval: sql<number>`count(*) filter (where ${commentEvents.status} = 'awaiting_approval')::int`
      })
      .from(commentEvents)
      .where(eq(commentEvents.workspaceId, workspaceId)),
    db
      .select({
        awaitingApproval: sql<number>`count(*) filter (where ${replyAttempts.status} = 'awaiting_approval')::int`,
        sent: sql<number>`count(*) filter (where ${replyAttempts.status} = 'sent')::int`,
        approved: sql<number>`count(*) filter (where ${replyAttempts.status} = 'approved')::int`,
        failed: sql<number>`count(*) filter (where ${replyAttempts.status} = 'failed')::int`
      })
      .from(replyAttempts)
      .where(eq(replyAttempts.workspaceId, workspaceId)),
    db
      .select({ totalQuantity: sql<number>`coalesce(sum(${usageLedger.quantity}), 0)::int` })
      .from(usageLedger)
      .where(eq(usageLedger.workspaceId, workspaceId)),
    db
      .select({
        total: sql<number>`count(*)::int`,
        running: sql<number>`count(*) filter (where ${agentRuns.status} in ('queued', 'running'))::int`,
        succeeded: sql<number>`count(*) filter (where ${agentRuns.status} = 'succeeded')::int`,
        failed: sql<number>`count(*) filter (where ${agentRuns.status} = 'failed')::int`,
        totalToolCalls: sql<number>`coalesce(sum(jsonb_array_length(${agentRuns.toolCalls})), 0)::int`
      })
      .from(agentRuns)
      .where(eq(agentRuns.workspaceId, workspaceId)),
    db
      .select({
        type: usageLedger.type,
        quantity: sql<number>`coalesce(sum(${usageLedger.quantity}), 0)::int`
      })
      .from(usageLedger)
      .where(eq(usageLedger.workspaceId, workspaceId))
      .groupBy(usageLedger.type),
    db
      .select({
        date: usageDay,
        quantity: sql<number>`coalesce(sum(${usageLedger.quantity}), 0)::int`
      })
      .from(usageLedger)
      .where(and(eq(usageLedger.workspaceId, workspaceId), gte(usageLedger.occurredAt, usageStart)))
      .groupBy(usageDay),
    db
      .select({
        platform: platformVariants.platform,
        posts: sql<number>`count(*)::int`,
        published: sql<number>`count(*) filter (where ${scheduledJobs.status} = 'published')::int`,
        failures: sql<number>`count(*) filter (where ${scheduledJobs.status} = 'failed')::int`
      })
      .from(scheduledJobs)
      .innerJoin(
        platformVariants,
        and(
          eq(scheduledJobs.workspaceId, platformVariants.workspaceId),
          eq(scheduledJobs.platformVariantId, platformVariants.id)
        )
      )
      .where(eq(scheduledJobs.workspaceId, workspaceId))
      .groupBy(platformVariants.platform),
    db
      .select({
        platform: commentEvents.platform,
        comments: sql<number>`count(*)::int`,
        failures: sql<number>`count(*) filter (where ${commentEvents.status} = 'failed')::int`
      })
      .from(commentEvents)
      .where(eq(commentEvents.workspaceId, workspaceId))
      .groupBy(commentEvents.platform),
    db
      .select({
        platform: replyPlatform,
        replies: sql<number>`count(*) filter (where ${replyAttempts.status} in ('sent', 'approved'))::int`,
        failures: sql<number>`count(*) filter (where ${replyAttempts.status} = 'failed')::int`
      })
      .from(replyAttempts)
      .leftJoin(
        commentEvents,
        and(
          eq(replyAttempts.workspaceId, commentEvents.workspaceId),
          eq(replyAttempts.commentEventId, commentEvents.id)
        )
      )
      .where(eq(replyAttempts.workspaceId, workspaceId))
      .groupBy(replyPlatform)
  ]);

  const posting = {
    total: numberOrZero(postTotalsRow[0]?.total),
    scheduled: numberOrZero(postTotalsRow[0]?.scheduled),
    queued: numberOrZero(postTotalsRow[0]?.queued),
    publishing: numberOrZero(postTotalsRow[0]?.publishing),
    published: numberOrZero(postTotalsRow[0]?.published),
    failed: numberOrZero(postTotalsRow[0]?.failed),
    canceled: numberOrZero(postTotalsRow[0]?.canceled)
  };
  const totalAgents = numberOrZero(agentTotalsRow[0]?.total);
  const totalToolCalls = numberOrZero(agentTotalsRow[0]?.totalToolCalls);
  const usageDailyTotals = new Map(
    usageDailyRows.map((row) => [row.date, numberOrZero(row.quantity)] as const)
  );

  return {
    posting,
    replies: {
      comments: numberOrZero(commentTotalsRow[0]?.total),
      matched: numberOrZero(commentTotalsRow[0]?.matched),
      awaitingApproval:
        numberOrZero(commentTotalsRow[0]?.awaitingApproval) + numberOrZero(replyTotalsRow[0]?.awaitingApproval),
      sent: numberOrZero(replyTotalsRow[0]?.sent) + numberOrZero(replyTotalsRow[0]?.approved),
      failed: numberOrZero(replyTotalsRow[0]?.failed)
    },
    usage: {
      totalQuantity: numberOrZero(usageTotalsRow[0]?.totalQuantity),
      byType: usageByTypeRows
        .map((row) => ({
          type: row.type,
          label: usageTypeLabels[row.type],
          quantity: numberOrZero(row.quantity)
        }))
        .sort((a, b) => b.quantity - a.quantity || a.label.localeCompare(b.label)),
      daily: buildDailyUsageFromTotals(usageDailyTotals, now)
    },
    agents: {
      total: totalAgents,
      running: numberOrZero(agentTotalsRow[0]?.running),
      succeeded: numberOrZero(agentTotalsRow[0]?.succeeded),
      failed: numberOrZero(agentTotalsRow[0]?.failed),
      averageToolCalls: totalAgents > 0 ? Math.round((totalToolCalls / totalAgents) * 10) / 10 : 0
    },
    platformBreakdown: buildPlatformBreakdownFromAggregates({
      comments: commentPlatformRows,
      posts: postPlatformRows,
      replies: replyPlatformRows
    })
  };
}

export async function getWorkspaceAnalyticsSnapshot({
  isLocalPreview = false,
  now = new Date(),
  workspaceId
}: {
  workspaceId: string | null | undefined;
  isLocalPreview?: boolean;
  now?: Date;
}): Promise<AnalyticsSnapshot> {
  if (isLocalPreview) {
    return createPreviewAnalyticsSnapshot(now);
  }

  if (!isDatabaseConfigured || !workspaceId) {
    return createEmptyAnalyticsSnapshot(now);
  }

  const db = getDb();
  const [summary, agentRunRows] = await Promise.all([
    getWorkspaceAnalyticsSummary(db, workspaceId, now),
    db
      .select({
        id: agentRuns.id,
        traceId: agentRuns.traceId,
        status: agentRuns.status,
        provider: agentRuns.provider,
        model: agentRuns.model,
        toolCalls: agentRuns.toolCalls,
        error: agentRuns.error,
        startedAt: agentRuns.startedAt,
        completedAt: agentRuns.completedAt
      })
      .from(agentRuns)
      .where(eq(agentRuns.workspaceId, workspaceId))
      .orderBy(desc(agentRuns.startedAt))
      .limit(100)
  ]);

  return aggregateAnalyticsMetrics({
    posts: [],
    comments: [],
    replies: [],
    usage: [],
    agentRuns: agentRunRows,
    summary,
    now
  });
}
