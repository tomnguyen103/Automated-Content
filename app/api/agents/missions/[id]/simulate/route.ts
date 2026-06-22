import { NextResponse } from "next/server";
import { z } from "zod";
import { simulateAgentMission } from "@/lib/agents/orchestration/simulation";
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
    const result = await simulateAgentMission({
      workspaceId: serverContext.workspace.id,
      missionId: id,
      requestedByUserId: serverContext.user.id,
      repositories: serverContext.repositories
    });

    return NextResponse.json({
      execution: "simulation",
      ...result
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid mission id.", issues: error.issues }, { status: 400 });
    }

    if (error instanceof Error && error.message.includes("was not found")) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error("Unexpected agent mission simulation error", error);
    return NextResponse.json({ error: "Unable to simulate agent mission." }, { status: 500 });
  }
}
