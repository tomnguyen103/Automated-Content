import type { z } from "zod";

export type ToolExecutionContext = {
  traceId: string;
  now: () => Date;
};

export type AgentTool<InputSchema extends z.ZodType, OutputSchema extends z.ZodType> = {
  name: string;
  description: string;
  inputSchema: InputSchema;
  outputSchema: OutputSchema;
  execute: (
    input: z.infer<InputSchema>,
    context: ToolExecutionContext
  ) => Promise<z.infer<OutputSchema>> | z.infer<OutputSchema>;
};
