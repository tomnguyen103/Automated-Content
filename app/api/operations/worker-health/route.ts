import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getWorkerRuntimeReadiness } from "@/lib/scheduler/worker-health";
import { resolvePersonalWorkspaceForUser } from "@/lib/workspaces/personal-workspace";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication is required.", code: "authentication_required" }, { status: 401 });
  }

  const workspace = await resolvePersonalWorkspaceForUser(user);
  const readiness = await getWorkerRuntimeReadiness({
    workspaceId: workspace.id,
    isLocalPreview: workspace.isLocalPreview
  });

  return NextResponse.json({ readiness });
}
