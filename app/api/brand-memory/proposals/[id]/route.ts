import { NextResponse } from "next/server";
import { z } from "zod";
import { createBrandMemoryProposalRepository } from "@/lib/brand-memory/proposals";
import { getCurrentUser } from "@/lib/auth/current-user";
import { resolvePersonalWorkspaceForUser } from "@/lib/workspaces/personal-workspace";

export const runtime = "nodejs";

const reviewProposalRequestSchema = z.object({
  status: z.enum(["accepted", "rejected"])
});

type BrandMemoryProposalRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, context: BrandMemoryProposalRouteContext) {
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
    const { id } = await context.params;
    const { status } = reviewProposalRequestSchema.parse(body);
    const workspace = await resolvePersonalWorkspaceForUser(user);
    const proposal = await createBrandMemoryProposalRepository({
      allowMemoryFallback: workspace.isLocalPreview,
      preferMemoryFallback: workspace.isLocalPreview
    }).review({
      workspaceId: workspace.id,
      id,
      status,
      userId: user.id
    });

    if (!proposal) {
      return NextResponse.json({ error: "Brand memory proposal was not found." }, { status: 404 });
    }

    return NextResponse.json({ proposal });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid proposal review request.", issues: error.issues }, { status: 400 });
    }

    console.error("Unexpected brand memory proposal review error", error);
    return NextResponse.json({ error: "Unable to review brand memory proposal." }, { status: 500 });
  }
}
