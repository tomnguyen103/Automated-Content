import { NextResponse } from "next/server";
import { z } from "zod";
import { pauseAgentMission } from "@/lib/agents/orchestration/runner";
import { resolveAgentOrchestrationContext } from "@/lib/agents/orchestration/server";

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

  try {
    const { id } = routeParamsSchema.parse(await routeContext.params);
    const mission = await pauseAgentMission({
      workspaceId: serverContext.workspace.id,
      missionId: id,
      repositories: serverContext.repositories
    });

    return NextResponse.json({ mission });
  } catch (error) {
    console.error("Unexpected agent mission pause error", error);
    return NextResponse.json({ error: "Unable to pause agent mission." }, { status: 500 });
  }
}
