import { createProviderSkeleton } from "@/lib/providers/skeleton";

export const linkedinProvider = createProviderSkeleton({
  key: "linkedin",
  displayName: "LinkedIn",
  group: "social",
  website: "https://learn.microsoft.com/linkedin",
  supported: [
    "text_post",
    "image_post",
    "video_post",
    "scheduled_publish",
    "immediate_publish",
    "comment_ingest",
    "comment_reply",
    "metrics_sync"
  ],
  unsupportedReasons: {
    carousel: "LinkedIn carousel publishing is not enabled in the MVP adapter."
  }
});
