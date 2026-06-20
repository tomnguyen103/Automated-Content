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

    const claimed = await context.repository.claimPendingApproval({
      workspaceId: context.workspace.id,
      attemptId: id,
      userId: context.user.id,
      replyText: input.replyText
    });

    if (!claimed) {
      return NextResponse.json(
        { error: "Reply approval was already claimed or resolved. Refresh the console before retrying." },
        { status: 409 }
      );
    }

    const provider = context.getProvider(claimed.attempt.provider);
    let providerReply;

    try {
      providerReply = await provider.replyToComment({
        workspaceId: context.workspace.id,
        connectedAccountId: claimed.attempt.connectedAccountId,
        commentId: claimed.comment.providerCommentId ?? claimed.comment.id,
        message: claimed.attempt.replyText
      });
    } catch (error) {
      await context.repository.failClaimedApproval({
        workspaceId: context.workspace.id,
        attemptId: id,
        error: error instanceof Error ? error.message : "Provider reply failed before confirmation."
      });

      throw error;
    }
    let usageRecordError: string | null = null;

    try {
      await context.usageRecorder({
        workspaceId: context.workspace.id,
        commentId: claimed.comment.id,
        ruleId: claimed.attempt.ruleId,
        now: providerReply.sentAt
      });
    } catch (error) {
      usageRecordError = error instanceof Error ? error.message : "Unknown auto reply usage recording error";
      console.error("Reply approval usage recording failed after provider send", {
        workspaceId: context.workspace.id,
        approvalId: id,
        providerReplyId: providerReply.providerReplyId,
        error
      });
    }

    try {
      const persisted = await context.repository.approvePendingAttempt({
        workspaceId: context.workspace.id,
        attemptId: id,
        userId: context.user.id,
        replyText: input.replyText,
        providerReply
      });

      if (!persisted) {
        console.error("Reply provider send succeeded but pending approval was already resolved", {
          workspaceId: context.workspace.id,
          approvalId: id,
          providerReplyId: providerReply.providerReplyId,
          usageRecordError
        });

        return NextResponse.json(
          { error: "Reply was sent, but the approval was already resolved. Refresh the console before retrying." },
          { status: 409 }
        );
      }
    } catch (error) {
      console.error("Reply provider send succeeded but approval persistence failed", {
        workspaceId: context.workspace.id,
        approvalId: id,
        providerReplyId: providerReply.providerReplyId,
        usageRecordError,
        error
      });

      return NextResponse.json(
        { error: "Reply was sent, but saving the approval state failed. Refresh the console before retrying." },
        { status: 500 }
      );
    }

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
