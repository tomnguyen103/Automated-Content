import "server-only";

import {
  agentN8nAuditEventSchema,
  type AgentN8nAuditEvent
} from "@/lib/agents/schemas/orchestration";
import {
  AGENT_MISSION_HISTORY_LIMIT,
  AGENT_POLICY_EVENT_HISTORY_LIMIT,
  AGENT_SIMULATION_HISTORY_LIMIT,
  AGENT_TASK_RUN_HISTORY_LIMIT,
  type AgentOrchestrationRepositories
} from "@/lib/agents/orchestration/repository";
import { listN8nEventsForWorkspace } from "@/lib/n8n/event-log";

export const AGENT_N8N_EVENT_HISTORY_LIMIT = 8;
const WORKSPACE_N8N_EVENT_FETCH_LIMIT = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function missionIdFromN8nPayload(payload: Record<string, unknown>) {
  const data = isRecord(payload.data) ? payload.data : {};
  const candidates = [data.missionId, payload.missionId];

  return candidates.find((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0);
}

function toOptionalIso(value: Date | undefined) {
  return value ? value.toISOString() : undefined;
}

function serializeN8nEvent(event: Awaited<ReturnType<typeof listN8nEventsForWorkspace>>[number]): AgentN8nAuditEvent {
  return agentN8nAuditEventSchema.parse({
    id: event.id,
    direction: event.direction,
    eventType: event.eventType,
    workflow: event.workflow,
    status: event.status,
    payload: event.payload ?? {},
    responseStatus: event.responseStatus,
    error: event.error,
    occurredAt: toOptionalIso(event.occurredAt),
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString()
  });
}

export async function listAgentMissionAuditRecords({
  limit = AGENT_MISSION_HISTORY_LIMIT,
  repositories,
  workspaceId
}: {
  workspaceId: string;
  repositories: AgentOrchestrationRepositories;
  limit?: number;
}) {
  const [missions, n8nEvents] = await Promise.all([
    repositories.missions.list(workspaceId, { limit }),
    listN8nEventsForWorkspace({
      workspaceId,
      limit: WORKSPACE_N8N_EVENT_FETCH_LIMIT
    })
  ]);

  const n8nEventsByMission = new Map<string, AgentN8nAuditEvent[]>();

  for (const event of n8nEvents) {
    const missionId = missionIdFromN8nPayload(event.payload ?? {});

    if (!missionId) {
      continue;
    }

    const events = n8nEventsByMission.get(missionId) ?? [];
    events.push(serializeN8nEvent(event));
    n8nEventsByMission.set(missionId, events);
  }

  return Promise.all(
    missions.map(async (mission) => {
      const [tasks, policyEvents, simulations] = await Promise.all([
        repositories.taskRuns.listForMission({
          workspaceId,
          missionId: mission.id,
          limit: AGENT_TASK_RUN_HISTORY_LIMIT
        }),
        repositories.policyEvents.listForMission({
          workspaceId,
          missionId: mission.id,
          limit: AGENT_POLICY_EVENT_HISTORY_LIMIT
        }),
        repositories.simulationRuns.listForMission({
          workspaceId,
          missionId: mission.id,
          limit: AGENT_SIMULATION_HISTORY_LIMIT
        })
      ]);

      return {
        mission,
        tasks,
        policyEvents,
        simulations,
        n8nEvents: (n8nEventsByMission.get(mission.id) ?? []).slice(0, AGENT_N8N_EVENT_HISTORY_LIMIT)
      };
    })
  );
}
