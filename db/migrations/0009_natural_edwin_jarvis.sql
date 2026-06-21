CREATE TABLE "n8n_events" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text,
	"direction" text NOT NULL,
	"event_type" text,
	"callback_id" text,
	"workflow" text,
	"status" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"response_status" integer,
	"error" text,
	"occurred_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "n8n_events_workspace_idx" ON "n8n_events" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "n8n_events_event_type_idx" ON "n8n_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "n8n_events_callback_idx" ON "n8n_events" USING btree ("callback_id");--> statement-breakpoint
CREATE INDEX "n8n_events_status_idx" ON "n8n_events" USING btree ("status");