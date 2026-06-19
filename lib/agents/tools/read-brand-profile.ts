import { z } from "zod";
import type { AgentTool } from "@/lib/agents/tools/types";

export const brandProfileInputSchema = z.object({
  workspaceId: z.string().min(1),
  userId: z.string().min(1),
  topic: z.string().min(1).optional()
});

export const brandProfileOutputSchema = z.object({
  voice: z.string().min(1),
  defaultAudience: z.string().min(1),
  pillars: z.array(z.string().min(1)).min(1).max(8),
  avoidedTerms: z.array(z.string().min(1)).max(12)
});

export type BrandProfileInput = z.infer<typeof brandProfileInputSchema>;
export type BrandProfileOutput = z.infer<typeof brandProfileOutputSchema>;

export function createReadBrandProfileTool(
  readBrandProfile?: (input: BrandProfileInput) => Promise<BrandProfileOutput> | BrandProfileOutput
): AgentTool<typeof brandProfileInputSchema, typeof brandProfileOutputSchema> {
  return {
    name: "read_brand_profile",
    description: "Load workspace brand voice defaults for generation.",
    inputSchema: brandProfileInputSchema,
    outputSchema: brandProfileOutputSchema,
    async execute(input) {
      if (readBrandProfile) {
        return readBrandProfile(input);
      }

      return {
        voice: "clear, practical, founder-led, and specific",
        defaultAudience: "founders, operators, and social media managers",
        pillars: ["practical workflows", "human review", "consistent publishing", "measurable learning"],
        avoidedTerms: ["guaranteed", "effortless", "fully autonomous"]
      };
    }
  };
}
