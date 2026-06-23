import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  brandMemoryProposalScopeSchema,
  brandMemoryProposalStatusSchema
} from "@/lib/brand-memory/schemas";
import { socialPlatformSchema } from "@/lib/agents/schemas/platform-variant";
import { createBrandMemoryProposalRepository } from "@/lib/brand-memory/proposals";
import { getCurrentUser } from "@/lib/auth/current-user";
import { resolvePersonalWorkspaceForUser } from "@/lib/workspaces/personal-workspace";

export const runtime = "nodejs";

const confidenceParamSchema = z.coerce.number().int().min(0).max(100);
const limitParamSchema = z.coerce.number().int().min(1).max(100);

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  try {
    const workspace = await resolvePersonalWorkspaceForUser(user);
    const rawStatus = request.nextUrl.searchParams.get("status") ?? undefined;
    const rawScope = request.nextUrl.searchParams.get("scope") ?? undefined;
    const rawPlatform = request.nextUrl.searchParams.get("platform") ?? undefined;
    const rawMinConfidence = request.nextUrl.searchParams.get("minConfidence") ?? undefined;
    const rawMaxConfidence = request.nextUrl.searchParams.get("maxConfidence") ?? undefined;
    const rawLimit = request.nextUrl.searchParams.get("limit") ?? undefined;
    const statusResult = rawStatus ? brandMemoryProposalStatusSchema.safeParse(rawStatus) : null;
    const scopeResult = rawScope ? brandMemoryProposalScopeSchema.safeParse(rawScope) : null;
    const platformResult = rawPlatform ? socialPlatformSchema.safeParse(rawPlatform) : null;
    const minConfidenceResult = rawMinConfidence ? confidenceParamSchema.safeParse(rawMinConfidence) : null;
    const maxConfidenceResult = rawMaxConfidence ? confidenceParamSchema.safeParse(rawMaxConfidence) : null;
    const limitResult = rawLimit ? limitParamSchema.safeParse(rawLimit) : null;

    if (statusResult && !statusResult.success) {
      return NextResponse.json({ error: "Invalid proposal status." }, { status: 400 });
    }

    if (scopeResult && !scopeResult.success) {
      return NextResponse.json({ error: "Invalid proposal scope." }, { status: 400 });
    }

    if (platformResult && !platformResult.success) {
      return NextResponse.json({ error: "Invalid proposal platform." }, { status: 400 });
    }

    if (minConfidenceResult && !minConfidenceResult.success) {
      return NextResponse.json({ error: "Invalid minimum confidence." }, { status: 400 });
    }

    if (maxConfidenceResult && !maxConfidenceResult.success) {
      return NextResponse.json({ error: "Invalid maximum confidence." }, { status: 400 });
    }

    if (limitResult && !limitResult.success) {
      return NextResponse.json({ error: "Invalid proposal limit." }, { status: 400 });
    }

    const status = statusResult?.data;
    const scope = scopeResult?.data;
    const platform = platformResult?.data;
    const minConfidence = minConfidenceResult?.data;
    const maxConfidence = maxConfidenceResult?.data;

    if (minConfidence !== undefined && maxConfidence !== undefined && minConfidence > maxConfidence) {
      return NextResponse.json({ error: "Minimum confidence cannot exceed maximum confidence." }, { status: 400 });
    }

    const proposals = await createBrandMemoryProposalRepository({
      allowMemoryFallback: workspace.isLocalPreview,
      preferMemoryFallback: workspace.isLocalPreview
    }).list({
      workspaceId: workspace.id,
      status,
      scope,
      platform,
      minConfidence,
      maxConfidence,
      limit: limitResult?.data ?? 50
    });

    return NextResponse.json({ proposals });
  } catch (error) {
    console.error("Unable to list brand memory proposals", error);
    return NextResponse.json({ error: "Unable to list brand memory proposals." }, { status: 500 });
  }
}
