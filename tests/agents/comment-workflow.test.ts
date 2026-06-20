import { describe, expect, it, vi } from "vitest";
import { runCommentReplyWorkflow } from "@/lib/agents/graphs/comment-reply-workflow";
import { createCommentModel } from "@/lib/agents/langchain/comment-agent";
import { createMemoryAgentStorage } from "@/lib/agents/langchain/storage";
import { mockProvider } from "@/lib/providers/mock";
import { createMemoryReplyRepositoryForTests } from "@/lib/replies/repository";
import type { AutoReplyRule } from "@/lib/replies/rules";

const workspaceId = "00000000-0000-0000-0000-000000000001";
const userId = "user_1";

const pricingRule: AutoReplyRule = {
  id: "rule_pricing",
  name: "Pricing",
  platformScope: "all",
  matchType: "contains",
  keywords: ["pricing"],
  template: "Thanks {firstName}. Premium includes keyword replies.",
  rateLimit: {
    maxReplies: 5,
    windowMinutes: 60
  },
  enabled: true
};

function createInput(overrides: Partial<Parameters<typeof runCommentReplyWorkflow>[0]> = {}) {
  return {
    workspaceId,
    comment: {
      id: "comment_1",
      provider: "mock" as const,
      providerCommentId: "provider_comment_1",
      platform: "linkedin" as const,
      authorName: "Rina Patel",
      text: "Can you send pricing?",
      receivedAt: "2026-06-20T12:00:00.000Z"
    },
    postContext: {
      postId: "post_1",
      title: "Launch planning checklist"
    },
    brandVoice: "direct and helpful",
    rules: [pricingRule],
    recentAttempts: [],
    ...overrides
  };
}

describe("comment reply workflow", () => {
  it("sends approved keyword template replies through the mock provider", async () => {
    const storage = createMemoryAgentStorage();
    const repository = createMemoryReplyRepositoryForTests();
    const usageEnforcer = vi.fn(async () => ({ allowed: true }));

    const result = await runCommentReplyWorkflow(createInput(), {
      userId,
      workspaceId,
      storage,
      repository,
      provider: mockProvider,
      usageEnforcer,
      now: () => new Date("2026-06-20T12:00:00.000Z")
    });

    expect(result.status).toBe("sent");
    expect(result.reply.action).toBe("auto_reply");
    expect(result.reply.approvalRequired).toBe(false);
    expect(result.providerReply?.providerReplyId).toContain("mock_reply_");
    expect(result.approval).toBeNull();
    expect(result.attempt.status).toBe("sent");
    expect(result.run.status).toBe("succeeded");
    expect(result.run.toolCalls.map((call) => call.name)).toEqual(["match_reply_rules", "check_reply_safety"]);
    expect(usageEnforcer).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        commentId: "comment_1",
        ruleId: "rule_pricing"
      })
    );
    await expect(repository.getConsoleState(workspaceId)).resolves.toMatchObject({
      logs: [expect.objectContaining({ status: "sent" })]
    });
  });

  it("queues non-keyword suggestions for approval without calling the provider", async () => {
    const storage = createMemoryAgentStorage();
    const repository = createMemoryReplyRepositoryForTests();
    const provider = {
      ...mockProvider,
      replyToComment: vi.fn(mockProvider.replyToComment)
    };

    const result = await runCommentReplyWorkflow(
      createInput({
        comment: {
          id: "comment_2",
          provider: "mock",
          providerCommentId: "provider_comment_2",
          platform: "instagram",
          authorName: "Marco Lee",
          text: "Can this keep our brand voice intact?",
          receivedAt: "2026-06-20T12:01:00.000Z"
        },
        rules: []
      }),
      {
        userId,
        workspaceId,
        storage,
        repository,
        provider,
        model: createCommentModel({
          env: {
            AI_PROVIDER: "gemini",
            OPENAI_API_KEY: undefined,
            GEMINI_API_KEY: undefined
          },
          model: "mock-gemini",
          draftReply: async () => ({
            replyDraft: "Thanks, Marco. We can review this with your brand voice before sending.",
            confidence: 0.76,
            auditNotes: ["Mock suggestion requires approval."]
          })
        }),
        now: () => new Date("2026-06-20T12:01:00.000Z")
      }
    );

    expect(result.status).toBe("awaiting_approval");
    expect(result.reply.action).toBe("approval_required");
    expect(result.providerReply).toBeNull();
    expect(result.approval).toMatchObject({
      status: "pending",
      commentId: "comment_2",
      suggestedReply: "Thanks, Marco. We can review this with your brand voice before sending."
    });
    expect(provider.replyToComment).not.toHaveBeenCalled();
    expect(result.run.toolCalls.map((call) => call.name)).toEqual([
      "match_reply_rules",
      "draft_reply_suggestion",
      "check_reply_safety"
    ]);
    await expect(repository.getConsoleState(workspaceId)).resolves.toMatchObject({
      approvals: [expect.objectContaining({ commentId: "comment_2", status: "pending" })]
    });
  });

  it("holds keyword replies for approval when usage enforcement denies send", async () => {
    const storage = createMemoryAgentStorage();
    const repository = createMemoryReplyRepositoryForTests();
    const provider = {
      ...mockProvider,
      replyToComment: vi.fn(mockProvider.replyToComment)
    };

    const result = await runCommentReplyWorkflow(createInput(), {
      userId,
      workspaceId,
      storage,
      repository,
      provider,
      usageEnforcer: async () => ({
        allowed: false,
        reason: "Auto reply limit reached."
      }),
      now: () => new Date("2026-06-20T12:00:00.000Z")
    });

    expect(result.status).toBe("awaiting_approval");
    expect(result.approval?.status).toBe("pending");
    expect(provider.replyToComment).not.toHaveBeenCalled();
    await expect(repository.getConsoleState(workspaceId)).resolves.toMatchObject({
      approvals: [expect.objectContaining({ commentId: "comment_1", status: "pending" })]
    });
  });
});
