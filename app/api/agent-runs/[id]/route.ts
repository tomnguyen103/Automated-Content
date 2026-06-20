import { NextResponse } from "next/server";
import { createAgentStorage } from "@/lib/agents/langchain/storage";
import { getCurrentUser } from "@/lib/auth/current-user";
import { resolvePersonalWorkspaceForUser } from "@/lib/workspaces/personal-workspace";

export const runtime = "nodejs";

type AgentRunRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: AgentRunRouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  const { id } = await context.params;
  const workspace = await resolvePersonalWorkspaceForUser(user);
  const storage = createAgentStorage({
    allowMemoryFallback: workspace.isLocalPreview
  });
  const run = await storage.getRun(id, workspace.id);

  if (!run) {
    return NextResponse.json({ error: "Agent run not found." }, { status: 404 });
  }

  if (run.userId !== user.id) {
    return NextResponse.json({ error: "Agent run is not available to this user." }, { status: 403 });
  }

  return NextResponse.json({ run });
}
