import { z } from "zod";
import {
  platformVariantSchema,
  socialPlatformSchema
} from "@/lib/agents/schemas/platform-variant";
import { scheduleSuggestionSchema } from "@/lib/agents/schemas/schedule-suggestion";

export const contentAgentInputSchema = z.object({
  topic: z.string().min(3).max(240),
  audience: z.string().min(2).max(160).default("founders and operators"),
  tone: z.string().min(2).max(80).default("clear, practical, confident"),
  goal: z.string().min(2).max(160).default("educate and drive engagement"),
  sources: z.array(z.string().min(1).max(1000)).max(8).default([]),
  platforms: z.array(socialPlatformSchema).min(1).max(6).default(["linkedin", "x"])
});

export const contentIdeaSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(120),
  angle: z.string().min(1).max(360),
  audiencePromise: z.string().min(1).max(280)
});

export const contentPackSchema = z.object({
  id: z.string().min(1),
  topic: z.string().min(1),
  summary: z.string().min(1).max(1200),
  audience: z.string().min(1),
  tone: z.string().min(1),
  goal: z.string().min(1),
  ideas: z.array(contentIdeaSchema).min(1).max(6),
  captions: z.array(z.string().min(1).max(1000)).min(1).max(6),
  variants: z.array(platformVariantSchema).min(1).max(12),
  hashtags: z.array(z.string().min(2).max(64)).max(16),
  ctaOptions: z.array(z.string().min(1).max(220)).min(1).max(6),
  scheduleSuggestions: z.array(scheduleSuggestionSchema).max(12),
  warnings: z.array(z.string().min(1)).max(12),
  createdAt: z.string().min(1),
  metadata: z.object({
    provider: z.enum(["openai", "gemini"]),
    model: z.string().min(1),
    traceId: z.string().min(1),
    toolCallCount: z.number().int().nonnegative()
  })
});

export type ContentAgentInput = z.infer<typeof contentAgentInputSchema>;
export type ContentIdea = z.infer<typeof contentIdeaSchema>;
export type ContentPack = z.infer<typeof contentPackSchema>;
