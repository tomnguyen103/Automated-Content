import { NextResponse } from "next/server";
import { runCommentReplyWorkflow } from "@/lib/agents/graphs/comment-reply-workflow";
import { resolveReplyServerContext } from "@/lib/replies/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const context = await resolveReplyServerContext(request);

  if (!context) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  try {
    const state = await context.repository.getConsoleState(context.workspace.id);
    const rules = state.rules;
    const recentAttempts = await context.repository.listRecentAttempts(context.workspace.id);
    const processedComments: string[] = [];
    const failedComments: Array<{ id: string; error: string }> = [];

    for (const comment of state.inbox.filter((candidate) => candidate.status === "new")) {
      try {
        const result = await runCommentReplyWorkflow(
          {
            workspaceId: context.workspace.id,
            comment: {
              id: comment.id,
              provider: comment.provider,
              providerCommentId: comment.providerCommentId,
              providerPostId: comment.providerPostId,
              connectedAccountId: comment.connectedAccountId,
              platform: comment.platform,
              authorName: comment.authorName,
              authorProviderId: comment.authorProviderId,
              text: comment.text,
              receivedAt: comment.receivedAt
            },
            postContext: {
              postId: comment.providerPostId,
              title: comment.postTitle,
              body: comment.postBody
            },
            brandVoice: "helpful, concise, and safe",
            rules,
            recentAttempts
          },
          {
            userId: context.user.id,
            workspaceId: context.workspace.id,
            storage: context.storage,
            repository: context.repository,
            usageEnforcer: context.usageEnforcer,
            usageRecorder: context.usageRecorder,
            provider: context.getProvider(comment.provider)
          }
        );

        processedComments.push(comment.id);

        if (result.attempt.ruleId) {
          recentAttempts.push({
            ruleId: result.attempt.ruleId,
            attemptedAt: result.attempt.sentAt ?? result.attempt.createdAt,
            status: result.attempt.status
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown reply workflow error";
        failedComments.push({ id: comment.id, error: message });
        console.error("Reply workflow failed for comment", {
          workspaceId: context.workspace.id,
          commentId: comment.id,
          error
        });
      }
    }

    return NextResponse.json({
      ...(await context.repository.getConsoleState(context.workspace.id)),
      processedComments,
      failedComments
    });
  } catch (error) {
    console.error("Unexpected reply workflow run error", error);
    return NextResponse.json({ error: "Unable to run reply workflow." }, { status: 500 });
  }
}
