import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  createImageKitUploadAuth,
  ImageKitConfigurationError
} from "@/lib/media/imagekit";
import { resolvePersonalWorkspaceForUser } from "@/lib/workspaces/personal-workspace";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  try {
    const workspace = await resolvePersonalWorkspaceForUser(user);
    const forceLocalPreviewMock = workspace.isLocalPreview && process.env.PLAYWRIGHT_AUTH_LOCAL_PREVIEW === "1";

    const uploadAuth = createImageKitUploadAuth({
      workspaceId: workspace.id,
      userId: user.id,
      allowMock: workspace.isLocalPreview,
      config: forceLocalPreviewMock
        ? {
            IMAGEKIT_PRIVATE_KEY: undefined,
            IMAGEKIT_PUBLIC_KEY: undefined,
            IMAGEKIT_URL_ENDPOINT: undefined
          }
        : undefined
    });

    return NextResponse.json(uploadAuth);
  } catch (error) {
    if (error instanceof ImageKitConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    console.error("Unexpected media upload auth error", error);
    return NextResponse.json({ error: "Unable to prepare media upload." }, { status: 500 });
  }
}
