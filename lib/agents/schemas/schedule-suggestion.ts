import { z } from "zod";
import { socialPlatformSchema } from "@/lib/agents/schemas/platform-variant";

function isValidTimeZone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export const ianaTimeZoneSchema = z.string().min(1).refine(isValidTimeZone, "Expected a valid IANA timezone.");

export const scheduleSuggestionSchema = z.object({
  id: z.string().min(1),
  platform: socialPlatformSchema,
  scheduledFor: z.string().min(1),
  timezone: ianaTimeZoneSchema.default("America/Chicago"),
  reason: z.string().min(1).max(360),
  confidence: z.number().min(0).max(1)
});

export type ScheduleSuggestion = z.infer<typeof scheduleSuggestionSchema>;
