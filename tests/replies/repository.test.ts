import { describe, expect, it } from "vitest";
import { createReplyApprovalItem } from "@/lib/replies/approval";
import { createReplyAuditEntry } from "@/lib/replies/audit";
import { createMemoryReplyRepositoryForTests } from "@/lib/replies/repository";

const workspaceId = "00000000-0000-0000-0000-000000000001";

describe("reply repository", () => {
  it("persists approval queue attempts and approval decisions", async () => {
    const repository = createMemoryReplyRepositoryForTests();
    const audit = createReplyAuditEntry({
      action: "approval_required",
      commentId: "comment_approval",
      notes: ["Suggestion requires approval."],
      platform: "linkedin",
      replyText: "Thanks, Rina. A teammate will follow up.",
      now: new Date("2026-06-20T12:00:00.000Z")
    });
    const approval = createReplyApprovalItem({
      id: "reply_attempt_approval",
      workspaceId,
      commentId: "comment_approval",
      provider: "mock",
      platform: "linkedin",
      authorName: "Rina Patel",
      commentText: "Can you help?",
      suggestedReply: "Thanks, Rina. A teammate will follow up.",
      confidence: 0.72,
      auditNotes: audit.notes,
      now: new Date("2026-06-20T12:00:00.000Z")
    });

    await repository.persistWorkflowResult({
      input: {
        workspaceId,
        comment: {
          id: "comment_approval",
          provider: "mock",
          platform: "linkedin",
          authorName: "Rina Patel",
          text: "Can you help?",
          receivedAt: "2026-06-20T12:00:00.000Z"
        },
        postContext: {
          title: "Launch planning checklist"
        },
        brandVoice: "helpful",
        rules: [],
        recentAttempts: []
      },
      userId: "user_1",
      run: {
        id: "run_comment_approval",
        traceId: "trace_comment_approval",
        status: "succeeded",
        provider: "openai",
        model: "gpt-4.1-mini",
        userId: "user_1",
        workspaceId,
        input: {
          workspaceId,
          comment: {
            id: "comment_approval",
            provider: "mock",
            platform: "linkedin",
            text: "Can you help?"
          },
          postContext: {},
          brandVoice: "helpful",
          rules: [],
          recentAttempts: []
        },
        output: {
          action: "approval_required",
          replyDraft: approval.suggestedReply,
          confidence: approval.confidence,
          approvalRequired: true,
          auditNotes: audit.notes,
          safety: {
            status: "needs_review",
            warnings: ["Non-keyword suggestions require approval before sending."]
          }
        },
        toolCalls: [],
        startedAt: "2026-06-20T12:00:00.000Z",
        completedAt: "2026-06-20T12:00:01.000Z"
      },
      reply: {
        action: "approval_required",
        replyDraft: approval.suggestedReply,
        confidence: approval.confidence,
        approvalRequired: true,
        auditNotes: audit.notes,
        safety: {
          status: "needs_review",
          warnings: ["Non-keyword suggestions require approval before sending."]
        }
      },
      providerReply: null,
      approval,
      attempt: {
        id: "reply_attempt_approval",
        commentId: "comment_approval",
        status: "awaiting_approval",
        replyText: approval.suggestedReply,
        audit,
        createdAt: "2026-06-20T12:00:00.000Z"
      },
      status: "awaiting_approval",
      now: new Date("2026-06-20T12:00:00.000Z")
    });

    await expect(repository.getConsoleState(workspaceId)).resolves.toMatchObject({
      approvals: [expect.objectContaining({ id: "reply_attempt_approval", status: "pending" })],
      logs: [expect.objectContaining({ id: "reply_attempt_approval", status: "awaiting_approval" })]
    });

    const claimed = await repository.claimPendingApproval({
      workspaceId,
      attemptId: "reply_attempt_approval",
      userId: "user_1",
      replyText: "Thanks, Rina. A teammate will follow up.",
      now: new Date("2026-06-20T12:01:00.000Z")
    });
    const duplicateClaim = await repository.claimPendingApproval({
      workspaceId,
      attemptId: "reply_attempt_approval",
      userId: "user_1",
      replyText: "Thanks again.",
      now: new Date("2026-06-20T12:01:01.000Z")
    });

    expect(claimed?.attempt.status).toBe("approved");
    expect(duplicateClaim).toBeNull();

    await repository.approvePendingAttempt({
      workspaceId,
      attemptId: "reply_attempt_approval",
      userId: "user_1",
      replyText: "Thanks, Rina. A teammate will follow up.",
      providerReply: {
        provider: "mock",
        providerReplyId: "mock_reply_1",
        status: "sent",
        sentAt: new Date("2026-06-20T12:02:00.000Z")
      },
      now: new Date("2026-06-20T12:02:00.000Z")
    });

    await expect(repository.getConsoleState(workspaceId)).resolves.toMatchObject({
      approvals: [],
      logs: [expect.objectContaining({ id: "reply_attempt_approval", status: "sent" })]
    });
  });
});
