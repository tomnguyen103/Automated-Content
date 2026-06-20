CREATE TABLE "token_vault_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" "provider_key" NOT NULL,
	"provider_account_id" text NOT NULL,
	"encrypted_payload" text NOT NULL,
	"key_version" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "token_vault_entries" ADD CONSTRAINT "token_vault_entries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "token_vault_entries_workspace_idx" ON "token_vault_entries" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "token_vault_entries_provider_account_idx" ON "token_vault_entries" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE INDEX "token_vault_entries_expires_at_idx" ON "token_vault_entries" USING btree ("expires_at");