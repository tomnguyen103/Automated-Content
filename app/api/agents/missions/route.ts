import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  agentAutonomyPolicySchema,
  agentMissionSchema,
  agentMissionTypeSchema
} from "@/lib/agents/schemas/orchestration";
import { resolveAgentOrchestrationContext } from "@/lib/agents/orchestration/server";
import { listAgentMissionAuditRecords } from "@/lib/agents/orchestration/audit";
import { AGENT_MISSION_HISTORY_LIMIT } from "@/lib/agents/orchestration/repository";

export const runtime = "nodejs";

const createMissionRequestSchema = z.object({
  missionType: agentMissionTypeSchema,
  title: z.string().min(1).max(180),
  objective: z.string().min(1).max(1000),
  brief: z.string().min(1).max(8000),
  coordinatorProfileId: z.string().min(1).optional(),
  priority: z.number().int().min(0).max(100).default(50),
  inputs: z.record(z.string(), z.unknown()).default({}),
  context: z.record(z.string(), z.unknown()).default({}),
  policy: agentAutonomyPolicySchema.partial().optional()
});

export async function GET() {
  const context = await resolveAgentOrchestrationContext();

  if (!context) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  const missions = await listAgentMissionAuditRecords({
    workspaceId: context.workspace.id,
    repositories: context.repositories,
    limit: AGENT_MISSION_HISTORY_LIMIT
  });

  return NextResponse.json({ missions });
}

export async function POST(request: NextRequest) {
  const context = await resolveAgentOrchestrationContext();

  if (!context) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  try {
    const input = createMissionRequestSchema.parse(body);
    const profiles = await context.repositories.profiles.seedRoleTemplates({
      workspaceId: context.workspace.id,
      createdByUserId: context.user.id
    });
    const coordinator = input.coordinatorProfileId
      ? profiles.find((profile) => profile.id === input.coordinatorProfileId)
      : profiles.find((profile) => profile.role === "coordinator");

    if (input.coordinatorProfileId && !coordinator) {
      return NextResponse.json({ error: "Coordinator profile not found." }, { status: 400 });
    }

    const timestamp = new Date().toISOString();
    const mission = agentMissionSchema.parse({
      id: `agent_mission_${crypto.randomUUID()}`,
      workspaceId: context.workspace.id,
      createdByUserId: context.user.id,
      coordinatorProfileId: coordinator?.id,
      missionType: input.missionType,
      title: input.title,
      objective: input.objective,
      brief: input.brief,
      status: "queued",
      priority: input.priority,
      inputs: input.inputs,
      context: input.context,
      policy: input.policy ?? {},
      requestedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    return NextResponse.json(
      {
        mission: await context.repositories.missions.save(mission)
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid agent mission.", issues: error.issues }, { status: 400 });
    }

    console.error("Unexpected agent mission create error", error);
    return NextResponse.json({ error: "Unable to create agent mission." }, { status: 500 });
  }
}
