import { createProviderSkeleton } from "@/lib/providers/skeleton";

export const slackProvider = createProviderSkeleton({
  key: "slack",
  displayName: "Slack",
  group: "messaging",
  website: "https://api.slack.com",
  supported: ["text_post", "image_post", "scheduled_publish", "immediate_publish"],
  unsupportedReasons: {
    video_post: "Video posts are treated as linked assets, not native uploads, in the MVP.",
    carousel: "Slack messages do not support carousel publishing.",
    comment_ingest: "Slack thread ingest is outside the publishing MVP.",
    comment_reply: "Slack thread replies are outside the publishing MVP.",
    metrics_sync: "Slack does not provide comparable campaign metrics for this dashboard."
  }
});
