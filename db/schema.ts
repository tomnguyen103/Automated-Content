import { sql } from "drizzle-orm";
import {
  check,
  boolean,
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
export const agentProfileRoleEnum = pgEnum("agent_profile_role", [
  "coordinator",
  "researcher",
  "strategist",
  "remixer",
  "publisher",
  "engagement",
  "reporter"
]);
export const agentProfileStatusEnum = pgEnum("agent_profile_status", ["active", "disabled", "archived"]);
export const agentMissionStatusEnum = pgEnum("agent_mission_status", [
  "draft",
  "queued",
  "running",
  "paused",
  "succeeded",
  "failed",
  "canceled"
]);
export const agentMissionTypeEnum = pgEnum("agent_mission_type", [
  "research_topics",
  "content_pipeline",
  "content_remix",
  "auto_publish",
  "comment_engagement",
  "weekly_report"
]);
export const agentTaskRunStatusEnum = pgEnum("agent_task_run_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
  "canceled",
  "skipped"
]);
export const agentPolicyEventSeverityEnum = pgEnum("agent_policy_event_severity", [
  "info",
  "warning",
  "blocked"
]);
export const agentPolicyEventActionEnum = pgEnum("agent_policy_event_action", [
  "allow",
  "require_review",
  "block",
  "escalate",
  "note"
]);
export const workflowCheckpointStatusEnum = pgEnum("workflow_checkpoint_status", [
  "running",
  "awaiting_review",
  "paused",
  "changes_requested",
  "succeeded",
  "failed"
]);
export const contentDraftStatusEnum = pgEnum("content_draft_status", ["draft", "ready", "archived"]);
export const mediaAssetTypeEnum = pgEnum("media_asset_type", ["image", "video"]);
export const mediaProviderEnum = pgEnum("media_provider", ["imagekit", "mock"]);
export const socialPlatformEnum = pgEnum("social_platform", [
  "linkedin",
  "x",
  "instagram",
  "facebook",
  "tiktok",
  "threads"
]);
export const providerKeyEnum = pgEnum("provider_key", ["mock", "meta", "linkedin", "x", "slack", "discord"]);
export const connectedAccountStatusEnum = pgEnum("connected_account_status", [
  "connected",
  "requires_configuration",
  "unsupported",
  "disconnected",
  "error"
]);
export const scheduledJobStatusEnum = pgEnum("scheduled_job_status", [
  "scheduled",
  "queued",
  "publishing",
  "published",
  "failed",
  "canceled"
]);
export const queueEnqueueStatusEnum = pgEnum("queue_enqueue_status", ["pending", "queued", "failed"]);
export const publishAttemptStatusEnum = pgEnum("publish_attempt_status", [
  "queued",
  "publishing",
  "succeeded",
  "failed"
]);
export const autoReplyRuleMatchTypeEnum = pgEnum("auto_reply_rule_match_type", [
  "contains",
  "exact",
  "starts_with",
  "regex"
]);
export const commentEventStatusEnum = pgEnum("comment_event_status", [
  "new",
  "matched",
  "awaiting_approval",
  "replied",
  "ignored",
  "failed"
]);
export const replyAttemptStatusEnum = pgEnum("reply_attempt_status", [
  "approved",
  "awaiting_approval",
  "sent",
  "failed",
  "skipped"
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
    index("usage_ledger_occurred_at_idx").on(table.occurredAt),
    uniqueIndex("usage_ledger_workspace_type_source_idx")
      .on(table.workspaceId, table.type, table.sourceId)
      .where(sql`${table.sourceId} is not null`)
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

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: text("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    uploadedByUserId: text("uploaded_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: mediaProviderEnum("provider").default("imagekit").notNull(),
    imagekitFileId: text("imagekit_file_id"),
    name: text("name").notNull(),
    fileName: text("file_name").notNull(),
    mediaType: mediaAssetTypeEnum("media_type").notNull(),
    mimeType: text("mime_type").notNull(),
    sourceUrl: text("source_url").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    width: integer("width"),
    height: integer("height"),
    sizeBytes: integer("size_bytes"),
    folder: text("folder"),
    tags: jsonb("tags").$type<string[]>().default([]).notNull(),
    transformationDefaults: jsonb("transformation_defaults").$type<Record<string, unknown>>().default({}).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    check("media_assets_size_bytes_nonnegative_check", sql`${table.sizeBytes} is null or ${table.sizeBytes} >= 0`),
    check("media_assets_width_positive_check", sql`${table.width} is null or ${table.width} > 0`),
    check("media_assets_height_positive_check", sql`${table.height} is null or ${table.height} > 0`),
    index("media_assets_workspace_idx").on(table.workspaceId),
    index("media_assets_uploaded_by_user_idx").on(table.uploadedByUserId),
    index("media_assets_media_type_idx").on(table.mediaType),
    uniqueIndex("media_assets_workspace_imagekit_file_idx").on(table.workspaceId, table.imagekitFileId)
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
    media: jsonb("media").$type<Array<Record<string, unknown>>>().default([]).notNull(),
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
    uniqueIndex("platform_variants_workspace_id_id_idx").on(table.workspaceId, table.id),
    index("platform_variants_workspace_idx").on(table.workspaceId),
    index("platform_variants_draft_idx").on(table.draftId),
    index("platform_variants_platform_idx").on(table.platform)
  ]
);

export const connectedAccounts = pgTable(
  "connected_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    provider: providerKeyEnum("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    displayName: text("display_name").notNull(),
    status: connectedAccountStatusEnum("status").default("connected").notNull(),
    tokenRef: text("token_ref"),
    scopes: jsonb("scopes").$type<string[]>().default([]).notNull(),
    capabilities: jsonb("capabilities").$type<string[]>().default([]).notNull(),
    lastValidatedAt: timestamp("last_validated_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    disconnectedAt: timestamp("disconnected_at", { withTimezone: true })
  },
  (table) => [
    uniqueIndex("connected_accounts_workspace_id_id_idx").on(table.workspaceId, table.id),
    uniqueIndex("connected_accounts_workspace_provider_account_idx").on(
      table.workspaceId,
      table.provider,
      table.providerAccountId
    ),
    index("connected_accounts_workspace_idx").on(table.workspaceId),
    index("connected_accounts_provider_idx").on(table.provider),
    index("connected_accounts_status_idx").on(table.status)
  ]
);

export const tokenVaultEntries = pgTable(
  "token_vault_entries",
  {
    id: text("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    provider: providerKeyEnum("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    encryptedPayload: text("encrypted_payload").notNull(),
    keyVersion: text("key_version").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    index("token_vault_entries_workspace_idx").on(table.workspaceId),
    index("token_vault_entries_provider_account_idx").on(table.provider, table.providerAccountId),
    index("token_vault_entries_expires_at_idx").on(table.expiresAt)
  ]
);

export const scheduledJobs = pgTable(
  "scheduled_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    platformVariantId: text("platform_variant_id").notNull(),
    connectedAccountId: uuid("connected_account_id").references(() => connectedAccounts.id, { onDelete: "set null" }),
    provider: providerKeyEnum("provider").notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    status: scheduledJobStatusEnum("status").default("scheduled").notNull(),
    enqueueStatus: queueEnqueueStatusEnum("enqueue_status").default("pending").notNull(),
    queueJobId: text("queue_job_id"),
    enqueueError: text("enqueue_error"),
    attemptCount: integer("attempt_count").default(0).notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("scheduled_jobs_workspace_id_id_idx").on(table.workspaceId, table.id),
    foreignKey({
      columns: [table.workspaceId, table.platformVariantId],
      foreignColumns: [platformVariants.workspaceId, platformVariants.id],
      name: "scheduled_jobs_workspace_variant_fk"
    }).onDelete("cascade"),
    check("scheduled_jobs_attempt_count_nonnegative_check", sql`${table.attemptCount} >= 0`),
    index("scheduled_jobs_workspace_status_idx").on(table.workspaceId, table.status),
    index("scheduled_jobs_connected_account_idx").on(table.connectedAccountId),
    index("scheduled_jobs_scheduled_for_idx").on(table.scheduledFor),
    index("scheduled_jobs_enqueue_status_idx").on(table.enqueueStatus),
    index("scheduled_jobs_provider_idx").on(table.provider)
  ]
);

export const publishAttempts = pgTable(
  "publish_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    scheduledJobId: uuid("scheduled_job_id").notNull(),
    provider: providerKeyEnum("provider").notNull(),
    status: publishAttemptStatusEnum("status").default("queued").notNull(),
    providerPostId: text("provider_post_id"),
    providerResponse: jsonb("provider_response").$type<Record<string, unknown>>(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    retryAt: timestamp("retry_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    foreignKey({
      columns: [table.workspaceId, table.scheduledJobId],
      foreignColumns: [scheduledJobs.workspaceId, scheduledJobs.id],
      name: "publish_attempts_workspace_job_fk"
    }).onDelete("cascade"),
    index("publish_attempts_workspace_status_idx").on(table.workspaceId, table.status),
    index("publish_attempts_scheduled_job_idx").on(table.scheduledJobId),
    index("publish_attempts_provider_idx").on(table.provider)
  ]
);

export const commentEvents = pgTable(
  "comment_events",
  {
    id: text("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    connectedAccountId: uuid("connected_account_id").references(() => connectedAccounts.id, { onDelete: "set null" }),
    provider: providerKeyEnum("provider").notNull(),
    platform: socialPlatformEnum("platform").notNull(),
    providerCommentId: text("provider_comment_id").notNull(),
    providerPostId: text("provider_post_id"),
    authorDisplayName: text("author_display_name"),
    authorProviderId: text("author_provider_id"),
    text: text("text").notNull(),
    status: commentEventStatusEnum("status").default("new").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("comment_events_workspace_id_id_idx").on(table.workspaceId, table.id),
    uniqueIndex("comment_events_workspace_provider_comment_idx").on(
      table.workspaceId,
      table.provider,
      table.providerCommentId
    ),
    index("comment_events_workspace_status_idx").on(table.workspaceId, table.status),
    index("comment_events_provider_post_idx").on(table.provider, table.providerPostId),
    index("comment_events_received_at_idx").on(table.receivedAt)
  ]
);

export const autoReplyRules = pgTable(
  "auto_reply_rules",
  {
    id: text("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    platformScope: text("platform_scope").default("all").notNull(),
    matchType: autoReplyRuleMatchTypeEnum("match_type").default("contains").notNull(),
    keywords: jsonb("keywords").$type<string[]>().default([]).notNull(),
    template: text("template").notNull(),
    rateLimitWindowMinutes: integer("rate_limit_window_minutes").default(60).notNull(),
    rateLimitMaxReplies: integer("rate_limit_max_replies").default(5).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("auto_reply_rules_workspace_id_id_idx").on(table.workspaceId, table.id),
    check(
      "auto_reply_rules_platform_scope_check",
      sql`${table.platformScope} in ('all', 'linkedin', 'x', 'instagram', 'facebook', 'tiktok', 'threads')`
    ),
    check("auto_reply_rules_rate_window_positive_check", sql`${table.rateLimitWindowMinutes} > 0`),
    check("auto_reply_rules_rate_limit_positive_check", sql`${table.rateLimitMaxReplies} > 0`),
    index("auto_reply_rules_workspace_enabled_idx").on(table.workspaceId, table.enabled),
    index("auto_reply_rules_platform_scope_idx").on(table.platformScope)
  ]
);

export const replyAttempts = pgTable(
  "reply_attempts",
  {
    id: text("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    commentEventId: text("comment_event_id").notNull(),
    ruleId: text("rule_id"),
    provider: providerKeyEnum("provider").notNull(),
    connectedAccountId: uuid("connected_account_id").references(() => connectedAccounts.id, { onDelete: "set null" }),
    status: replyAttemptStatusEnum("status").notNull(),
    replyText: text("reply_text").notNull(),
    approvalRequired: boolean("approval_required").default(false).notNull(),
    approvedByUserId: text("approved_by_user_id").references(() => users.id, { onDelete: "set null" }),
    providerReplyId: text("provider_reply_id"),
    providerResponse: jsonb("provider_response").$type<Record<string, unknown>>(),
    audit: jsonb("audit").$type<Record<string, unknown>>().default({}).notNull(),
    error: text("error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("reply_attempts_workspace_id_id_idx").on(table.workspaceId, table.id),
    foreignKey({
      columns: [table.workspaceId, table.commentEventId],
      foreignColumns: [commentEvents.workspaceId, commentEvents.id],
      name: "reply_attempts_workspace_comment_fk"
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workspaceId, table.ruleId],
      foreignColumns: [autoReplyRules.workspaceId, autoReplyRules.id],
      name: "reply_attempts_workspace_rule_fk"
    }),
    index("reply_attempts_workspace_status_idx").on(table.workspaceId, table.status),
    index("reply_attempts_comment_event_idx").on(table.commentEventId),
    index("reply_attempts_rule_idx").on(table.ruleId),
    index("reply_attempts_provider_idx").on(table.provider)
  ]
);

export const workflowCheckpoints = pgTable(
  "workflow_checkpoints",
  {
    id: text("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    runId: text("run_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    traceId: text("trace_id").notNull(),
    status: workflowCheckpointStatusEnum("status").notNull(),
    approvalStatus: text("approval_status").notNull(),
    currentNode: text("current_node").notNull(),
    state: jsonb("state").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("workflow_checkpoints_workspace_run_idx").on(table.workspaceId, table.runId),
    foreignKey({
      columns: [table.workspaceId, table.runId],
      foreignColumns: [agentRuns.workspaceId, agentRuns.id],
      name: "workflow_checkpoints_workspace_run_fk"
    }).onDelete("cascade"),
    check(
      "workflow_checkpoints_approval_status_check",
      sql`${table.approvalStatus} in ('not_requested', 'pending', 'approved', 'changes_requested', 'paused')`
    ),
    check(
      "workflow_checkpoints_current_node_check",
      sql`${table.currentNode} in ('intake', 'research', 'strategy', 'draft', 'platform_adaptation', 'safety', 'schedule_suggestion', 'review', 'save', 'ingest_comment', 'match_keyword_rules', 'retrieve_context', 'draft_reply', 'decide_reply', 'send_reply', 'audit')`
    ),
    index("workflow_checkpoints_workspace_status_idx").on(table.workspaceId, table.status),
    index("workflow_checkpoints_user_idx").on(table.userId)
  ]
);

export const agentProfiles = pgTable(
  "agent_profiles",
  {
    id: text("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    role: agentProfileRoleEnum("role").notNull(),
    status: agentProfileStatusEnum("status").default("active").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    instructions: text("instructions").notNull(),
    capabilities: jsonb("capabilities").$type<string[]>().default([]).notNull(),
    toolScopes: jsonb("tool_scopes").$type<string[]>().default([]).notNull(),
    policy: jsonb("policy").$type<Record<string, unknown>>().default({}).notNull(),
    modelPreferences: jsonb("model_preferences").$type<Record<string, unknown>>().default({}).notNull(),
    maxConcurrency: integer("max_concurrency").default(1).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("agent_profiles_workspace_id_id_idx").on(table.workspaceId, table.id),
    check("agent_profiles_max_concurrency_positive_check", sql`${table.maxConcurrency} > 0`),
    index("agent_profiles_workspace_status_idx").on(table.workspaceId, table.status),
    index("agent_profiles_workspace_role_idx").on(table.workspaceId, table.role)
  ]
);

export const agentMissions = pgTable(
  "agent_missions",
  {
    id: text("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    coordinatorProfileId: text("coordinator_profile_id").references(() => agentProfiles.id, {
      onDelete: "set null"
    }),
    missionType: agentMissionTypeEnum("mission_type").notNull(),
    title: text("title").notNull(),
    objective: text("objective").notNull(),
    brief: text("brief").notNull(),
    status: agentMissionStatusEnum("status").default("draft").notNull(),
    priority: integer("priority").default(50).notNull(),
    inputs: jsonb("inputs").$type<Record<string, unknown>>().default({}).notNull(),
    context: jsonb("context").$type<Record<string, unknown>>().default({}).notNull(),
    policy: jsonb("policy").$type<Record<string, unknown>>().default({}).notNull(),
    result: jsonb("result").$type<Record<string, unknown>>(),
    error: text("error"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("agent_missions_workspace_id_id_idx").on(table.workspaceId, table.id),
    check("agent_missions_priority_range_check", sql`${table.priority} >= 0 and ${table.priority} <= 100`),
    index("agent_missions_workspace_status_idx").on(table.workspaceId, table.status),
    index("agent_missions_created_by_user_idx").on(table.createdByUserId),
    index("agent_missions_coordinator_profile_idx").on(table.coordinatorProfileId)
  ]
);

export const agentTaskRuns = pgTable(
  "agent_task_runs",
  {
    id: text("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    missionId: text("mission_id").notNull(),
    profileId: text("profile_id").notNull(),
    agentRunId: text("agent_run_id"),
    taskName: text("task_name").notNull(),
    status: agentTaskRunStatusEnum("status").default("queued").notNull(),
    attemptNumber: integer("attempt_number").default(1).notNull(),
    input: jsonb("input").$type<Record<string, unknown>>().default({}).notNull(),
    output: jsonb("output").$type<Record<string, unknown>>(),
    policySnapshot: jsonb("policy_snapshot").$type<Record<string, unknown>>().default({}).notNull(),
    error: text("error"),
    queuedAt: timestamp("queued_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("agent_task_runs_workspace_id_id_idx").on(table.workspaceId, table.id),
    foreignKey({
      columns: [table.workspaceId, table.missionId],
      foreignColumns: [agentMissions.workspaceId, agentMissions.id],
      name: "agent_task_runs_workspace_mission_fk"
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workspaceId, table.profileId],
      foreignColumns: [agentProfiles.workspaceId, agentProfiles.id],
      name: "agent_task_runs_workspace_profile_fk"
    }),
    foreignKey({
      columns: [table.workspaceId, table.agentRunId],
      foreignColumns: [agentRuns.workspaceId, agentRuns.id],
      name: "agent_task_runs_workspace_agent_run_fk"
    }),
    check("agent_task_runs_attempt_number_positive_check", sql`${table.attemptNumber} > 0`),
    index("agent_task_runs_workspace_status_idx").on(table.workspaceId, table.status),
    index("agent_task_runs_mission_idx").on(table.missionId),
    index("agent_task_runs_profile_idx").on(table.profileId),
    index("agent_task_runs_agent_run_idx").on(table.agentRunId)
  ]
);

export const agentPolicyEvents = pgTable(
  "agent_policy_events",
  {
    id: text("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    missionId: text("mission_id"),
    taskRunId: text("task_run_id"),
    profileId: text("profile_id").references(() => agentProfiles.id, { onDelete: "set null" }),
    severity: agentPolicyEventSeverityEnum("severity").default("info").notNull(),
    action: agentPolicyEventActionEnum("action").notNull(),
    policyKey: text("policy_key").notNull(),
    message: text("message").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().default({}).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("agent_policy_events_workspace_id_id_idx").on(table.workspaceId, table.id),
    foreignKey({
      columns: [table.workspaceId, table.missionId],
      foreignColumns: [agentMissions.workspaceId, agentMissions.id],
      name: "agent_policy_events_workspace_mission_fk"
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workspaceId, table.taskRunId],
      foreignColumns: [agentTaskRuns.workspaceId, agentTaskRuns.id],
      name: "agent_policy_events_workspace_task_run_fk"
    }).onDelete("cascade"),
    index("agent_policy_events_workspace_severity_idx").on(table.workspaceId, table.severity),
    index("agent_policy_events_mission_idx").on(table.missionId),
    index("agent_policy_events_task_run_idx").on(table.taskRunId),
    index("agent_policy_events_profile_idx").on(table.profileId),
    index("agent_policy_events_occurred_at_idx").on(table.occurredAt)
  ]
);

export const n8nEvents = pgTable(
  "n8n_events",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id"),
    direction: text("direction").notNull(),
    eventType: text("event_type"),
    callbackId: text("callback_id"),
    workflow: text("workflow"),
    status: text("status").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    responseStatus: integer("response_status"),
    error: text("error"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    index("n8n_events_workspace_idx").on(table.workspaceId),
    index("n8n_events_event_type_idx").on(table.eventType),
    index("n8n_events_callback_idx").on(table.callbackId),
    index("n8n_events_status_idx").on(table.status)
  ]
);

export type User = typeof users.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type UsageLedgerEntry = typeof usageLedger.$inferSelect;
export type ContentTopic = typeof contentTopics.$inferSelect;
export type MediaAssetRow = typeof mediaAssets.$inferSelect;
export type AgentRunRow = typeof agentRuns.$inferSelect;
export type ContentDraft = typeof contentDrafts.$inferSelect;
export type PlatformVariantRow = typeof platformVariants.$inferSelect;
export type ConnectedAccount = typeof connectedAccounts.$inferSelect;
export type TokenVaultEntry = typeof tokenVaultEntries.$inferSelect;
export type ScheduledJob = typeof scheduledJobs.$inferSelect;
export type PublishAttempt = typeof publishAttempts.$inferSelect;
export type CommentEvent = typeof commentEvents.$inferSelect;
export type AutoReplyRuleRow = typeof autoReplyRules.$inferSelect;
export type ReplyAttempt = typeof replyAttempts.$inferSelect;
export type WorkflowCheckpoint = typeof workflowCheckpoints.$inferSelect;
export type AgentProfileRow = typeof agentProfiles.$inferSelect;
export type AgentMissionRow = typeof agentMissions.$inferSelect;
export type AgentTaskRunRow = typeof agentTaskRuns.$inferSelect;
export type AgentPolicyEventRow = typeof agentPolicyEvents.$inferSelect;
export type N8nEvent = typeof n8nEvents.$inferSelect;
