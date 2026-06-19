import { z } from "zod";
import { contentAgentInputSchema, contentPackSchema } from "@/lib/agents/schemas/content-pack";

export const agentRunStatusSchema = z.enum(["queued", "running", "succeeded", "failed"]);
export const aiProviderSchema = z.enum(["openai", "gemini"]);

export const agentToolCallSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  status: z.enum(["succeeded", "failed"]),
  startedAt: z.string().min(1),
  completedAt: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
  output: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional()
});

export const agentRunSchema = z.object({
  id: z.string().min(1),
  traceId: z.string().min(1),
  status: agentRunStatusSchema,
  provider: aiProviderSchema,
  model: z.string().min(1),
  userId: z.string().min(1),
  workspaceId: z.string().min(1),
  input: contentAgentInputSchema,
  output: contentPackSchema.optional(),
  toolCalls: z.array(agentToolCallSchema),
  error: z.string().optional(),
  startedAt: z.string().min(1),
  completedAt: z.string().min(1).optional()
});

export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>;
export type AiProvider = z.infer<typeof aiProviderSchema>;
export type AgentToolCall = z.infer<typeof agentToolCallSchema>;
export type AgentRun = z.infer<typeof agentRunSchema>;
