import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  createSignedSourceVideoUploadIntent,
  getObjectStorageConfig,
  ObjectStorageConfigurationError,
  ObjectStorageUploadIntentError
} from "@/lib/media/object-storage";
import {
  assertExpensiveEndpointAllowed,
  ExpensiveEndpointRateLimitError
} from "@/lib/security/expensive-endpoint-protection";
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
    const id = `source_${randomUUID()}`;
    const storageConfig = getObjectStorageConfig();
    assertExpensiveEndpointAllowed({
      route: "media.source-upload-intents.create",
      userId: user.id,
      workspaceId: workspace.id,
      skip: workspace.isLocalPreview
    });

    if (input.sizeBytes > storageConfig.maxUploadBytes) {
      throw new ObjectStorageUploadIntentError("Source video exceeds the configured upload size limit.");
    }

    const intent = await createSignedSourceVideoUploadIntent({
      workspaceId: workspace.id,
      userId: user.id,
      fileName: input.fileName,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      id,
      config: storageConfig
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

    if (error instanceof ExpensiveEndpointRateLimitError) {
      return NextResponse.json(
        {
          error: error.message,
          limit: error.limit,
          resetAt: error.resetAt,
          windowMs: error.windowMs
        },
        { status: 429 }
      );
    }

    console.error("Unexpected source video upload intent error", error);
    return NextResponse.json({ error: "Unable to create source video upload intent." }, { status: 500 });
  }
}
