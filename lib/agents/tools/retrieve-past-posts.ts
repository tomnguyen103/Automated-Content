import { z } from "zod";
import { socialPlatformSchema } from "@/lib/agents/schemas/platform-variant";
import type { AgentTool } from "@/lib/agents/tools/types";

export const retrievePastPostsInputSchema = z.object({
  workspaceId: z.string().min(1),
  topic: z.string().min(1),
  platforms: z.array(socialPlatformSchema).min(1).max(6)
});

export const pastPostSchema = z.object({
  id: z.string().min(1),
  platform: socialPlatformSchema,
  title: z.string().min(1),
  excerpt: z.string().min(1),
  engagementScore: z.number().min(0).max(100)
});

export const retrievePastPostsOutputSchema = z.object({
  posts: z.array(pastPostSchema).max(6),
  recurringThemes: z.array(z.string().min(1)).max(8)
});

export type RetrievePastPostsInput = z.infer<typeof retrievePastPostsInputSchema>;
export type RetrievePastPostsOutput = z.infer<typeof retrievePastPostsOutputSchema>;

export function createRetrievePastPostsTool(
  retrievePastPosts?: (input: RetrievePastPostsInput) => Promise<RetrievePastPostsOutput> | RetrievePastPostsOutput
): AgentTool<typeof retrievePastPostsInputSchema, typeof retrievePastPostsOutputSchema> {
  return {
    name: "retrieve_past_posts",
    description: "Retrieve recent posts to avoid repetition and reuse proven themes.",
    inputSchema: retrievePastPostsInputSchema,
    outputSchema: retrievePastPostsOutputSchema,
    async execute(input) {
      if (retrievePastPosts) {
        return retrievePastPosts(input);
      }

      return {
        posts: input.platforms.slice(0, 3).map((platform, index) => ({
          id: `past_${platform}_${index + 1}`,
          platform,
          title: `${input.topic} lesson ${index + 1}`,
          excerpt: `A previous ${platform} post framed ${input.topic} through a practical operating lesson.`,
          engagementScore: 72 - index * 8
        })),
        recurringThemes: ["specific examples outperform broad claims", "approval checkpoints build trust"]
      };
    }
  };
}
