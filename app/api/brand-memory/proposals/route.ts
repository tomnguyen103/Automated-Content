import { NextResponse, type NextRequest } from "next/server";
import { brandMemoryProposalStatusSchema } from "@/lib/brand-memory/schemas";
import { createBrandMemoryProposalRepository } from "@/lib/brand-memory/proposals";
import { getCurrentUser } from "@/lib/auth/current-user";
import { resolvePersonalWorkspaceForUser } from "@/lib/workspaces/personal-workspace";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  const workspace = await resolvePersonalWorkspaceForUser(user);
  const rawStatus = request.nextUrl.searchParams.get("status") ?? undefined;
  const statusResult = rawStatus ? brandMemoryProposalStatusSchema.safeParse(rawStatus) : null;

  if (statusResult && !statusResult.success) {
    return NextResponse.json({ error: "Invalid proposal status." }, { status: 400 });
  }

  const status = statusResult?.data;
  const proposals = await createBrandMemoryProposalRepository({
    allowMemoryFallback: workspace.isLocalPreview,
    preferMemoryFallback: workspace.isLocalPreview
  }).list({
    workspaceId: workspace.id,
    status,
    limit: 50
  });

  return NextResponse.json({ proposals });
}
