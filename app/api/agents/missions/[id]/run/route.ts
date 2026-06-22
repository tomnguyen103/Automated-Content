import { NextResponse } from "next/server";
import { runMissionWorkflow } from "@/lib/agents/graphs/mission-workflow";
import { enqueueAgentMission } from "@/lib/agents/orchestration/queue";
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

export async function POST(
  _request: Request,
  routeContext: AgentMissionRouteContext
) {
  const serverContext = await resolveAgentOrchestrationContext();

  if (!serverContext) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  const { id } = routeParamsSchema.parse(await routeContext.params);

  try {
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

    const enqueue = await enqueueAgentMission({
      workspaceId: serverContext.workspace.id,
      missionId: id
    });

    return NextResponse.json({
      execution: "queued",
      enqueue
    });
  } catch (error) {
    if (error instanceof QueueConfigurationError) {
      const result = await runMissionWorkflow({
        workspaceId: serverContext.workspace.id,
        missionId: id,
        repositories: serverContext.repositories,
        allowMemoryFallback: serverContext.workspace.isLocalPreview
      });

      return NextResponse.json({
        execution: "inline",
        queueFallback: error.message,
        ...result
      });
    }

    console.error("Unexpected agent mission run error", error);
    return NextResponse.json({ error: "Unable to run agent mission." }, { status: 500 });
  }
}
