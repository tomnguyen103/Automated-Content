ALTER TABLE "agent_missions" DROP CONSTRAINT "agent_missions_coordinator_profile_id_agent_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "agent_policy_events" DROP CONSTRAINT "agent_policy_events_profile_id_agent_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "agent_missions" ADD CONSTRAINT "agent_missions_workspace_coordinator_profile_fk" FOREIGN KEY ("workspace_id","coordinator_profile_id") REFERENCES "public"."agent_profiles"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_policy_events" ADD CONSTRAINT "agent_policy_events_workspace_profile_fk" FOREIGN KEY ("workspace_id","profile_id") REFERENCES "public"."agent_profiles"("workspace_id","id") ON DELETE no action ON UPDATE no action;