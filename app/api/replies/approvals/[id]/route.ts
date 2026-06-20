import { NextResponse } from "next/server";
import { z } from "zod";
import { approveReplyRequestSchema } from "@/lib/replies/console";
import { resolveReplyServerContext } from "@/lib/replies/server";

export const runtime = "nodejs";

type ApprovalRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, routeContext: ApprovalRouteContext) {
  const context = await resolveReplyServerContext(request);

  if (!context) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  try {
    const { id } = await routeContext.params;
    const input = approveReplyRequestSchema.parse(body);
    const pending = await context.repository.getPendingApproval(context.workspace.id, id);

    if (!pending) {
      return NextResponse.json({ error: "Reply approval not found." }, { status: 404 });
    }

    const usage = await context.usageEnforcer({
      workspaceId: context.workspace.id,
      commentId: pending.comment.id,
      ruleId: pending.attempt.ruleId,
      now: new Date()
    });

    if (!usage.allowed) {
      return NextResponse.json(
        { error: usage.reason ?? "Auto reply usage is not available for this workspace." },
        { status: 402 }
      );
    }

    const provider = context.getProvider(pending.attempt.provider);
    const providerReply = await provider.replyToComment({
      workspaceId: context.workspace.id,
      connectedAccountId: pending.attempt.connectedAccountId,
      commentId: pending.comment.providerCommentId ?? pending.comment.id,
      message: input.replyText
    });

    await context.repository.approvePendingAttempt({
      workspaceId: context.workspace.id,
      attemptId: id,
      userId: context.user.id,
      replyText: input.replyText,
      providerReply
    });

    return NextResponse.json(await context.repository.getConsoleState(context.workspace.id));
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

    console.error("Unexpected reply approval error", error);
    return NextResponse.json({ error: "Unable to approve reply suggestion." }, { status: 500 });
  }
}
