import { NextResponse } from "next/server";
import { z } from "zod";
import { createBrandMemoryProposalRepository } from "@/lib/brand-memory/proposals";
import { getCurrentUser } from "@/lib/auth/current-user";
import { resolvePersonalWorkspaceForUser } from "@/lib/workspaces/personal-workspace";

export const runtime = "nodejs";

const bulkReviewRequestSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(50),
  status: z.enum(["accepted", "rejected"])
});

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  try {
    const input = bulkReviewRequestSchema.parse(body);
    const workspace = await resolvePersonalWorkspaceForUser(user);
    const proposals = await createBrandMemoryProposalRepository({
      allowMemoryFallback: workspace.isLocalPreview,
      preferMemoryFallback: workspace.isLocalPreview
    }).reviewMany({
      workspaceId: workspace.id,
      ids: input.ids,
      status: input.status,
      userId: user.id
    });

    if (proposals.length === 0) {
      return NextResponse.json({ error: "Brand memory proposals were not found." }, { status: 404 });
    }

    return NextResponse.json({
      proposals,
      reviewedCount: proposals.length
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid bulk review request.", issues: error.issues }, { status: 400 });
    }

    console.error("Unexpected brand memory bulk review error", error);
    return NextResponse.json({ error: "Unable to review brand memory proposals." }, { status: 500 });
  }
}
