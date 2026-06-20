import { z } from "zod";
import type { AgentRun } from "@/lib/agents/schemas/agent-run";
import {
  commentReplyInputSchema,
  type CommentReplyInput,
  type CommentReplyOutput
} from "@/lib/agents/schemas/comment-reply";
import {
  runCommentAgent,
  type CommentAgentResult,
  type RunCommentAgentOptions
} from "@/lib/agents/langchain/comment-agent";
import { getProviderAdapter } from "@/lib/providers/registry";
import type { ProviderAdapter, ProviderReplyResult } from "@/lib/providers/types";
import { createReplyApprovalItem, type ReplyApprovalItem } from "@/lib/replies/approval";
import { createReplyAuditEntry, type ReplyAuditEntry } from "@/lib/replies/audit";
import { createReplyRepository, type ReplyRepository } from "@/lib/replies/repository";
import { enforceAutoReplyUsage, type AutoReplyUsageEnforcer } from "@/lib/replies/usage";

export const commentReplyWorkflowStatusSchema = z.enum([
  "sent",
  "awaiting_approval",
  "ignored",
  "failed"
]);

export type CommentReplyWorkflowStatus = z.infer<typeof commentReplyWorkflowStatusSchema>;

export type CommentReplyAttemptSummary = {
  id: string;
  commentId: string;
  ruleId?: string;
  status: "sent" | "awaiting_approval" | "failed" | "skipped";
  replyText: string | null;
  providerReplyId?: string;
  error?: string;
  audit: ReplyAuditEntry;
  createdAt: string;
  sentAt?: string;
};

export type CommentReplyWorkflowResult = {
  status: CommentReplyWorkflowStatus;
  run: AgentRun;
  reply: CommentReplyOutput;
  providerReply: ProviderReplyResult | null;
  approval: ReplyApprovalItem | null;
  attempt: CommentReplyAttemptSummary;
  agent: CommentAgentResult;
};

export type RunCommentReplyWorkflowOptions = Omit<RunCommentAgentOptions, "workspaceId"> & {
  workspaceId: string;
  provider?: ProviderAdapter;
  repository?: ReplyRepository;
  usageEnforcer?: AutoReplyUsageEnforcer;
};

function createAttemptId() {
  return `reply_attempt_${crypto.randomUUID()}`;
}

function getProviderCommentId(input: CommentReplyInput) {
  return input.comment.providerCommentId ?? input.comment.id;
}

function createAttempt({
  audit,
  error,
  input,
  providerReply,
  reply,
  status,
  now
}: {
  audit: ReplyAuditEntry;
  error?: string;
  input: CommentReplyInput;
  providerReply?: ProviderReplyResult | null;
  reply: CommentReplyOutput;
  status: CommentReplyAttemptSummary["status"];
  now: Date;
}): CommentReplyAttemptSummary {
  return {
    id: createAttemptId(),
    commentId: input.comment.id,
    ruleId: reply.matchedRuleId,
    status,
    replyText: reply.replyDraft,
    providerReplyId: providerReply?.providerReplyId,
    error,
    audit,
    createdAt: now.toISOString(),
    sentAt: status === "sent" ? now.toISOString() : undefined
  };
}

export async function runCommentReplyWorkflow(
  rawInput: CommentReplyInput,
  options: RunCommentReplyWorkflowOptions
): Promise<CommentReplyWorkflowResult> {
  const input = commentReplyInputSchema.parse({
    ...rawInput,
    workspaceId: options.workspaceId
  });
  const now = options.now ?? (() => new Date());
  const repository = options.repository ?? createReplyRepository();
  const usageEnforcer = options.usageEnforcer ?? enforceAutoReplyUsage;
  const agent = await runCommentAgent(input, {
    userId: options.userId,
    workspaceId: options.workspaceId,
    model: options.model,
    storage: options.storage,
    now
  });
  const reply = agent.reply;
  const matchedRule = agent.evaluation.selected;

  async function finalize(result: CommentReplyWorkflowResult) {
    await repository.persistWorkflowResult({
      input,
      userId: options.userId,
      run: result.run,
      reply: result.reply,
      providerReply: result.providerReply,
      approval: result.approval,
      attempt: result.attempt,
      status: result.status,
      now: now()
    });

    return result;
  }

  if (reply.action === "auto_reply" && reply.replyDraft) {
    let usageAllowed = false;
    let usageReason = "Auto reply usage is not available.";

    try {
      const usage = await usageEnforcer({
        workspaceId: options.workspaceId,
        commentId: input.comment.id,
        ruleId: reply.matchedRuleId,
        now: now()
      });
      usageAllowed = usage.allowed;
      usageReason = usage.reason ?? usageReason;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown auto reply usage error";
      const audit = createReplyAuditEntry({
        action: "failed",
        commentId: input.comment.id,
        match: matchedRule,
        notes: [message],
        platform: input.comment.platform,
        replyText: reply.replyDraft,
        now: now()
      });
      const attempt = createAttempt({
        audit,
        error: message,
        input,
        reply,
        status: "failed",
        now: now()
      });

      return finalize({
        status: "failed",
        run: agent.run,
        reply,
        providerReply: null,
        approval: null,
        attempt,
        agent
      });
    }

    if (!usageAllowed) {
      const audit = createReplyAuditEntry({
        action: "approval_required",
        commentId: input.comment.id,
        match: matchedRule,
        notes: [usageReason],
        platform: input.comment.platform,
        replyText: reply.replyDraft,
        now: now()
      });
      const attempt = createAttempt({
        audit,
        input,
        reply,
        status: "awaiting_approval",
        now: now()
      });
      const approval = createReplyApprovalItem({
        id: attempt.id,
        workspaceId: options.workspaceId,
        commentId: input.comment.id,
        provider: input.comment.provider,
        platform: input.comment.platform,
        authorName: input.comment.authorName,
        commentText: input.comment.text,
        suggestedReply: reply.replyDraft,
        confidence: reply.confidence,
        auditNotes: audit.notes,
        now: new Date(attempt.createdAt)
      });

      return finalize({
        status: "awaiting_approval",
        run: agent.run,
        reply,
        providerReply: null,
        approval,
        attempt,
        agent
      });
    }

    try {
      const provider = options.provider ?? getProviderAdapter(input.comment.provider);
      const providerReply = await provider.replyToComment({
        workspaceId: options.workspaceId,
        connectedAccountId: input.comment.connectedAccountId,
        commentId: getProviderCommentId(input),
        message: reply.replyDraft
      });

      const audit = createReplyAuditEntry({
        action: "sent",
        commentId: input.comment.id,
        match: matchedRule,
        platform: input.comment.platform,
        providerReplyId: providerReply.providerReplyId,
        replyText: reply.replyDraft,
        now: providerReply.sentAt
      });
      const attempt = createAttempt({
        audit,
        input,
        providerReply,
        reply,
        status: "sent",
        now: providerReply.sentAt
      });

      return finalize({
        status: "sent",
        run: agent.run,
        reply,
        providerReply,
        approval: null,
        attempt,
        agent
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown reply provider error";
      const audit = createReplyAuditEntry({
        action: "failed",
        commentId: input.comment.id,
        match: matchedRule,
        notes: [message],
        platform: input.comment.platform,
        replyText: reply.replyDraft,
        now: now()
      });
      const attempt = createAttempt({
        audit,
        error: message,
        input,
        reply,
        status: "failed",
        now: now()
      });

      return finalize({
        status: "failed",
        run: agent.run,
        reply,
        providerReply: null,
        approval: null,
        attempt,
        agent
      });
    }
  }

  if (reply.action === "approval_required" && reply.replyDraft) {
    const audit = createReplyAuditEntry({
      action: "approval_required",
      commentId: input.comment.id,
      match: matchedRule,
      notes: reply.auditNotes,
      platform: input.comment.platform,
      replyText: reply.replyDraft,
      now: now()
    });
    const attempt = createAttempt({
      audit,
      input,
      reply,
      status: "awaiting_approval",
      now: now()
    });
    const approval = createReplyApprovalItem({
      id: attempt.id,
      workspaceId: options.workspaceId,
      commentId: input.comment.id,
      provider: input.comment.provider,
      platform: input.comment.platform,
      authorName: input.comment.authorName,
      commentText: input.comment.text,
      suggestedReply: reply.replyDraft,
      confidence: reply.confidence,
      auditNotes: audit.notes,
      now: new Date(attempt.createdAt)
    });

    return finalize({
      status: "awaiting_approval",
      run: agent.run,
      reply,
      providerReply: null,
      approval,
      attempt,
      agent
    });
  }

  const audit = createReplyAuditEntry({
    action: reply.safety.status === "blocked" ? "rate_limited" : "ignored",
    commentId: input.comment.id,
    match: matchedRule,
    notes: reply.auditNotes,
    platform: input.comment.platform,
    now: now()
  });
  const attempt = createAttempt({
    audit,
    input,
    reply,
    status: "skipped",
    now: now()
  });

  return finalize({
    status: "ignored",
    run: agent.run,
    reply,
    providerReply: null,
    approval: null,
    attempt,
    agent
  });
}
