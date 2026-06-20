import { createProviderSkeleton } from "@/lib/providers/skeleton";

export const metaProvider = createProviderSkeleton({
  key: "meta",
  displayName: "Meta",
  group: "social",
  website: "https://developers.facebook.com/docs",
  supported: [
    "text_post",
    "image_post",
    "video_post",
    "carousel",
    "scheduled_publish",
    "immediate_publish",
    "comment_ingest",
    "comment_reply",
    "metrics_sync"
  ]
});
