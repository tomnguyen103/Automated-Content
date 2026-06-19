import { z } from "zod";
import { contentPackSchema } from "@/lib/agents/schemas/content-pack";
import type { AgentTool } from "@/lib/agents/tools/types";

export const saveDraftInputSchema = z.object({
  workspaceId: z.string().min(1),
  userId: z.string().min(1),
  agentRunId: z.string().min(1).optional(),
  sources: z.array(z.string().min(1).max(1000)).default([]),
  contentPack: contentPackSchema
});

export const saveDraftOutputSchema = z.object({
  draftId: z.string().min(1),
  status: z.enum(["saved"]),
  savedAt: z.string().min(1)
});

export type SaveDraftInput = z.infer<typeof saveDraftInputSchema>;
export type SaveDraftOutput = z.infer<typeof saveDraftOutputSchema>;

export function createSaveDraftTool(
  saveDraft?: (input: SaveDraftInput) => Promise<SaveDraftOutput> | SaveDraftOutput
): AgentTool<typeof saveDraftInputSchema, typeof saveDraftOutputSchema> {
  return {
    name: "save_draft",
    description: "Persist a generated content pack as a reviewable draft.",
    inputSchema: saveDraftInputSchema,
    outputSchema: saveDraftOutputSchema,
    async execute(input, context) {
      if (saveDraft) {
        return saveDraft(input);
      }

      return {
        draftId: `draft_${crypto.randomUUID()}`,
        status: "saved",
        savedAt: context.now().toISOString()
      };
    }
  };
}
