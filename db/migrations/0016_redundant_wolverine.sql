CREATE TYPE "public"."brand_memory_proposal_scope" AS ENUM('workspace', 'platform', 'profile', 'campaign');--> statement-breakpoint
CREATE TYPE "public"."brand_memory_proposal_status" AS ENUM('pending', 'accepted', 'rejected');--> statement-breakpoint
CREATE TABLE "brand_memory_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by_user_id" text,
	"source_agent_run_id" text,
	"source_content_pack_id" text,
	"source_variant_id" text,
	"scope" "brand_memory_proposal_scope" DEFAULT 'workspace' NOT NULL,
	"platform" "social_platform",
	"original_text" text NOT NULL,
	"edited_text" text NOT NULL,
	"inferred_rule" text NOT NULL,
	"confidence" integer DEFAULT 70 NOT NULL,
	"status" "brand_memory_proposal_status" DEFAULT 'pending' NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reviewed_by_user_id" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_memory_proposals_confidence_range_check" CHECK ("brand_memory_proposals"."confidence" >= 0 and "brand_memory_proposals"."confidence" <= 100)
);
--> statement-breakpoint
ALTER TABLE "brand_memory_proposals" ADD CONSTRAINT "brand_memory_proposals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_memory_proposals" ADD CONSTRAINT "brand_memory_proposals_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_memory_proposals" ADD CONSTRAINT "brand_memory_proposals_source_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("source_agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_memory_proposals" ADD CONSTRAINT "brand_memory_proposals_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brand_memory_proposals_workspace_id_id_idx" ON "brand_memory_proposals" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "brand_memory_proposals_workspace_status_idx" ON "brand_memory_proposals" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "brand_memory_proposals_source_run_idx" ON "brand_memory_proposals" USING btree ("source_agent_run_id");--> statement-breakpoint
CREATE INDEX "brand_memory_proposals_workspace_created_at_idx" ON "brand_memory_proposals" USING btree ("workspace_id","created_at");
