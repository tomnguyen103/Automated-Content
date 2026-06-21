import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  agentAutonomyPolicySchema,
  agentProfileStatusSchema
} from "@/lib/agents/schemas/orchestration";
import { resolveAgentOrchestrationContext } from "@/lib/agents/orchestration/server";

export const runtime = "nodejs";

const updateProfileRequestSchema = z.object({
  status: agentProfileStatusSchema.optional(),
  name: z.string().min(1).max(120).optional(),
  description: z.string().min(1).max(1000).optional(),
  instructions: z.string().min(1).max(8000).optional(),
  capabilities: z.array(z.string().min(1).max(120)).optional(),
  toolScopes: z.array(z.string().min(1).max(160)).optional(),
  policy: agentAutonomyPolicySchema.partial().optional(),
  modelPreferences: z.record(z.string(), z.unknown()).optional(),
  maxConcurrency: z.number().int().positive().optional()
});

const routeParamsSchema = z.object({
  id: z.string().min(1)
});

type AgentProfileRouteContext = {
  params: Promise<unknown>;
};

export async function PATCH(
  request: NextRequest,
  routeContext: AgentProfileRouteContext
) {
  const serverContext = await resolveAgentOrchestrationContext();

  if (!serverContext) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  try {
    const { id } = routeParamsSchema.parse(await routeContext.params);
    const current = await serverContext.repositories.profiles.get({
      workspaceId: serverContext.workspace.id,
      id
    });

    if (!current) {
      return NextResponse.json({ error: "Agent profile not found." }, { status: 404 });
    }

    const input = updateProfileRequestSchema.parse(body);
    const profile = await serverContext.repositories.profiles.save({
      ...current,
      ...input,
      policy: input.policy ? { ...current.policy, ...input.policy } : current.policy,
      modelPreferences: input.modelPreferences ?? current.modelPreferences,
      updatedAt: new Date().toISOString()
    });

    return NextResponse.json({ profile });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid agent profile update.", issues: error.issues }, { status: 400 });
    }

    console.error("Unexpected agent profile update error", error);
    return NextResponse.json({ error: "Unable to update agent profile." }, { status: 500 });
  }
}
