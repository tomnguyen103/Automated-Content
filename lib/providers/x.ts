import { createProviderSkeleton } from "@/lib/providers/skeleton";

export const xProvider = createProviderSkeleton({
  key: "x",
  displayName: "X",
  group: "social",
  website: "https://developer.x.com",
  supported: ["text_post", "image_post", "video_post", "scheduled_publish", "immediate_publish", "metrics_sync"],
  unsupportedReasons: {
    carousel: "X does not expose carousel publishing in this contract.",
    comment_ingest: "Reply ingestion requires a separate filtered stream worker.",
    comment_reply: "Reply automation is held for the comment-agent phase."
  }
});
