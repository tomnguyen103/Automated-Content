import { z } from "zod";
import { socialPlatformSchema } from "@/lib/agents/schemas/platform-variant";

export const scheduleSuggestionSchema = z.object({
  id: z.string().min(1),
  platform: socialPlatformSchema,
  scheduledFor: z.string().min(1),
  timezone: z.string().min(1).default("America/Chicago"),
  reason: z.string().min(1).max(360),
  confidence: z.number().min(0).max(1)
});

export type ScheduleSuggestion = z.infer<typeof scheduleSuggestionSchema>;
