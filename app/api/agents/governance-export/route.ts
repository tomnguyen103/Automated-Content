import { NextResponse } from "next/server";
import { buildAgentGovernanceExport } from "@/lib/agents/governance-export";
import { resolveAgentOrchestrationContext } from "@/lib/agents/orchestration/server";
import {
  ensureFeatureAllowed,
  FeatureAccessError
} from "@/lib/billing/usage";

export const runtime = "nodejs";

export async function GET() {
  const context = await resolveAgentOrchestrationContext();

  if (!context) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  try {
    await ensureFeatureAllowed({
      workspaceId: context.workspace.id,
      feature: "governanceExport",
      skip: context.workspace.isLocalPreview
    });
  } catch (error) {
    if (error instanceof FeatureAccessError) {
      return NextResponse.json(
        {
          error: error.message,
          code: "upgrade_required",
          feature: error.feature,
          requiredPlan: error.requiredPlan
        },
        { status: 402 }
      );
    }

    throw error;
  }

  const payload = await buildAgentGovernanceExport({
    workspaceId: context.workspace.id,
    requestedByUserId: context.user.id,
    repositories: context.repositories,
    allowMemoryFallback: context.workspace.isLocalPreview
  });
  const generatedAt = typeof payload === "object" && payload && "generatedAt" in payload
    ? String(payload.generatedAt).slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": `attachment; filename="agent-governance-${generatedAt}.json"`,
      "Content-Type": "application/json; charset=utf-8",
      Pragma: "no-cache"
    }
  });
}
