import "server-only";

import { logger, type LogFields } from "@/lib/observability/logger";

export type AgentTraceMetadataInput = {
  agentType: "content" | "comment";
  model: string;
  provider: string;
  runId?: string;
  runtime?: "local" | "remote";
  traceId: string;
  userId: string;
  workflow?: "content_agent" | "content_workflow" | "comment_agent" | "comment_reply_workflow";
  workspaceId: string;
};

export function createAgentTraceMetadata(input: AgentTraceMetadataInput): Record<string, string> {
  return {
    agentType: input.agentType,
    model: input.model,
    provider: input.provider,
    runId: input.runId ?? "",
    runtime: input.runtime ?? "",
    traceId: input.traceId,
    userId: input.userId,
    workflow: input.workflow ?? "",
    workspaceId: input.workspaceId
  };
}

export function recordAgentEvent(event: string, fields: LogFields) {
  logger.info("agent event", {
    ...fields,
    event
  });
}
