import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  listMediaAssetsForWorkspace,
  MediaAssetConflictError,
  saveMediaAssetsForWorkspace
} from "@/lib/media/assets";
import { mediaAssetSchema } from "@/lib/media/types";
import { resolvePersonalWorkspaceForUser } from "@/lib/workspaces/personal-workspace";

export const runtime = "nodejs";

const saveMediaAssetsSchema = z.object({
  assets: z.array(mediaAssetSchema).min(1).max(20)
});

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  const workspace = await resolvePersonalWorkspaceForUser(user);
  const assets = await listMediaAssetsForWorkspace({
    workspaceId: workspace.id,
    allowMemoryFallback: workspace.isLocalPreview
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

    console.error("Unexpected media assets error", error);
    return NextResponse.json({ error: "Unable to save media assets." }, { status: 500 });
  }
}
