import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getMediaGenerationJobForWorkspace } from "@/lib/jobs/media";
import { resolvePersonalWorkspaceForUser } from "@/lib/workspaces/personal-workspace";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    asset: string;
    jobId: string;
    workspaceId: string;
  }>;
};

function safeAttachmentName(asset: string) {
  const cleaned = asset.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");

  return `${cleaned || "generated-artifact"}.json`;
}

function syntheticLabel(output: Record<string, unknown>) {
  const renderedClip = output.renderedClip;
  const influencerAsset = output.influencerAsset;
  const avatarVideo = output.avatarVideo;

  if (renderedClip && typeof renderedClip === "object" && "syntheticMediaLabel" in renderedClip) {
    return String(renderedClip.syntheticMediaLabel);
  }

  if (influencerAsset && typeof influencerAsset === "object" && "syntheticMediaLabel" in influencerAsset) {
    return String(influencerAsset.syntheticMediaLabel);
  }

  if (avatarVideo && typeof avatarVideo === "object" && "syntheticMediaLabel" in avatarVideo) {
    return String(avatarVideo.syntheticMediaLabel);
  }

  return "Deterministic local media workflow artifact.";
}

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  const { asset, jobId, workspaceId } = await context.params;
  const workspace = await resolvePersonalWorkspaceForUser(user);

  if (workspace.id !== workspaceId) {
    return NextResponse.json({ error: "Generated artifact was not found." }, { status: 404 });
  }

  const job = await getMediaGenerationJobForWorkspace({
    allowMemoryFallback: workspace.isLocalPreview,
    jobId,
    workspaceId
  });

  if (!job || job.status !== "succeeded") {
    return NextResponse.json({ error: "Generated artifact was not found." }, { status: 404 });
  }

  const isDownload = request.nextUrl.searchParams.get("download") === "1";

  return NextResponse.json(
    {
      artifact: {
        asset,
        generatedAt: job.completedAt ?? job.updatedAt,
        jobId: job.id,
        jobKind: job.jobKind,
        syntheticMediaLabel: syntheticLabel(job.output),
        workspaceId: job.workspaceId
      },
      output: job.output
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
        ...(isDownload
          ? {
              "Content-Disposition": `attachment; filename="${safeAttachmentName(asset)}"`
            }
          : {})
      }
    }
  );
}
