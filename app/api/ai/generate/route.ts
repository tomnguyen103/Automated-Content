import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ContentAgentExecutionError, runContentAgent } from "@/lib/agents/langchain/content-agent";
import { createAgentStorage } from "@/lib/agents/langchain/storage";
import { contentAgentInputSchema } from "@/lib/agents/schemas/content-pack";
import { getCurrentUser } from "@/lib/auth/current-user";
import { resolvePersonalWorkspaceForUser } from "@/lib/workspaces/personal-workspace";

export const runtime = "nodejs";

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
    const input = contentAgentInputSchema.parse(body);
    const workspace = await resolvePersonalWorkspaceForUser(user);
    const storage = createAgentStorage({
      allowMemoryFallback: workspace.isLocalPreview
    });
    const result = await runContentAgent(input, {
      userId: user.id,
      workspaceId: workspace.id,
      storage
    });

    return NextResponse.json({
      run: result.run,
      contentPack: result.contentPack,
      draft: result.draft
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid generation brief.",
          issues: error.issues
        },
        { status: 400 }
      );
    }

    if (error instanceof ContentAgentExecutionError) {
      return NextResponse.json(
        {
          error: error.message,
          run: error.run
        },
        { status: 500 }
      );
    }

    console.error("Unexpected content generation error", error);
    return NextResponse.json({ error: "Unable to generate content." }, { status: 500 });
  }
}
