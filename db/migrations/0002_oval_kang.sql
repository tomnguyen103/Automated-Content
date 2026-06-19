ALTER TABLE "content_drafts" DROP CONSTRAINT "content_drafts_topic_id_content_topics_id_fk";
--> statement-breakpoint
ALTER TABLE "content_drafts" DROP CONSTRAINT "content_drafts_agent_run_id_agent_runs_id_fk";
--> statement-breakpoint
ALTER TABLE "platform_variants" DROP CONSTRAINT "platform_variants_draft_id_content_drafts_id_fk";
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_workspace_id_id_idx" ON "agent_runs" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_drafts_workspace_id_id_idx" ON "content_drafts" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_topics_workspace_id_id_idx" ON "content_topics" USING btree ("workspace_id","id");--> statement-breakpoint
ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_workspace_topic_fk" FOREIGN KEY ("workspace_id","topic_id") REFERENCES "public"."content_topics"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_workspace_agent_run_fk" FOREIGN KEY ("workspace_id","agent_run_id") REFERENCES "public"."agent_runs"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_variants" ADD CONSTRAINT "platform_variants_workspace_draft_fk" FOREIGN KEY ("workspace_id","draft_id") REFERENCES "public"."content_drafts"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
