CREATE TYPE "public"."agent_mission_simulation_status" AS ENUM('succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "agent_mission_simulations" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"mission_id" text NOT NULL,
	"requested_by_user_id" text,
	"status" "agent_mission_simulation_status" DEFAULT 'succeeded' NOT NULL,
	"planned_actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"policy_events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"estimated_usage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "agent_mission_simulations" ADD CONSTRAINT "agent_mission_simulations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_mission_simulations" ADD CONSTRAINT "agent_mission_simulations_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_mission_simulations" ADD CONSTRAINT "agent_mission_simulations_workspace_mission_fk" FOREIGN KEY ("workspace_id","mission_id") REFERENCES "public"."agent_missions"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_mission_simulations_workspace_id_id_idx" ON "agent_mission_simulations" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "agent_mission_simulations_workspace_idx" ON "agent_mission_simulations" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "agent_mission_simulations_mission_idx" ON "agent_mission_simulations" USING btree ("mission_id");--> statement-breakpoint
CREATE INDEX "agent_mission_simulations_status_idx" ON "agent_mission_simulations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_mission_simulations_created_at_idx" ON "agent_mission_simulations" USING btree ("created_at");