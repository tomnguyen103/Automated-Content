import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  agentAutonomyPolicySchema,
  agentProfileRoleSchema,
  agentProfileSchema
} from "@/lib/agents/schemas/orchestration";
import { buildAgentProfileFromTemplate } from "@/lib/agents/orchestration/role-templates";
import { resolveAgentOrchestrationContext } from "@/lib/agents/orchestration/server";

export const runtime = "nodejs";

const createProfileRequestSchema = z.object({
  role: agentProfileRoleSchema,
  name: z.string().min(1).max(120).optional(),
  description: z.string().min(1).max(1000).optional(),
  instructions: z.string().min(1).max(8000).optional(),
  capabilities: z.array(z.string().min(1).max(120)).optional(),
  toolScopes: z.array(z.string().min(1).max(160)).optional(),
  policy: agentAutonomyPolicySchema.partial().optional(),
  modelPreferences: z.record(z.string(), z.unknown()).optional(),
  maxConcurrency: z.number().int().positive().optional()
});

export async function GET() {
  const context = await resolveAgentOrchestrationContext();

  if (!context) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  await context.repositories.profiles.seedRoleTemplates({
    workspaceId: context.workspace.id,
    createdByUserId: context.user.id
  });

  return NextResponse.json({
    profiles: await context.repositories.profiles.list(context.workspace.id)
  });
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
    const input = createProfileRequestSchema.parse(body);
    const base = buildAgentProfileFromTemplate({
      role: input.role,
      workspaceId: context.workspace.id,
      createdByUserId: context.user.id
    });
    const profile = agentProfileSchema.parse({
      ...base,
      name: input.name ?? base.name,
      description: input.description ?? base.description,
      instructions: input.instructions ?? base.instructions,
      capabilities: input.capabilities ?? base.capabilities,
      toolScopes: input.toolScopes ?? base.toolScopes,
      policy: input.policy ? { ...base.policy, ...input.policy } : base.policy,
      modelPreferences: input.modelPreferences ?? base.modelPreferences,
      maxConcurrency: input.maxConcurrency ?? base.maxConcurrency,
      metadata: {
        ...base.metadata,
        customized: true
      },
      updatedAt: new Date().toISOString()
    });

    return NextResponse.json(
      {
        profile: await context.repositories.profiles.save(profile)
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid agent profile.", issues: error.issues }, { status: 400 });
    }

    console.error("Unexpected agent profile create error", error);
    return NextResponse.json({ error: "Unable to create agent profile." }, { status: 500 });
  }
}
