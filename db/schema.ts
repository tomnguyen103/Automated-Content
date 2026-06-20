import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

export const membershipRoleEnum = pgEnum("membership_role", ["owner", "admin", "member"]);
export const subscriptionPlanEnum = pgEnum("subscription_plan", ["free", "premium"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "past_due",
  "canceled",
  "ended",
  "expired",
  "abandoned",
  "incomplete",
  "upcoming"
]);
export const usageEventTypeEnum = pgEnum("usage_event_type", [
  "ai_generation",
  "scheduled_post",
  "publish_attempt",
  "media_transform",
  "auto_reply"
]);
export const aiProviderEnum = pgEnum("ai_provider", ["openai", "gemini"]);
export const agentRunStatusEnum = pgEnum("agent_run_status", ["queued", "running", "succeeded", "failed"]);
export const contentDraftStatusEnum = pgEnum("content_draft_status", ["draft", "ready", "archived"]);
export const socialPlatformEnum = pgEnum("social_platform", [
  "linkedin",
  "x",
  "instagram",
  "facebook",
  "tiktok",
  "threads"
]);

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email"),
  name: text("name"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true })
});

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    personalForUserId: text("personal_for_user_id").references(() => users.id, {
      onDelete: "cascade"
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("workspaces_slug_idx").on(table.slug),
    uniqueIndex("workspaces_personal_for_user_idx").on(table.personalForUserId),
    index("workspaces_owner_user_idx").on(table.ownerUserId)
  ]
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: membershipRoleEnum("role").default("member").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("memberships_workspace_user_idx").on(table.workspaceId, table.userId),
    index("memberships_user_idx").on(table.userId)
  ]
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clerkSubscriptionId: text("clerk_subscription_id"),
    clerkSubscriptionItemId: text("clerk_subscription_item_id"),
    clerkPayerId: text("clerk_payer_id"),
    plan: subscriptionPlanEnum("plan").default("free").notNull(),
    planName: text("plan_name").default("Free").notNull(),
    planSlug: text("plan_slug").default("free").notNull(),
    status: subscriptionStatusEnum("status").default("active").notNull(),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("subscriptions_workspace_idx").on(table.workspaceId),
    uniqueIndex("subscriptions_clerk_subscription_idx").on(table.clerkSubscriptionId),
    index("subscriptions_clerk_payer_idx").on(table.clerkPayerId)
  ]
);

export const usageLedger = pgTable(
  "usage_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    type: usageEventTypeEnum("type").notNull(),
    quantity: integer("quantity").default(1).notNull(),
    sourceId: text("source_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    check("usage_ledger_quantity_positive_check", sql`${table.quantity} > 0`),
    index("usage_ledger_workspace_type_idx").on(table.workspaceId, table.type),
    index("usage_ledger_occurred_at_idx").on(table.occurredAt)
  ]
);

export const contentTopics = pgTable(
  "content_topics",
  {
    id: text("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    topic: text("topic").notNull(),
    audience: text("audience").notNull(),
    tone: text("tone").notNull(),
    goal: text("goal").notNull(),
    sources: jsonb("sources").$type<string[]>().default([]).notNull(),
    platforms: jsonb("platforms").$type<Array<(typeof socialPlatformEnum.enumValues)[number]>>().default([]).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("content_topics_workspace_id_id_idx").on(table.workspaceId, table.id),
    index("content_topics_workspace_idx").on(table.workspaceId),
    index("content_topics_created_by_user_idx").on(table.createdByUserId)
  ]
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: text("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    traceId: text("trace_id").notNull(),
    status: agentRunStatusEnum("status").notNull(),
    provider: aiProviderEnum("provider").notNull(),
    model: text("model").notNull(),
    input: jsonb("input").$type<Record<string, unknown>>().notNull(),
    output: jsonb("output").$type<Record<string, unknown>>(),
    toolCalls: jsonb("tool_calls").$type<Array<Record<string, unknown>>>().default([]).notNull(),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("agent_runs_workspace_id_id_idx").on(table.workspaceId, table.id),
    index("agent_runs_workspace_idx").on(table.workspaceId),
    index("agent_runs_user_idx").on(table.userId),
    uniqueIndex("agent_runs_trace_idx").on(table.traceId)
  ]
);

export const contentDrafts = pgTable(
  "content_drafts",
  {
    id: text("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    topicId: text("topic_id"),
    agentRunId: text("agent_run_id"),
    contentPackId: text("content_pack_id").notNull(),
    status: contentDraftStatusEnum("status").default("draft").notNull(),
    title: text("title").notNull(),
    contentPack: jsonb("content_pack").$type<Record<string, unknown>>().notNull(),
    savedAt: timestamp("saved_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("content_drafts_workspace_id_id_idx").on(table.workspaceId, table.id),
    foreignKey({
      columns: [table.workspaceId, table.topicId],
      foreignColumns: [contentTopics.workspaceId, contentTopics.id],
      name: "content_drafts_workspace_topic_fk"
    }),
    foreignKey({
      columns: [table.workspaceId, table.agentRunId],
      foreignColumns: [agentRuns.workspaceId, agentRuns.id],
      name: "content_drafts_workspace_agent_run_fk"
    }),
    index("content_drafts_workspace_idx").on(table.workspaceId),
    index("content_drafts_agent_run_idx").on(table.agentRunId),
    index("content_drafts_created_by_user_idx").on(table.createdByUserId)
  ]
);

export const platformVariants = pgTable(
  "platform_variants",
  {
    id: text("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    draftId: text("draft_id").notNull(),
    platform: socialPlatformEnum("platform").notNull(),
    title: text("title").notNull(),
    hook: text("hook").notNull(),
    body: text("body").notNull(),
    cta: text("cta").notNull(),
    hashtags: jsonb("hashtags").$type<string[]>().default([]).notNull(),
    mediaPrompt: text("media_prompt"),
    characterCount: integer("character_count").notNull(),
    policyStatus: text("policy_status").notNull(),
    policyWarnings: jsonb("policy_warnings").$type<string[]>().default([]).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    foreignKey({
      columns: [table.workspaceId, table.draftId],
      foreignColumns: [contentDrafts.workspaceId, contentDrafts.id],
      name: "platform_variants_workspace_draft_fk"
    }).onDelete("cascade"),
    index("platform_variants_workspace_idx").on(table.workspaceId),
    index("platform_variants_draft_idx").on(table.draftId),
    index("platform_variants_platform_idx").on(table.platform)
  ]
);

export type User = typeof users.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type UsageLedgerEntry = typeof usageLedger.$inferSelect;
export type ContentTopic = typeof contentTopics.$inferSelect;
export type AgentRunRow = typeof agentRuns.$inferSelect;
export type ContentDraft = typeof contentDrafts.$inferSelect;
export type PlatformVariantRow = typeof platformVariants.$inferSelect;
