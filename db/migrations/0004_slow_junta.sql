CREATE TYPE "public"."workflow_checkpoint_status" AS ENUM('running', 'awaiting_review', 'paused', 'changes_requested', 'succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "workflow_checkpoints" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"run_id" text NOT NULL,
	"user_id" text NOT NULL,
	"trace_id" text NOT NULL,
	"status" "workflow_checkpoint_status" NOT NULL,
	"approval_status" text NOT NULL,
	"current_node" text NOT NULL,
	"state" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_checkpoints" ADD CONSTRAINT "workflow_checkpoints_approval_status_check" CHECK ("workflow_checkpoints"."approval_status" in ('not_requested', 'pending', 'approved', 'changes_requested', 'paused'));--> statement-breakpoint
ALTER TABLE "workflow_checkpoints" ADD CONSTRAINT "workflow_checkpoints_current_node_check" CHECK ("workflow_checkpoints"."current_node" in ('intake', 'research', 'strategy', 'draft', 'platform_adaptation', 'safety', 'schedule_suggestion', 'review', 'save'));--> statement-breakpoint
ALTER TABLE "workflow_checkpoints" ADD CONSTRAINT "workflow_checkpoints_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_checkpoints" ADD CONSTRAINT "workflow_checkpoints_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_checkpoints" ADD CONSTRAINT "workflow_checkpoints_workspace_run_fk" FOREIGN KEY ("workspace_id","run_id") REFERENCES "public"."agent_runs"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_checkpoints_workspace_run_idx" ON "workflow_checkpoints" USING btree ("workspace_id","run_id");--> statement-breakpoint
CREATE INDEX "workflow_checkpoints_workspace_status_idx" ON "workflow_checkpoints" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "workflow_checkpoints_user_idx" ON "workflow_checkpoints" USING btree ("user_id");
