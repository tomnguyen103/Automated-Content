import { NextResponse } from "next/server";
import { buildAgentGovernanceExport } from "@/lib/agents/governance-export";
import { resolveAgentOrchestrationContext } from "@/lib/agents/orchestration/server";

export const runtime = "nodejs";

export async function GET() {
  const context = await resolveAgentOrchestrationContext();

  if (!context) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
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
      "Content-Disposition": `attachment; filename="agent-governance-${generatedAt}.json"`,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}
