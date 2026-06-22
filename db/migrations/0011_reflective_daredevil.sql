CREATE TYPE "public"."agent_mission_status" AS ENUM('draft', 'queued', 'running', 'paused', 'succeeded', 'failed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."agent_policy_event_action" AS ENUM('allow', 'require_review', 'block', 'escalate', 'note');--> statement-breakpoint
CREATE TYPE "public"."agent_policy_event_severity" AS ENUM('info', 'warning', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."agent_profile_role" AS ENUM('coordinator', 'researcher', 'strategist', 'remixer', 'publisher', 'engagement', 'reporter');--> statement-breakpoint
CREATE TYPE "public"."agent_profile_status" AS ENUM('active', 'disabled', 'archived');--> statement-breakpoint
CREATE TYPE "public"."agent_task_run_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'canceled', 'skipped');--> statement-breakpoint
CREATE TABLE "agent_missions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by_user_id" text,
	"coordinator_profile_id" text,
	"title" text NOT NULL,
	"objective" text NOT NULL,
	"brief" text NOT NULL,
	"status" "agent_mission_status" DEFAULT 'draft' NOT NULL,
	"priority" integer DEFAULT 50 NOT NULL,
	"inputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb,
	"error" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_missions_priority_range_check" CHECK ("agent_missions"."priority" >= 0 and "agent_missions"."priority" <= 100)
);
--> statement-breakpoint
CREATE TABLE "agent_policy_events" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"mission_id" text,
	"task_run_id" text,
	"profile_id" text,
	"severity" "agent_policy_event_severity" DEFAULT 'info' NOT NULL,
	"action" "agent_policy_event_action" NOT NULL,
	"policy_key" text NOT NULL,
	"message" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by_user_id" text,
	"role" "agent_profile_role" NOT NULL,
	"status" "agent_profile_status" DEFAULT 'active' NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"instructions" text NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tool_scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"model_preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"max_concurrency" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_profiles_max_concurrency_positive_check" CHECK ("agent_profiles"."max_concurrency" > 0)
);
--> statement-breakpoint
CREATE TABLE "agent_task_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"mission_id" text NOT NULL,
	"profile_id" text NOT NULL,
	"agent_run_id" text,
	"task_name" text NOT NULL,
	"status" "agent_task_run_status" DEFAULT 'queued' NOT NULL,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb,
	"policy_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_task_runs_attempt_number_positive_check" CHECK ("agent_task_runs"."attempt_number" > 0)
);
--> statement-breakpoint
ALTER TABLE "agent_missions" ADD CONSTRAINT "agent_missions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_missions" ADD CONSTRAINT "agent_missions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_missions" ADD CONSTRAINT "agent_missions_coordinator_profile_id_agent_profiles_id_fk" FOREIGN KEY ("coordinator_profile_id") REFERENCES "public"."agent_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_policy_events" ADD CONSTRAINT "agent_policy_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_policy_events" ADD CONSTRAINT "agent_policy_events_profile_id_agent_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."agent_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_policy_events" ADD CONSTRAINT "agent_policy_events_workspace_mission_fk" FOREIGN KEY ("workspace_id","mission_id") REFERENCES "public"."agent_missions"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_policy_events" ADD CONSTRAINT "agent_policy_events_workspace_task_run_fk" FOREIGN KEY ("workspace_id","task_run_id") REFERENCES "public"."agent_task_runs"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_profiles" ADD CONSTRAINT "agent_profiles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_profiles" ADD CONSTRAINT "agent_profiles_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_task_runs" ADD CONSTRAINT "agent_task_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_task_runs" ADD CONSTRAINT "agent_task_runs_workspace_mission_fk" FOREIGN KEY ("workspace_id","mission_id") REFERENCES "public"."agent_missions"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_task_runs" ADD CONSTRAINT "agent_task_runs_workspace_profile_fk" FOREIGN KEY ("workspace_id","profile_id") REFERENCES "public"."agent_profiles"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_task_runs" ADD CONSTRAINT "agent_task_runs_workspace_agent_run_fk" FOREIGN KEY ("workspace_id","agent_run_id") REFERENCES "public"."agent_runs"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_missions_workspace_id_id_idx" ON "agent_missions" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "agent_missions_workspace_status_idx" ON "agent_missions" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "agent_missions_created_by_user_idx" ON "agent_missions" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "agent_missions_coordinator_profile_idx" ON "agent_missions" USING btree ("coordinator_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_policy_events_workspace_id_id_idx" ON "agent_policy_events" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "agent_policy_events_workspace_severity_idx" ON "agent_policy_events" USING btree ("workspace_id","severity");--> statement-breakpoint
CREATE INDEX "agent_policy_events_mission_idx" ON "agent_policy_events" USING btree ("mission_id");--> statement-breakpoint
CREATE INDEX "agent_policy_events_task_run_idx" ON "agent_policy_events" USING btree ("task_run_id");--> statement-breakpoint
CREATE INDEX "agent_policy_events_profile_idx" ON "agent_policy_events" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "agent_policy_events_occurred_at_idx" ON "agent_policy_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_profiles_workspace_id_id_idx" ON "agent_profiles" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "agent_profiles_workspace_status_idx" ON "agent_profiles" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "agent_profiles_workspace_role_idx" ON "agent_profiles" USING btree ("workspace_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_task_runs_workspace_id_id_idx" ON "agent_task_runs" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "agent_task_runs_workspace_status_idx" ON "agent_task_runs" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "agent_task_runs_mission_idx" ON "agent_task_runs" USING btree ("mission_id");--> statement-breakpoint
CREATE INDEX "agent_task_runs_profile_idx" ON "agent_task_runs" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "agent_task_runs_agent_run_idx" ON "agent_task_runs" USING btree ("agent_run_id");