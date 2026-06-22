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
    const usageRecorder = vi.fn(async () => {});

    const result = await runCommentReplyWorkflow(createInput(), {
      userId,
      workspaceId,
      storage,
      repository,
      provider: mockProvider,
      usageEnforcer,
      usageRecorder,
      now: () => new Date("2026-06-20T12:00:00.000Z")
    });

    expect(result.status).toBe("sent");
    expect(result.reply.action).toBe("auto_reply");
    expect(result.reply.triageLabel).toBe("safe_rule_match");
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
    expect(usageRecorder).toHaveBeenCalledWith(
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
    expect(result.reply.triageLabel).toBe("needs_human_review");
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

  it("keeps non-keyword suggestions queued even when autonomous mode clears confidence threshold", async () => {
    const storage = createMemoryAgentStorage();
    const repository = createMemoryReplyRepositoryForTests();
    const provider = {
      ...mockProvider,
      replyToComment: vi.fn(mockProvider.replyToComment)
    };
    const usageEnforcer = vi.fn(async () => ({ allowed: true }));
    const usageRecorder = vi.fn(async () => {});

    const result = await runCommentReplyWorkflow(
      createInput({
        comment: {
          id: "comment_3",
          provider: "mock",
          providerCommentId: "provider_comment_3",
          platform: "facebook",
          authorName: "Anika Cruz",
          text: "Demo please, I want to show my team.",
          receivedAt: "2026-06-20T12:02:00.000Z"
        },
        rules: []
      }),
      {
        userId,
        workspaceId,
        storage,
        repository,
        provider,
        usageEnforcer,
        usageRecorder,
        autonomous: {
          enabled: true,
          confidenceThreshold: 0.8
        },
        model: createCommentModel({
          env: {
            AI_PROVIDER: "gemini",
            OPENAI_API_KEY: undefined,
            GEMINI_API_KEY: undefined
          },
          model: "mock-gemini",
          draftReply: async () => ({
            replyDraft: "Thanks, Anika. A demo walkthrough is the best next step for your team.",
            confidence: 0.91,
            auditNotes: ["Mock suggestion can be sent autonomously."]
          })
        }),
        now: () => new Date("2026-06-20T12:02:00.000Z")
      }
    );

    expect(result.status).toBe("awaiting_approval");
    expect(result.reply.action).toBe("approval_required");
    expect(result.reply.triageLabel).toBe("needs_human_review");
    expect(result.approval?.status).toBe("pending");
    expect(result.providerReply).toBeNull();
    expect(provider.replyToComment).not.toHaveBeenCalled();
    expect(usageEnforcer).not.toHaveBeenCalled();
    expect(usageRecorder).not.toHaveBeenCalled();
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
    expect(result.reply.triageLabel).toBe("safe_rule_match");
    expect(result.approval?.status).toBe("pending");
    expect(provider.replyToComment).not.toHaveBeenCalled();
    await expect(repository.getConsoleState(workspaceId)).resolves.toMatchObject({
      approvals: [expect.objectContaining({ commentId: "comment_1", status: "pending" })]
    });
  });

  it("queues crisis, legal, refund, and brand-risk comments for human escalation", async () => {
    const storage = createMemoryAgentStorage();
    const repository = createMemoryReplyRepositoryForTests();
    const provider = {
      ...mockProvider,
      replyToComment: vi.fn(mockProvider.replyToComment)
    };

    const result = await runCommentReplyWorkflow(
      createInput({
        comment: {
          id: "comment_crisis",
          provider: "mock",
          providerCommentId: "provider_comment_crisis",
          platform: "linkedin",
          authorName: "Rina Patel",
          text: "These unauthorized charges are scams and my lawyers are threatening regulators unless I get refunds.",
          receivedAt: "2026-06-20T12:03:00.000Z"
        }
      }),
      {
        userId,
        workspaceId,
        storage,
        repository,
        provider,
        now: () => new Date("2026-06-20T12:03:00.000Z")
      }
    );

    expect(result.status).toBe("awaiting_approval");
    expect(result.reply.action).toBe("approval_required");
    expect(result.reply.triageLabel).toBe("crisis_escalation");
    expect(result.reply.safety.status).toBe("blocked");
    expect(result.approval).toMatchObject({
      status: "pending",
      commentId: "comment_crisis",
      triageLabel: "crisis_escalation"
    });
    expect(result.attempt.status).toBe("awaiting_approval");
    expect(result.attempt.audit.action).toBe("crisis_escalation");
    expect(provider.replyToComment).not.toHaveBeenCalled();
    await expect(repository.getConsoleState(workspaceId)).resolves.toMatchObject({
      approvals: [
        expect.objectContaining({
          commentId: "comment_crisis",
          triageLabel: "crisis_escalation"
        })
      ]
    });
  });

  it("labels duplicate or rate-limited rule matches", async () => {
    const storage = createMemoryAgentStorage();
    const repository = createMemoryReplyRepositoryForTests();
    const provider = {
      ...mockProvider,
      replyToComment: vi.fn(mockProvider.replyToComment)
    };

    const result = await runCommentReplyWorkflow(
      createInput({
        rules: [
          {
            ...pricingRule,
            rateLimit: {
              maxReplies: 1,
              windowMinutes: 60
            }
          }
        ],
        recentAttempts: [
          {
            ruleId: "rule_pricing",
            attemptedAt: "2026-06-20T11:30:00.000Z",
            status: "sent"
          }
        ]
      }),
      {
        userId,
        workspaceId,
        storage,
        repository,
        provider,
        now: () => new Date("2026-06-20T12:00:00.000Z")
      }
    );

    expect(result.status).toBe("ignored");
    expect(result.reply.triageLabel).toBe("duplicate_or_rate_limited");
    expect(result.attempt.audit.action).toBe("rate_limited");
    expect(provider.replyToComment).not.toHaveBeenCalled();
  });
});
