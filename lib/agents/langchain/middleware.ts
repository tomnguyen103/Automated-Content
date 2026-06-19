import type { z } from "zod";
import type { AgentToolCall } from "@/lib/agents/schemas/agent-run";
import type { AgentTool, ToolExecutionContext } from "@/lib/agents/tools/types";

export function createTraceId(prefix = "agent") {
  return `${prefix}_${crypto.randomUUID()}`;
}

export class AgentRunRecorder {
  private readonly toolCalls: AgentToolCall[] = [];

  constructor(private readonly traceId: string, private readonly now: () => Date = () => new Date()) {}

  get context(): ToolExecutionContext {
    return {
      traceId: this.traceId,
      now: this.now
    };
  }

  get calls() {
    return [...this.toolCalls];
  }

  async execute<InputSchema extends z.ZodType, OutputSchema extends z.ZodType>(
    tool: AgentTool<InputSchema, OutputSchema>,
    input: z.infer<InputSchema>
  ): Promise<z.infer<OutputSchema>> {
    const startedAt = this.now().toISOString();
    const parsedInput = tool.inputSchema.parse(input);

    try {
      const output = tool.outputSchema.parse(await tool.execute(parsedInput, this.context));
      this.toolCalls.push({
        id: crypto.randomUUID(),
        name: tool.name,
        status: "succeeded",
        startedAt,
        completedAt: this.now().toISOString(),
        input: parsedInput as Record<string, unknown>,
        output: output as Record<string, unknown>
      });

      return output;
    } catch (error) {
      this.toolCalls.push({
        id: crypto.randomUUID(),
        name: tool.name,
        status: "failed",
        startedAt,
        completedAt: this.now().toISOString(),
        input: parsedInput as Record<string, unknown>,
        error: error instanceof Error ? error.message : "Unknown tool execution error"
      });

      throw error;
    }
  }
}
