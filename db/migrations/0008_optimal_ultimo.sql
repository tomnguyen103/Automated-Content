CREATE TYPE "public"."auto_reply_rule_match_type" AS ENUM('contains', 'exact', 'starts_with', 'regex');--> statement-breakpoint
CREATE TYPE "public"."comment_event_status" AS ENUM('new', 'matched', 'awaiting_approval', 'replied', 'ignored', 'failed');--> statement-breakpoint
CREATE TYPE "public"."reply_attempt_status" AS ENUM('approved', 'awaiting_approval', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "auto_reply_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by_user_id" text,
	"name" text NOT NULL,
	"platform_scope" text DEFAULT 'all' NOT NULL,
	"match_type" "auto_reply_rule_match_type" DEFAULT 'contains' NOT NULL,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"template" text NOT NULL,
	"rate_limit_window_minutes" integer DEFAULT 60 NOT NULL,
	"rate_limit_max_replies" integer DEFAULT 5 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auto_reply_rules_platform_scope_check" CHECK ("auto_reply_rules"."platform_scope" in ('all', 'linkedin', 'x', 'instagram', 'facebook', 'tiktok', 'threads')),
	CONSTRAINT "auto_reply_rules_rate_window_positive_check" CHECK ("auto_reply_rules"."rate_limit_window_minutes" > 0),
	CONSTRAINT "auto_reply_rules_rate_limit_positive_check" CHECK ("auto_reply_rules"."rate_limit_max_replies" > 0)
);
--> statement-breakpoint
CREATE TABLE "comment_events" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"connected_account_id" uuid,
	"provider" "provider_key" NOT NULL,
	"platform" "social_platform" NOT NULL,
	"provider_comment_id" text NOT NULL,
	"provider_post_id" text,
	"author_display_name" text,
	"author_provider_id" text,
	"text" text NOT NULL,
	"status" "comment_event_status" DEFAULT 'new' NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "comment_events_workspace_id_id_idx" ON "comment_events" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE TABLE "reply_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"comment_event_id" text NOT NULL,
	"rule_id" text,
	"provider" "provider_key" NOT NULL,
	"connected_account_id" uuid,
	"status" "reply_attempt_status" NOT NULL,
	"reply_text" text NOT NULL,
	"approval_required" boolean DEFAULT false NOT NULL,
	"approved_by_user_id" text,
	"provider_reply_id" text,
	"provider_response" jsonb,
	"audit" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auto_reply_rules" ADD CONSTRAINT "auto_reply_rules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_reply_rules" ADD CONSTRAINT "auto_reply_rules_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_events" ADD CONSTRAINT "comment_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_events" ADD CONSTRAINT "comment_events_connected_account_id_connected_accounts_id_fk" FOREIGN KEY ("connected_account_id") REFERENCES "public"."connected_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_attempts" ADD CONSTRAINT "reply_attempts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_attempts" ADD CONSTRAINT "reply_attempts_rule_id_auto_reply_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."auto_reply_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_attempts" ADD CONSTRAINT "reply_attempts_connected_account_id_connected_accounts_id_fk" FOREIGN KEY ("connected_account_id") REFERENCES "public"."connected_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_attempts" ADD CONSTRAINT "reply_attempts_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_attempts" ADD CONSTRAINT "reply_attempts_workspace_comment_fk" FOREIGN KEY ("workspace_id","comment_event_id") REFERENCES "public"."comment_events"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auto_reply_rules_workspace_id_id_idx" ON "auto_reply_rules" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "auto_reply_rules_workspace_enabled_idx" ON "auto_reply_rules" USING btree ("workspace_id","enabled");--> statement-breakpoint
CREATE INDEX "auto_reply_rules_platform_scope_idx" ON "auto_reply_rules" USING btree ("platform_scope");--> statement-breakpoint
CREATE UNIQUE INDEX "comment_events_workspace_provider_comment_idx" ON "comment_events" USING btree ("workspace_id","provider","provider_comment_id");--> statement-breakpoint
CREATE INDEX "comment_events_workspace_status_idx" ON "comment_events" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "comment_events_provider_post_idx" ON "comment_events" USING btree ("provider","provider_post_id");--> statement-breakpoint
CREATE INDEX "comment_events_received_at_idx" ON "comment_events" USING btree ("received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reply_attempts_workspace_id_id_idx" ON "reply_attempts" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "reply_attempts_workspace_status_idx" ON "reply_attempts" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "reply_attempts_comment_event_idx" ON "reply_attempts" USING btree ("comment_event_id");--> statement-breakpoint
CREATE INDEX "reply_attempts_rule_idx" ON "reply_attempts" USING btree ("rule_id");--> statement-breakpoint
CREATE INDEX "reply_attempts_provider_idx" ON "reply_attempts" USING btree ("provider");
--> statement-breakpoint
ALTER TABLE "workflow_checkpoints" DROP CONSTRAINT "workflow_checkpoints_current_node_check";--> statement-breakpoint
ALTER TABLE "workflow_checkpoints" ADD CONSTRAINT "workflow_checkpoints_current_node_check" CHECK ("workflow_checkpoints"."current_node" in ('intake', 'research', 'strategy', 'draft', 'platform_adaptation', 'safety', 'schedule_suggestion', 'review', 'save', 'ingest_comment', 'match_keyword_rules', 'retrieve_context', 'draft_reply', 'decide_reply', 'send_reply', 'audit'));
