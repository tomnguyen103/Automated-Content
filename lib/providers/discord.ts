import { createProviderSkeleton } from "@/lib/providers/skeleton";

export const discordProvider = createProviderSkeleton({
  key: "discord",
  displayName: "Discord",
  group: "messaging",
  website: "https://discord.com/developers/docs",
  supported: ["text_post", "image_post", "scheduled_publish", "immediate_publish"],
  unsupportedReasons: {
    video_post: "Video posts are treated as linked assets, not native uploads, in the MVP.",
    carousel: "Discord messages do not support carousel publishing.",
    comment_ingest: "Discord replies are not modeled as provider comments in this phase.",
    comment_reply: "Discord thread replies are outside the publishing MVP.",
    metrics_sync: "Discord does not provide comparable campaign metrics for this dashboard."
  }
});
