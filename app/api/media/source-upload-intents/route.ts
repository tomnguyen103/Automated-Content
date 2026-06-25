import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  createSignedSourceVideoUploadIntent,
  ObjectStorageConfigurationError,
  ObjectStorageUploadIntentError
} from "@/lib/media/object-storage";
import { resolvePersonalWorkspaceForUser } from "@/lib/workspaces/personal-workspace";

export const runtime = "nodejs";

const sourceUploadIntentSchema = z.object({
  contentType: z.string().trim().startsWith("video/"),
  fileName: z.string().trim().min(1).max(240),
  sizeBytes: z.number().int().positive()
});

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
    const input = sourceUploadIntentSchema.parse(body);
    const workspace = await resolvePersonalWorkspaceForUser(user);
    const intent = await createSignedSourceVideoUploadIntent({
      workspaceId: workspace.id,
      userId: user.id,
      fileName: input.fileName,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      id: `source_${randomUUID()}`
    });

    return NextResponse.json({ intent }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid source video upload intent payload.",
          issues: error.issues
        },
        { status: 400 }
      );
    }

    if (error instanceof ObjectStorageConfigurationError) {
      return NextResponse.json(
        {
          error: "Object storage is not configured.",
          detail: error.message
        },
        { status: 503 }
      );
    }

    if (error instanceof ObjectStorageUploadIntentError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Unexpected source video upload intent error", error);
    return NextResponse.json({ error: "Unable to create source video upload intent." }, { status: 500 });
  }
}
