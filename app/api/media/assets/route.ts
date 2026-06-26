import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  consumeUsageForLimit,
  UsageLimitExceededError
} from "@/lib/billing/usage";
import {
  assertMediaAssetProvenance,
  listMediaAssetsForWorkspace,
  MediaAssetConflictError,
  MediaAssetProvenanceError,
  saveMediaAssetsForWorkspace
} from "@/lib/media/assets";
import { mediaAssetSchema } from "@/lib/media/types";
import { resolvePersonalWorkspaceForUser } from "@/lib/workspaces/personal-workspace";

export const runtime = "nodejs";

const saveMediaAssetsSchema = z.object({
  assets: z.array(mediaAssetSchema).min(1).max(20)
});

export async function GET(request?: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  const workspace = await resolvePersonalWorkspaceForUser(user);
  const limit = request ? new URL(request.url).searchParams.get("limit") ?? undefined : undefined;
  const assets = await listMediaAssetsForWorkspace({
    workspaceId: workspace.id,
    allowMemoryFallback: workspace.isLocalPreview,
    fallbackUploadedByUserId: user.id,
    limit
  });

  return NextResponse.json({ assets });
}

export async function POST(request: NextRequest) {
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
    const input = saveMediaAssetsSchema.parse(body);
    const workspace = await resolvePersonalWorkspaceForUser(user);

    for (const asset of input.assets) {
      assertMediaAssetProvenance({
        workspaceId: workspace.id,
        uploadedByUserId: user.id,
        asset,
        allowMemoryFallback: workspace.isLocalPreview
      });
    }

    for (const asset of input.assets) {
      await consumeUsageForLimit({
        workspaceId: workspace.id,
        key: "mediaTransformsPerMonth",
        sourceId: `media_asset:${asset.id}`,
        metadata: {
          assetId: asset.id,
          provider: asset.provider,
          userId: user.id
        },
        skip: workspace.isLocalPreview
      });
    }

    const assets = await saveMediaAssetsForWorkspace({
      workspaceId: workspace.id,
      uploadedByUserId: user.id,
      assets: input.assets,
      allowMemoryFallback: workspace.isLocalPreview
    });

    return NextResponse.json({ assets }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid media asset payload.",
          issues: error.issues
        },
        { status: 400 }
      );
    }

    if (error instanceof MediaAssetConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    if (error instanceof MediaAssetProvenanceError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof UsageLimitExceededError) {
      return NextResponse.json(
        {
          error: "Media transforms limit reached for the current plan.",
          usage: error.metric
        },
        { status: 429 }
      );
    }

    console.error("Unexpected media assets error", error);
    return NextResponse.json({ error: "Unable to save media assets." }, { status: 500 });
  }
}
