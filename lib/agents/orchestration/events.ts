import "server-only";

import { createN8nClient } from "@/lib/n8n/client";
import type { N8nEventType } from "@/lib/n8n/events";
import { recordAgentEvent } from "@/lib/observability/agent-events";

const n8nAgentEvents = new Set<N8nEventType>([
  "agent.mission.started",
  "agent.mission.completed",
  "agent.task.succeeded",
  "agent.task.failed",
  "agent.policy.evaluated"
]);

export function emitAgentOrchestrationEvent(event: N8nEventType, fields: Record<string, unknown>) {
  recordAgentEvent(event, fields);

  const workspaceId = typeof fields.workspaceId === "string" ? fields.workspaceId : null;

  if (!workspaceId || !n8nAgentEvents.has(event)) {
    return;
  }

  void createN8nClient()
    .emit({
      event,
      workspaceId,
      data: fields
    })
    .catch(() => undefined);
}
