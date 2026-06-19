import { z } from "zod";
import {
  platformLabels,
  platformVariantSchema,
  socialPlatformSchema,
  type PlatformVariant
} from "@/lib/agents/schemas/platform-variant";
import type { AgentTool } from "@/lib/agents/tools/types";

export const generatePlatformVariantInputSchema = z.object({
  topic: z.string().min(1),
  platform: socialPlatformSchema,
  ideaTitle: z.string().min(1),
  angle: z.string().min(1),
  audience: z.string().min(1),
  tone: z.string().min(1),
  goal: z.string().min(1),
  hashtags: z.array(z.string().min(2)).max(12)
});

export type GeneratePlatformVariantInput = z.infer<typeof generatePlatformVariantInputSchema>;

const platformGuidance: Record<GeneratePlatformVariantInput["platform"], { title: string; bodyLimit: number }> = {
  linkedin: { title: "Professional post", bodyLimit: 1300 },
  x: { title: "Short-form thread starter", bodyLimit: 260 },
  instagram: { title: "Caption", bodyLimit: 900 },
  facebook: { title: "Community update", bodyLimit: 900 },
  tiktok: { title: "Short video script", bodyLimit: 700 },
  threads: { title: "Conversation starter", bodyLimit: 420 }
};

function truncateText(value: string, limit: number) {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, Math.max(0, limit - 3)).trim()}...`;
}

export function buildPlatformVariant(input: GeneratePlatformVariantInput): PlatformVariant {
  const guidance = platformGuidance[input.platform];
  const hook = truncateText(`${input.ideaTitle}: ${input.angle}`, input.platform === "x" ? 180 : 260);
  const body = truncateText(
    [
      hook,
      "",
      `For ${input.audience}, the useful move is to turn ${input.topic} into a repeatable workflow instead of a one-off task.`,
      `Tone: ${input.tone}. Goal: ${input.goal}.`,
      "",
      "Start with one clear promise, show the operating step, then leave room for human review before anything publishes."
    ].join("\n"),
    guidance.bodyLimit
  );
  const cta = input.platform === "x" ? "What would you test first?" : "Save this as a starting point for your next content batch.";
  const characterCount = [hook, body, cta, input.hashtags.join(" ")].join(" ").length;

  return {
    id: `${input.platform}_${crypto.randomUUID()}`,
    platform: input.platform,
    title: `${platformLabels[input.platform]} ${guidance.title}`,
    hook,
    body,
    cta,
    hashtags: input.hashtags.slice(0, input.platform === "x" ? 4 : 8),
    mediaPrompt:
      input.platform === "tiktok"
        ? `Creator-facing short video storyboard about ${input.topic}`
        : `Clean product workflow visual for ${input.topic}`,
    characterCount,
    policyStatus: "pass",
    policyWarnings: []
  };
}

export function createGeneratePlatformVariantTool(
  generateVariant?: (input: GeneratePlatformVariantInput) => Promise<PlatformVariant> | PlatformVariant
): AgentTool<typeof generatePlatformVariantInputSchema, typeof platformVariantSchema> {
  return {
    name: "generate_platform_variant",
    description: "Create a platform-specific draft from a content idea.",
    inputSchema: generatePlatformVariantInputSchema,
    outputSchema: platformVariantSchema,
    async execute(input) {
      if (generateVariant) {
        return generateVariant(input);
      }

      return buildPlatformVariant(input);
    }
  };
}
