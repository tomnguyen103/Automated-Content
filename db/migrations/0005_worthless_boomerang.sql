CREATE TYPE "public"."media_asset_type" AS ENUM('image', 'video');--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"uploaded_by_user_id" text NOT NULL,
	"provider" text DEFAULT 'imagekit' NOT NULL,
	"imagekit_file_id" text,
	"name" text NOT NULL,
	"file_name" text NOT NULL,
	"media_type" "media_asset_type" NOT NULL,
	"mime_type" text NOT NULL,
	"source_url" text NOT NULL,
	"thumbnail_url" text,
	"width" integer,
	"height" integer,
	"size_bytes" integer,
	"folder" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"transformation_defaults" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_size_bytes_nonnegative_check" CHECK ("media_assets"."size_bytes" is null or "media_assets"."size_bytes" >= 0)
);
--> statement-breakpoint
ALTER TABLE "platform_variants" ADD COLUMN "media" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_assets_workspace_idx" ON "media_assets" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "media_assets_uploaded_by_user_idx" ON "media_assets" USING btree ("uploaded_by_user_id");--> statement-breakpoint
CREATE INDEX "media_assets_media_type_idx" ON "media_assets" USING btree ("media_type");--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_workspace_imagekit_file_idx" ON "media_assets" USING btree ("workspace_id","imagekit_file_id");