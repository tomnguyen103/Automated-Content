import { NextResponse } from "next/server";
import { runMissionWorkflow } from "@/lib/agents/graphs/mission-workflow";
import type { AgentMission } from "@/lib/agents/schemas/orchestration";
import { enqueueAgentMission } from "@/lib/agents/orchestration/queue";
import type { AgentMissionRepository } from "@/lib/agents/orchestration/repository";
import { resolveAgentOrchestrationContext } from "@/lib/agents/orchestration/server";
import { QueueConfigurationError } from "@/lib/scheduler/enqueue";
import { z } from "zod";

export const runtime = "nodejs";

const routeParamsSchema = z.object({
  id: z.string().min(1)
});

type AgentMissionRouteContext = {
  params: Promise<unknown>;
};

function queueContext(mission: AgentMission, queue: Record<string, unknown>) {
  return {
    ...mission.context,
    queue
  };
}

async function markMissionQueueQueued({
  mission,
  queueJobId,
  repository
}: {
  mission: AgentMission;
  queueJobId: string;
  repository: AgentMissionRepository;
}) {
  const now = new Date().toISOString();

  return repository.save({
    ...mission,
    status: "queued",
    error: undefined,
    context: queueContext(mission, {
      status: "queued",
      queueJobId,
      queuedAt: now
    }),
    updatedAt: now
  });
}

async function markMissionQueueFailed({
  error,
  mission,
  repository
}: {
  error: string;
  mission: AgentMission;
  repository: AgentMissionRepository;
}) {
  const now = new Date().toISOString();

  return repository.save({
    ...mission,
    status: "failed",
    error,
    context: queueContext(mission, {
      status: "failed",
      error,
      failedAt: now
    }),
    updatedAt: now
  });
}

export async function POST(
  _request: Request,
  routeContext: AgentMissionRouteContext
) {
  const serverContext = await resolveAgentOrchestrationContext();

  if (!serverContext) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  try {
    const { id } = routeParamsSchema.parse(await routeContext.params);
    const mission = await serverContext.repositories.missions.get({
      workspaceId: serverContext.workspace.id,
      id
    });

    if (!mission) {
      return NextResponse.json({ error: "Agent mission not found." }, { status: 404 });
    }

    if (serverContext.workspace.isLocalPreview) {
      const result = await runMissionWorkflow({
        workspaceId: serverContext.workspace.id,
        missionId: id,
        repositories: serverContext.repositories,
        allowMemoryFallback: serverContext.workspace.isLocalPreview
      });

      return NextResponse.json({
        execution: "inline",
        ...result
      });
    }

    try {
      const enqueue = await enqueueAgentMission({
        workspaceId: serverContext.workspace.id,
        missionId: id
      });
      const queuedMission = await markMissionQueueQueued({
        mission,
        queueJobId: enqueue.queueJobId,
        repository: serverContext.repositories.missions
      });

      return NextResponse.json({
        execution: "queued",
        enqueue,
        mission: queuedMission
      });
    } catch (error) {
      if (error instanceof QueueConfigurationError) {
        const message = "Agent mission queue is not configured.";
        const failedMission = await markMissionQueueFailed({
          error: message,
          mission,
          repository: serverContext.repositories.missions
        });

        return NextResponse.json(
          {
            error: message,
            code: "agent_mission_queue_unavailable",
            mission: failedMission
          },
          { status: 503 }
        );
      }

      throw error;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid mission id.", issues: error.issues }, { status: 400 });
    }

    console.error("Unexpected agent mission run error", error);
    return NextResponse.json({ error: "Unable to run agent mission." }, { status: 500 });
  }
}
