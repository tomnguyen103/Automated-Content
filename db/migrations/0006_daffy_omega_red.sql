CREATE TYPE "public"."connected_account_status" AS ENUM('connected', 'requires_configuration', 'unsupported', 'disconnected', 'error');--> statement-breakpoint
CREATE TYPE "public"."provider_key" AS ENUM('mock', 'meta', 'linkedin', 'x', 'slack', 'discord');--> statement-breakpoint
CREATE TYPE "public"."publish_attempt_status" AS ENUM('queued', 'publishing', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."queue_enqueue_status" AS ENUM('pending', 'queued', 'failed');--> statement-breakpoint
CREATE TYPE "public"."scheduled_job_status" AS ENUM('scheduled', 'queued', 'publishing', 'published', 'failed', 'canceled');--> statement-breakpoint
CREATE TABLE "connected_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" "provider_key" NOT NULL,
	"provider_account_id" text NOT NULL,
	"display_name" text NOT NULL,
	"status" "connected_account_status" DEFAULT 'connected' NOT NULL,
	"token_ref" text,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_validated_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disconnected_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "publish_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"scheduled_job_id" uuid NOT NULL,
	"provider" "provider_key" NOT NULL,
	"status" "publish_attempt_status" DEFAULT 'queued' NOT NULL,
	"provider_post_id" text,
	"provider_response" jsonb,
	"error_code" text,
	"error_message" text,
	"retry_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"platform_variant_id" text NOT NULL,
	"connected_account_id" uuid,
	"provider" "provider_key" NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"status" "scheduled_job_status" DEFAULT 'scheduled' NOT NULL,
	"enqueue_status" "queue_enqueue_status" DEFAULT 'pending' NOT NULL,
	"queue_job_id" text,
	"enqueue_error" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"locked_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduled_jobs_attempt_count_nonnegative_check" CHECK ("scheduled_jobs"."attempt_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "connected_accounts" ADD CONSTRAINT "connected_accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_attempts" ADD CONSTRAINT "publish_attempts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_attempts" ADD CONSTRAINT "publish_attempts_workspace_job_fk" FOREIGN KEY ("workspace_id","scheduled_job_id") REFERENCES "public"."scheduled_jobs"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_jobs" ADD CONSTRAINT "scheduled_jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_jobs" ADD CONSTRAINT "scheduled_jobs_connected_account_id_connected_accounts_id_fk" FOREIGN KEY ("connected_account_id") REFERENCES "public"."connected_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_jobs" ADD CONSTRAINT "scheduled_jobs_workspace_variant_fk" FOREIGN KEY ("workspace_id","platform_variant_id") REFERENCES "public"."platform_variants"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "connected_accounts_workspace_id_id_idx" ON "connected_accounts" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "connected_accounts_workspace_provider_account_idx" ON "connected_accounts" USING btree ("workspace_id","provider","provider_account_id");--> statement-breakpoint
CREATE INDEX "connected_accounts_workspace_idx" ON "connected_accounts" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "connected_accounts_provider_idx" ON "connected_accounts" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "connected_accounts_status_idx" ON "connected_accounts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "publish_attempts_workspace_status_idx" ON "publish_attempts" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "publish_attempts_scheduled_job_idx" ON "publish_attempts" USING btree ("scheduled_job_id");--> statement-breakpoint
CREATE INDEX "publish_attempts_provider_idx" ON "publish_attempts" USING btree ("provider");--> statement-breakpoint
CREATE UNIQUE INDEX "scheduled_jobs_workspace_id_id_idx" ON "scheduled_jobs" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "scheduled_jobs_workspace_status_idx" ON "scheduled_jobs" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "scheduled_jobs_connected_account_idx" ON "scheduled_jobs" USING btree ("connected_account_id");--> statement-breakpoint
CREATE INDEX "scheduled_jobs_scheduled_for_idx" ON "scheduled_jobs" USING btree ("scheduled_for");--> statement-breakpoint
CREATE INDEX "scheduled_jobs_enqueue_status_idx" ON "scheduled_jobs" USING btree ("enqueue_status");--> statement-breakpoint
CREATE INDEX "scheduled_jobs_provider_idx" ON "scheduled_jobs" USING btree ("provider");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_variants_workspace_id_id_idx" ON "platform_variants" USING btree ("workspace_id","id");
