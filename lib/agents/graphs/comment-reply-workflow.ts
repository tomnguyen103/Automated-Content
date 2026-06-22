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
import {
  enforceAutoReplyUsage,
  recordAutoReplyUsage,
  type AutoReplyUsageEnforcer,
  type AutoReplyUsageRecorder
} from "@/lib/replies/usage";

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
  triageLabel: CommentReplyOutput["triageLabel"];
  triageReason: string;
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
  usageRecorder?: AutoReplyUsageRecorder;
  autonomous?: {
    enabled?: boolean;
    confidenceThreshold?: number;
  };
};

function createAttemptId() {
  return `reply_attempt_${crypto.randomUUID()}`;
}

function getProviderCommentId(input: CommentReplyInput) {
  return input.comment.providerCommentId ?? input.comment.id;
}

function canSendApprovalDraftAutonomously(reply: CommentReplyOutput, options: RunCommentReplyWorkflowOptions) {
  if (!options.autonomous?.enabled || !reply.replyDraft || reply.safety.status === "blocked") {
    return false;
  }

  if (!reply.matchedRuleId || reply.triageLabel !== "safe_rule_match") {
    return false;
  }

  return reply.confidence >= (options.autonomous.confidenceThreshold ?? 0.7);
}

function triageAuditNotes(reply: CommentReplyOutput) {
  return [`Triage: ${reply.triageLabel}. ${reply.triageReason}`];
}

function ignoredAuditAction(reply: CommentReplyOutput) {
  if (reply.triageLabel === "crisis_escalation") {
    return "crisis_escalation" as const;
  }

  if (reply.triageLabel === "blocked_policy") {
    return "blocked_policy" as const;
  }

  if (reply.triageLabel === "duplicate_or_rate_limited") {
    return "rate_limited" as const;
  }

  return "ignored" as const;
}

function approvalAuditAction(reply: CommentReplyOutput) {
  if (reply.triageLabel === "crisis_escalation") {
    return "crisis_escalation" as const;
  }

  return "approval_required" as const;
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
    sentAt: status === "sent" ? now.toISOString() : undefined,
    triageLabel: reply.triageLabel,
    triageReason: reply.triageReason
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
  const usageRecorder = options.usageRecorder ?? recordAutoReplyUsage;
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

  async function sendReplyDraft({ auditNotes = [] }: { auditNotes?: string[] } = {}) {
    const replyDraft = reply.replyDraft;

    if (!replyDraft) {
      throw new Error("Reply draft is required before sending.");
    }

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
        notes: [...triageAuditNotes(reply), ...auditNotes, message],
        platform: input.comment.platform,
        replyText: replyDraft,
        triageLabel: reply.triageLabel,
        triageReason: reply.triageReason,
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
        notes: [...triageAuditNotes(reply), ...auditNotes, usageReason],
        platform: input.comment.platform,
        replyText: replyDraft,
        triageLabel: reply.triageLabel,
        triageReason: reply.triageReason,
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
        suggestedReply: replyDraft,
        confidence: reply.confidence,
        triageLabel: reply.triageLabel,
        triageReason: reply.triageReason,
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
        message: replyDraft
      });
      let usageRecordError: string | null = null;

      try {
        await usageRecorder({
          workspaceId: options.workspaceId,
          commentId: input.comment.id,
          ruleId: reply.matchedRuleId,
          now: providerReply.sentAt
        });
      } catch (error) {
        usageRecordError = error instanceof Error ? error.message : "Unknown auto reply usage recording error";
        console.error("Auto reply usage recording failed after provider send", {
          workspaceId: options.workspaceId,
          commentId: input.comment.id,
          error
        });
      }

      const audit = createReplyAuditEntry({
        action: "sent",
        commentId: input.comment.id,
        match: matchedRule,
        notes: [
          ...triageAuditNotes(reply),
          ...auditNotes,
          ...(usageRecordError ? [`Usage recording failed after provider send: ${usageRecordError}`] : [])
        ],
        platform: input.comment.platform,
        providerReplyId: providerReply.providerReplyId,
        replyText: replyDraft,
        triageLabel: reply.triageLabel,
        triageReason: reply.triageReason,
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
        notes: [...triageAuditNotes(reply), ...auditNotes, message],
        platform: input.comment.platform,
        replyText: replyDraft,
        triageLabel: reply.triageLabel,
        triageReason: reply.triageReason,
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

  if (reply.action === "auto_reply" && reply.replyDraft) {
    return sendReplyDraft();
  }

  if (reply.action === "approval_required" && canSendApprovalDraftAutonomously(reply, options)) {
    return sendReplyDraft({
      auditNotes: [
        `Autonomous reply approved at confidence ${reply.confidence.toFixed(2)} with threshold ${(options.autonomous?.confidenceThreshold ?? 0.7).toFixed(2)}.`
      ]
    });
  }

  if (reply.action === "approval_required" && reply.replyDraft) {
    const audit = createReplyAuditEntry({
      action: approvalAuditAction(reply),
      commentId: input.comment.id,
      match: matchedRule,
      notes: [...triageAuditNotes(reply), ...reply.auditNotes],
      platform: input.comment.platform,
      replyText: reply.replyDraft,
      triageLabel: reply.triageLabel,
      triageReason: reply.triageReason,
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
      triageLabel: reply.triageLabel,
      triageReason: reply.triageReason,
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
    action: ignoredAuditAction(reply),
    commentId: input.comment.id,
    match: matchedRule,
    notes: [...triageAuditNotes(reply), ...reply.auditNotes],
    platform: input.comment.platform,
    triageLabel: reply.triageLabel,
    triageReason: reply.triageReason,
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
