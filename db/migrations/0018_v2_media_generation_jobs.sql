CREATE TABLE "media_generation_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by_user_id" text NOT NULL,
	"job_kind" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"idempotency_key" text,
	"source_asset_id" text,
	"trigger_task_id" text,
	"trigger_run_id" text,
	"provider_task_id" text,
	"progress" integer DEFAULT 0 NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cost" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"audit" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_generation_jobs_kind_check" CHECK ("media_generation_jobs"."job_kind" in ('media.transcribe-video', 'media.detect-short-clips', 'media.render-short-clip', 'media.generate-influencer-asset', 'media.generate-avatar-video')),
	CONSTRAINT "media_generation_jobs_status_check" CHECK ("media_generation_jobs"."status" in ('queued', 'running', 'succeeded', 'failed', 'canceled')),
	CONSTRAINT "media_generation_jobs_progress_check" CHECK ("media_generation_jobs"."progress" >= 0 and "media_generation_jobs"."progress" <= 100)
);
--> statement-breakpoint
ALTER TABLE "media_generation_jobs" ADD CONSTRAINT "media_generation_jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_generation_jobs" ADD CONSTRAINT "media_generation_jobs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_generation_jobs" ADD CONSTRAINT "media_generation_jobs_source_asset_id_media_assets_id_fk" FOREIGN KEY ("source_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_generation_jobs_workspace_id_id_idx" ON "media_generation_jobs" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_generation_jobs_workspace_idempotency_idx" ON "media_generation_jobs" USING btree ("workspace_id","idempotency_key") WHERE "media_generation_jobs"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "media_generation_jobs_workspace_status_idx" ON "media_generation_jobs" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "media_generation_jobs_trigger_run_idx" ON "media_generation_jobs" USING btree ("trigger_run_id");--> statement-breakpoint
CREATE INDEX "media_generation_jobs_created_by_user_idx" ON "media_generation_jobs" USING btree ("created_by_user_id");