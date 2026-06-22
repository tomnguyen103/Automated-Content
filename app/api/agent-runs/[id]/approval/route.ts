import { NextResponse } from "next/server";
import { z } from "zod";
import { createContentWorkflowCheckpointStore } from "@/lib/agents/graphs/checkpoints";
import {
  applyContentWorkflowApproval,
  ContentWorkflowExecutionError,
  WorkflowForbiddenError,
  WorkflowNotFoundError,
  WorkflowValidationError
} from "@/lib/agents/graphs/content-workflow";
import { contentWorkflowApprovalActionSchema } from "@/lib/agents/graphs/state";
import { contentPackSchema, type ContentPack } from "@/lib/agents/schemas/content-pack";
import { createAgentStorage } from "@/lib/agents/langchain/storage";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  buildBrandMemoryProposalsFromEdit,
  createBrandMemoryProposalRepository
} from "@/lib/brand-memory/proposals";
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

async function createBrandMemoryProposals({
  after,
  agentRunId,
  allowMemoryFallback,
  before,
  preferMemoryFallback,
  userId,
  workspaceId
}: {
  workspaceId: string;
  userId: string;
  agentRunId: string;
  before?: ContentPack | null;
  after?: ContentPack | null;
  allowMemoryFallback: boolean;
  preferMemoryFallback: boolean;
}) {
  if (!before || !after) {
    return [];
  }

  try {
    return await createBrandMemoryProposalRepository({
      allowMemoryFallback,
      preferMemoryFallback
    }).saveMany(
      buildBrandMemoryProposalsFromEdit({
        workspaceId,
        userId,
        agentRunId,
        before,
        after
      })
    );
  } catch (error) {
    console.error("Unable to create brand memory proposals", error);
    throw error;
  }
}

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
    const previousWorkflow = await checkpoints.get(id, workspace.id);
    const result = await applyContentWorkflowApproval(id, {
      action,
      comment,
      userId: user.id,
      workspaceId: workspace.id,
      contentPack,
      storage,
      checkpoints
    });
    const brandMemoryProposals = action === "approve"
        ? await createBrandMemoryProposals({
            workspaceId: workspace.id,
            userId: user.id,
            agentRunId: id,
            before: previousWorkflow?.contentPack,
            after: result.contentPack,
            allowMemoryFallback: workspace.isLocalPreview,
            preferMemoryFallback: workspace.isLocalPreview
          })
        : [];

    return NextResponse.json({
      run: result.run,
      workflow: result.workflow,
      contentPack: result.contentPack,
      draft: result.draft,
      brandMemoryProposals
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

    if (error instanceof WorkflowValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
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
