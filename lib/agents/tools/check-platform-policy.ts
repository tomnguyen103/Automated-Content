import { z } from "zod";
import {
  platformPolicyStatusSchema,
  platformVariantSchema,
  type PlatformPolicyStatus,
  type SocialPlatform
} from "@/lib/agents/schemas/platform-variant";
import type { AgentTool } from "@/lib/agents/tools/types";
import { getPlatformMediaWarnings, getPolicyStatusForWarnings } from "@/lib/media/platform-constraints";

const characterLimits: Partial<Record<SocialPlatform, number>> = {
  x: 280,
  threads: 500,
  instagram: 2200,
  linkedin: 3000,
  facebook: 3000,
  tiktok: 2200
};

const blockedTerms = ["guaranteed results", "risk-free profit", "fully autonomous publishing"];

export const checkPlatformPolicyInputSchema = z.object({
  variant: platformVariantSchema
});

export const checkPlatformPolicyOutputSchema = z.object({
  status: platformPolicyStatusSchema,
  warnings: z.array(z.string().min(1)).max(8),
  checkedAt: z.string().min(1)
});

export type CheckPlatformPolicyInput = z.infer<typeof checkPlatformPolicyInputSchema>;
export type CheckPlatformPolicyOutput = z.infer<typeof checkPlatformPolicyOutputSchema>;

export function evaluatePlatformPolicy(input: CheckPlatformPolicyInput, checkedAt: string): CheckPlatformPolicyOutput {
  const limit = characterLimits[input.variant.platform];
  const warnings: string[] = [];
  const searchableText = [input.variant.hook, input.variant.body, input.variant.cta].join(" ").toLowerCase();

  if (limit && input.variant.characterCount > limit) {
    warnings.push(`Copy is ${input.variant.characterCount - limit} characters over the ${limit}-character guidance.`);
  }

  for (const term of blockedTerms) {
    if (searchableText.includes(term)) {
      warnings.push(`Avoid claim: ${term}.`);
    }
  }

  warnings.push(...getPlatformMediaWarnings(input.variant.platform, input.variant.media));

  const status: PlatformPolicyStatus = getPolicyStatusForWarnings(warnings);

  return {
    status,
    warnings,
    checkedAt
  };
}

export function createCheckPlatformPolicyTool(
  checkPolicy?: (input: CheckPlatformPolicyInput) => Promise<CheckPlatformPolicyOutput> | CheckPlatformPolicyOutput
): AgentTool<typeof checkPlatformPolicyInputSchema, typeof checkPlatformPolicyOutputSchema> {
  return {
    name: "check_platform_policy",
    description: "Check a platform variant for simple safety and length policy warnings.",
    inputSchema: checkPlatformPolicyInputSchema,
    outputSchema: checkPlatformPolicyOutputSchema,
    async execute(input, context) {
      if (checkPolicy) {
        return checkPolicy(input);
      }

      return evaluatePlatformPolicy(input, context.now().toISOString());
    }
  };
}
