import { z } from "zod";
import {
  ianaTimeZoneSchema,
  scheduleSuggestionSchema
} from "@/lib/agents/schemas/schedule-suggestion";
import { socialPlatformSchema } from "@/lib/agents/schemas/platform-variant";
import type { AgentTool } from "@/lib/agents/tools/types";

export const suggestScheduleInputSchema = z.object({
  topic: z.string().min(1),
  platforms: z.array(socialPlatformSchema).min(1).max(6),
  timezone: ianaTimeZoneSchema.default("America/Chicago"),
  startDate: z
    .string()
    .min(1)
    .refine((value) => !Number.isNaN(new Date(value).getTime()), "Expected a valid date string.")
    .optional()
});

export const suggestScheduleOutputSchema = z.object({
  suggestions: z.array(scheduleSuggestionSchema).min(1).max(12)
});

export type SuggestScheduleInput = z.infer<typeof suggestScheduleInputSchema>;
export type SuggestScheduleOutput = z.infer<typeof suggestScheduleOutputSchema>;

type DateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const timeZoneFormatters = new Map<string, Intl.DateTimeFormat>();

function getTimeZoneFormatter(timezone: string) {
  const existing = timeZoneFormatters.get(timezone);

  if (existing) {
    return existing;
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23"
  });
  timeZoneFormatters.set(timezone, formatter);
  return formatter;
}

function getZonedParts(date: Date, timezone: string): DateTimeParts {
  const parts = getTimeZoneFormatter(timezone).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  ) as Record<keyof DateTimeParts, number>;

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second
  };
}

function getTimeZoneOffsetMs(date: Date, timezone: string) {
  const parts = getZonedParts(date, timezone);
  const zonedTimeAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );

  return zonedTimeAsUtc - date.getTime();
}

function atLocalHour(base: Date, dayOffset: number, hour: number, timezone: string) {
  const baseParts = getZonedParts(base, timezone);
  const targetLocalTimeAsUtc = Date.UTC(baseParts.year, baseParts.month - 1, baseParts.day + dayOffset, hour, 0, 0, 0);
  const firstPass = new Date(targetLocalTimeAsUtc - getTimeZoneOffsetMs(new Date(targetLocalTimeAsUtc), timezone));
  const corrected = new Date(targetLocalTimeAsUtc - getTimeZoneOffsetMs(firstPass, timezone));

  return corrected.toISOString();
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
      if (Number.isNaN(base.getTime())) {
        throw new Error("Invalid startDate. Expected a valid date string.");
      }

      const hours = [15, 17, 20, 14, 19, 16];

      return {
        suggestions: input.platforms.map((platform, index) => ({
          id: `schedule_${platform}_${index + 1}`,
          platform,
          scheduledFor: atLocalHour(base, index + 1, hours[index] ?? 15, input.timezone),
          timezone: input.timezone,
          reason: `Gives the ${platform} draft review time before a high-attention publishing window.`,
          confidence: Math.max(0.62, 0.86 - index * 0.04)
        }))
      };
    }
  };
}
