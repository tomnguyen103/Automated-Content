CREATE TYPE "public"."agent_run_status" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ai_provider" AS ENUM('openai', 'gemini');--> statement-breakpoint
CREATE TYPE "public"."content_draft_status" AS ENUM('draft', 'ready', 'archived');--> statement-breakpoint
CREATE TYPE "public"."social_platform" AS ENUM('linkedin', 'x', 'instagram', 'facebook', 'tiktok', 'threads');--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"trace_id" text NOT NULL,
	"status" "agent_run_status" NOT NULL,
	"provider" "ai_provider" NOT NULL,
	"model" text NOT NULL,
	"input" jsonb NOT NULL,
	"output" jsonb,
	"tool_calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by_user_id" text NOT NULL,
	"topic_id" text,
	"agent_run_id" text,
	"content_pack_id" text NOT NULL,
	"status" "content_draft_status" DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"content_pack" jsonb NOT NULL,
	"saved_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_topics" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by_user_id" text NOT NULL,
	"topic" text NOT NULL,
	"audience" text NOT NULL,
	"tone" text NOT NULL,
	"goal" text NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"platforms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_variants" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"draft_id" text NOT NULL,
	"platform" "social_platform" NOT NULL,
	"title" text NOT NULL,
	"hook" text NOT NULL,
	"body" text NOT NULL,
	"cta" text NOT NULL,
	"hashtags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"media_prompt" text,
	"character_count" integer NOT NULL,
	"policy_status" text NOT NULL,
	"policy_warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_topic_id_content_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."content_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_topics" ADD CONSTRAINT "content_topics_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_topics" ADD CONSTRAINT "content_topics_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_variants" ADD CONSTRAINT "platform_variants_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_variants" ADD CONSTRAINT "platform_variants_draft_id_content_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."content_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_workspace_idx" ON "agent_runs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "agent_runs_user_idx" ON "agent_runs" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_trace_idx" ON "agent_runs" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "content_drafts_workspace_idx" ON "content_drafts" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "content_drafts_agent_run_idx" ON "content_drafts" USING btree ("agent_run_id");--> statement-breakpoint
CREATE INDEX "content_drafts_created_by_user_idx" ON "content_drafts" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "content_topics_workspace_idx" ON "content_topics" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "content_topics_created_by_user_idx" ON "content_topics" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "platform_variants_workspace_idx" ON "platform_variants" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "platform_variants_draft_idx" ON "platform_variants" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "platform_variants_platform_idx" ON "platform_variants" USING btree ("platform");