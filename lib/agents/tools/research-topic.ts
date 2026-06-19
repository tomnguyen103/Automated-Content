import { z } from "zod";
import type { AgentTool } from "@/lib/agents/tools/types";

export const researchTopicInputSchema = z.object({
  topic: z.string().min(3).max(240),
  audience: z.string().min(1).max(160),
  sources: z.array(z.string().min(1).max(1000)).max(8).default([])
});

export const researchTopicOutputSchema = z.object({
  summary: z.string().min(1),
  angles: z.array(z.string().min(1)).min(1).max(6),
  keywords: z.array(z.string().min(1)).min(1).max(12),
  sourceNotes: z.array(z.string().min(1)).max(8)
});

export type ResearchTopicInput = z.infer<typeof researchTopicInputSchema>;
export type ResearchTopicOutput = z.infer<typeof researchTopicOutputSchema>;

const stopWords = new Set(["the", "and", "for", "with", "from", "that", "this", "into", "your"]);

function keywordsFromTopic(topic: string) {
  const words = topic
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));

  return [...new Set(words)].slice(0, 8);
}

export function createResearchTopicTool(
  research?: (input: ResearchTopicInput) => Promise<ResearchTopicOutput> | ResearchTopicOutput
): AgentTool<typeof researchTopicInputSchema, typeof researchTopicOutputSchema> {
  return {
    name: "research_topic",
    description: "Summarize a topic and extract content angles from provided source notes.",
    inputSchema: researchTopicInputSchema,
    outputSchema: researchTopicOutputSchema,
    async execute(input) {
      if (research) {
        return research(input);
      }

      const keywords = keywordsFromTopic(input.topic);
      const sourceNotes = input.sources.map((source, index) => `Source ${index + 1}: ${source.slice(0, 220)}`);

      return {
        summary: `${input.topic} matters to ${input.audience} because it connects a timely problem with a practical action path.`,
        angles: [
          `Explain the core shift behind ${input.topic}`,
          `Show a concrete workflow for ${input.audience}`,
          `Call out the mistake most teams make before they see results`
        ],
        keywords: keywords.length > 0 ? keywords : ["content", "workflow", "automation"],
        sourceNotes
      };
    }
  };
}
