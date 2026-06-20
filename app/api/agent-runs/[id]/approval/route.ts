import { NextResponse } from "next/server";
import { z } from "zod";
import { createContentWorkflowCheckpointStore } from "@/lib/agents/graphs/checkpoints";
import {
  applyContentWorkflowApproval,
  ContentWorkflowExecutionError,
  WorkflowForbiddenError,
  WorkflowNotFoundError
} from "@/lib/agents/graphs/content-workflow";
import { contentWorkflowApprovalActionSchema } from "@/lib/agents/graphs/state";
import { contentPackSchema } from "@/lib/agents/schemas/content-pack";
import { createAgentStorage } from "@/lib/agents/langchain/storage";
import { getCurrentUser } from "@/lib/auth/current-user";
import { resolvePersonalWorkspaceForUser } from "@/lib/workspaces/personal-workspace";

export const runtime = "nodejs";

const approvalRequestSchema = z.object({
  action: contentWorkflowApprovalActionSchema,
  comment: z.string().max(1000).optional(),
  contentPack: contentPackSchema.optional()
});

type ApprovalRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, context: ApprovalRouteContext) {
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
    const { action, comment, contentPack } = approvalRequestSchema.parse(body);
    const { id } = await context.params;
    const workspace = await resolvePersonalWorkspaceForUser(user);
    const storage = createAgentStorage({
      allowMemoryFallback: workspace.isLocalPreview
    });
    const checkpoints = createContentWorkflowCheckpointStore({
      allowMemoryFallback: workspace.isLocalPreview
    });
    const result = await applyContentWorkflowApproval(id, {
      action,
      comment,
      userId: user.id,
      workspaceId: workspace.id,
      contentPack,
      storage,
      checkpoints
    });

    return NextResponse.json({
      run: result.run,
      workflow: result.workflow,
      contentPack: result.contentPack,
      draft: result.draft
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid approval request.",
          issues: error.issues
        },
        { status: 400 }
      );
    }

    if (error instanceof ContentWorkflowExecutionError) {
      return NextResponse.json(
        {
          error: error.message,
          run: error.run,
          workflow: error.workflow
        },
        { status: 500 }
      );
    }

    if (error instanceof WorkflowForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof WorkflowNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error("Unexpected workflow approval error", error);
    return NextResponse.json({ error: "Unable to update workflow approval." }, { status: 500 });
  }
}
