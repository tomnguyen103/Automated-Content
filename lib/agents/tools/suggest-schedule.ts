import { z } from "zod";
import { scheduleSuggestionSchema } from "@/lib/agents/schemas/schedule-suggestion";
import { socialPlatformSchema } from "@/lib/agents/schemas/platform-variant";
import type { AgentTool } from "@/lib/agents/tools/types";

export const suggestScheduleInputSchema = z.object({
  topic: z.string().min(1),
  platforms: z.array(socialPlatformSchema).min(1).max(6),
  timezone: z.string().min(1).default("America/Chicago"),
  startDate: z.string().min(1).optional()
});

export const suggestScheduleOutputSchema = z.object({
  suggestions: z.array(scheduleSuggestionSchema).min(1).max(12)
});

export type SuggestScheduleInput = z.infer<typeof suggestScheduleInputSchema>;
export type SuggestScheduleOutput = z.infer<typeof suggestScheduleOutputSchema>;

function atLocalHour(base: Date, dayOffset: number, hour: number) {
  const date = new Date(base);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
}

export function createSuggestScheduleTool(
  suggestSchedule?: (input: SuggestScheduleInput) => Promise<SuggestScheduleOutput> | SuggestScheduleOutput
): AgentTool<typeof suggestScheduleInputSchema, typeof suggestScheduleOutputSchema> {
  return {
    name: "suggest_schedule",
    description: "Recommend review-ready publishing windows by platform.",
    inputSchema: suggestScheduleInputSchema,
    outputSchema: suggestScheduleOutputSchema,
    async execute(input, context) {
      if (suggestSchedule) {
        return suggestSchedule(input);
      }

      const base = input.startDate ? new Date(input.startDate) : context.now();
      const hours = [15, 17, 20, 14, 19, 16];

      return {
        suggestions: input.platforms.map((platform, index) => ({
          id: `schedule_${platform}_${index + 1}`,
          platform,
          scheduledFor: atLocalHour(base, index + 1, hours[index] ?? 15),
          timezone: input.timezone,
          reason: `Gives the ${platform} draft review time before a high-attention publishing window.`,
          confidence: Math.max(0.62, 0.86 - index * 0.04)
        }))
      };
    }
  };
}
