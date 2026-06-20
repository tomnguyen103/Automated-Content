import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const serverMocks = vi.hoisted(() => ({
  resolveReplyServerContext: vi.fn()
}));

vi.mock("@/lib/replies/server", () => ({
  resolveReplyServerContext: serverMocks.resolveReplyServerContext
}));

async function loadRoute() {
  const { POST } = await import("@/app/api/replies/approvals/[id]/route");

  return { POST };
}

function createRequest() {
  return new Request("http://localhost:3000/api/replies/approvals/reply_attempt_1", {
    method: "POST",
    body: JSON.stringify({
      replyText: "Approved reply"
    })
  });
}

const pendingApproval = {
  approval: {
    id: "reply_attempt_1",
    workspaceId: "workspace_1",
    commentId: "comment_1",
    provider: "mock",
    platform: "linkedin",
    authorName: "Rina Patel",
    commentText: "Can you help?",
    suggestedReply: "Suggested reply",
    confidence: 0.72,
    status: "pending",
    auditNotes: ["Suggestion requires approval."],
    createdAt: "2026-06-20T12:00:00.000Z",
    updatedAt: "2026-06-20T12:00:00.000Z"
  },
  attempt: {
    id: "reply_attempt_1",
    workspaceId: "workspace_1",
    commentId: "comment_1",
    provider: "mock",
    connectedAccountId: "account_1",
    ruleId: "rule_1",
    status: "awaiting_approval",
    replyText: "Suggested reply",
    approvalRequired: true,
    audit: {
      action: "approval_required",
      platform: "linkedin",
      commentId: "comment_1",
      replyPreview: "Suggested reply",
      notes: ["Suggestion requires approval."],
      createdAt: "2026-06-20T12:00:00.000Z"
    },
    createdAt: "2026-06-20T12:00:00.000Z",
    updatedAt: "2026-06-20T12:00:00.000Z"
  },
  comment: {
    id: "comment_1",
    provider: "mock",
    providerCommentId: "provider_comment_1",
    connectedAccountId: "account_1",
    platform: "linkedin",
    authorName: "Rina Patel",
    text: "Can you help?",
    receivedAt: "2026-06-20T12:00:00.000Z",
    status: "awaiting_approval"
  }
};

describe("reply approval API", () => {
  beforeEach(() => {
    vi.resetModules();
    serverMocks.resolveReplyServerContext.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("claims approval before provider send so duplicate requests do not double reply", async () => {
    let claimed = false;
    const provider = {
      replyToComment: vi.fn(async () => ({
        provider: "mock",
        providerReplyId: "provider_reply_1",
        status: "sent",
        sentAt: new Date("2026-06-20T12:02:00.000Z")
      }))
    };
    const repository = {
      getPendingApproval: vi.fn(async () => pendingApproval),
      claimPendingApproval: vi.fn(async () => {
        if (claimed) {
          return null;
        }

        claimed = true;

        return {
          ...pendingApproval,
          attempt: {
            ...pendingApproval.attempt,
            status: "approved",
            replyText: "Approved reply"
          }
        };
      }),
      failClaimedApproval: vi.fn(),
      approvePendingAttempt: vi.fn(async () => true),
      getConsoleState: vi.fn(async () => ({
        rules: [],
        inbox: [],
        approvals: [],
        logs: []
      }))
    };
    const context = {
      user: {
        id: "user_1",
        email: "user@example.com",
        name: "User One",
        imageUrl: null,
        initials: "UO",
        isLocalPreview: false
      },
      workspace: {
        id: "workspace_1",
        role: "owner",
        isLocalPreview: false
      },
      repository,
      storage: {},
      usageEnforcer: vi.fn(async () => ({ allowed: true })),
      usageRecorder: vi.fn(async () => undefined),
      getProvider: vi.fn(() => provider)
    };

    serverMocks.resolveReplyServerContext.mockResolvedValue(context);

    const { POST } = await loadRoute();
    const [first, second] = await Promise.all([
      POST(createRequest(), { params: Promise.resolve({ id: "reply_attempt_1" }) }),
      POST(createRequest(), { params: Promise.resolve({ id: "reply_attempt_1" }) })
    ]);
    const statuses = [first.status, second.status].sort();

    expect(statuses).toEqual([200, 409]);
    expect(provider.replyToComment).toHaveBeenCalledOnce();
    expect(provider.replyToComment).toHaveBeenCalledWith(
      expect.objectContaining({
        commentId: "provider_comment_1",
        message: "Approved reply"
      })
    );
    expect(repository.approvePendingAttempt).toHaveBeenCalledOnce();
  });
});
