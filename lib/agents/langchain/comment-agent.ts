import { z } from "zod";
import { agentRunSchema, type AgentRun } from "@/lib/agents/schemas/agent-run";
import { createCommentModel, type CommentModel } from "@/lib/agents/langchain/model-factory";
import {
  commentReplyCommentSchema,
  commentReplyInputSchema,
  commentReplyOutputSchema,
  type CommentReplyInput,
  type CommentReplyOutput
} from "@/lib/agents/schemas/comment-reply";
import { AgentRunRecorder, createTraceId } from "@/lib/agents/langchain/middleware";
import { createAgentStorage, type AgentStorage } from "@/lib/agents/langchain/storage";
import type { AgentTool } from "@/lib/agents/tools/types";
import { createAgentTraceMetadata, recordAgentEvent } from "@/lib/observability/agent-events";
import { autoReplyRuleSchema } from "@/lib/replies/rules";
import {
  evaluateReplyRules,
  recentReplyAttemptSchema,
  type ReplyRuleEvaluation
} from "@/lib/replies/matcher";

export { createCommentModel };

export type RunCommentAgentOptions = {
  userId: string;
  workspaceId: string;
  model?: CommentModel;
  storage?: AgentStorage;
  now?: () => Date;
};

export type CommentAgentResult = {
  run: AgentRun;
  reply: CommentReplyOutput;
  evaluation: ReplyRuleEvaluation;
};

export class CommentAgentExecutionError extends Error {
  constructor(
    message: string,
    readonly run: AgentRun
  ) {
    super(message);
    this.name = "CommentAgentExecutionError";
  }
}

const keywordMatchInputSchema = z.object({
  comment: commentReplyCommentSchema,
  postTitle: z.string().min(1).optional(),
  rules: z.array(autoReplyRuleSchema),
  recentAttempts: z.array(recentReplyAttemptSchema)
});

const keywordMatchOutputSchema = z.object({
  selected: z
    .object({
      ruleId: z.string().min(1),
      ruleName: z.string().min(1),
      keyword: z.string().min(1),
      replyText: z.string().min(1),
      auditNotes: z.array(z.string().min(1)),
      rateLimit: z.object({
        allowed: z.boolean(),
        limit: z.number().int().positive(),
        used: z.number().int().min(0),
        resetAt: z.string().min(1),
        windowMinutes: z.number().int().positive()
      })
    })
    .nullable(),
  matchCount: z.number().int().min(0),
  blockedCount: z.number().int().min(0)
});

const draftReplyInputSchema = commentReplyInputSchema;

const draftReplyOutputSchema = z.object({
  replyDraft: z.string().min(1).max(500),
  confidence: z.number().min(0).max(1),
  auditNotes: z.array(z.string().min(1))
});

const safetyCheckInputSchema = z.object({
  replyText: z.string().min(1).max(500),
  source: z.enum(["template", "suggestion"])
});

const safetyCheckOutputSchema = z.object({
  status: z.enum(["safe", "needs_review", "blocked"]),
  warnings: z.array(z.string().min(1))
});

function summarizeEvaluation(evaluation: ReplyRuleEvaluation): z.infer<typeof keywordMatchOutputSchema> {
  const selected = evaluation.selected
    ? {
        ruleId: evaluation.selected.rule.id,
        ruleName: evaluation.selected.rule.name,
        keyword: evaluation.selected.keyword,
        replyText: evaluation.selected.replyText,
        auditNotes: evaluation.selected.auditNotes,
        rateLimit: evaluation.selected.rateLimit
      }
    : null;

  return {
    selected,
    matchCount: evaluation.matches.length,
    blockedCount: evaluation.blocked.length
  };
}

function createKeywordMatchTool(now: () => Date, evaluationRef: { current: ReplyRuleEvaluation | null }) {
  return {
    name: "match_reply_rules",
    description: "Match a received comment against enabled keyword auto-reply rules.",
    inputSchema: keywordMatchInputSchema,
    outputSchema: keywordMatchOutputSchema,
    execute(input) {
      const evaluation = evaluateReplyRules({
        comment: {
          id: input.comment.id,
          text: input.comment.text,
          platform: input.comment.platform,
          authorName: input.comment.authorName,
          postTitle: input.postTitle
        },
        now: now(),
        recentAttempts: input.recentAttempts,
        rules: input.rules
      });
      evaluationRef.current = evaluation;

      return summarizeEvaluation(evaluation);
    }
  } satisfies AgentTool<typeof keywordMatchInputSchema, typeof keywordMatchOutputSchema>;
}

function createDraftReplyTool(model: CommentModel, traceId: string, metadata: Record<string, unknown>) {
  return {
    name: "draft_reply_suggestion",
    description: "Draft a safe reply suggestion when keyword automation does not apply.",
    inputSchema: draftReplyInputSchema,
    outputSchema: draftReplyOutputSchema,
    execute(input) {
      return model.draftReply(input, { traceId, metadata });
    }
  } satisfies AgentTool<typeof draftReplyInputSchema, typeof draftReplyOutputSchema>;
}

function createSafetyCheckTool() {
  return {
    name: "check_reply_safety",
    description: "Check reply text for risky automation patterns before sending or queueing.",
    inputSchema: safetyCheckInputSchema,
    outputSchema: safetyCheckOutputSchema,
    execute(input) {
      const warnings: string[] = [];
      const lowered = input.replyText.toLowerCase();

      if (lowered.includes("guarantee") || lowered.includes("100%")) {
        warnings.push("Avoid guaranteed outcomes in automated replies.");
      }

      if (input.source === "suggestion") {
        warnings.push("Non-keyword suggestions require approval before sending.");
      }

      return {
        status: warnings.length > 0 ? "needs_review" : "safe",
        warnings
      };
    }
  } satisfies AgentTool<typeof safetyCheckInputSchema, typeof safetyCheckOutputSchema>;
}

const escalationPatterns = [
  /\b(attorneys?|lawsuits?|legal action|lawyers?|sue|sued|suing|regulators?|regulatory|compliance)\b/i,
  /\b(refunds?|chargebacks?|(?:cancel(?: my)?|cancell?ing(?: my)?) subscription|billing disputes?|unauthorized charges?)\b/i,
  /\b(crisis|emergenc(?:y|ies)|unsafe|harm|self[-\s]?harm|suicid(?:e|al)|threat(?:s|en(?:ed|ing)?)?)\b/i,
  /\b(scams?|fraud(?:ulent)?|boycotts?|press|journalists?|viral complaints?|public complaints?)\b/i
];

function detectEscalationRisk(text: string) {
  return escalationPatterns.some((pattern) => pattern.test(text));
}

function createStartedRun(input: CommentReplyInput, model: CommentModel, options: RunCommentAgentOptions, traceId: string) {
  return agentRunSchema.parse({
    id: `run_${crypto.randomUUID()}`,
    traceId,
    status: "running",
    provider: model.provider,
    model: model.model,
    userId: options.userId,
    workspaceId: options.workspaceId,
    input,
    toolCalls: [],
    startedAt: (options.now ?? (() => new Date()))().toISOString()
  });
}

export async function runCommentAgent(
  rawInput: CommentReplyInput,
  options: RunCommentAgentOptions
): Promise<CommentAgentResult> {
  const input = commentReplyInputSchema.parse({
    ...rawInput,
    workspaceId: options.workspaceId
  });
  const now = options.now ?? (() => new Date());
  const traceId = createTraceId("comment");
  const model = options.model ?? createCommentModel();
  const storage = options.storage ?? createAgentStorage();
  const evaluationRef: { current: ReplyRuleEvaluation | null } = { current: null };
  const recorder = new AgentRunRecorder(traceId, now);
  const startedRun = await storage.saveRun(createStartedRun(input, model, { ...options, now }, traceId));
  const traceMetadata = createAgentTraceMetadata({
    agentType: "comment",
    model: model.model,
    provider: model.provider,
    runId: startedRun.id,
    runtime: model.mode,
    traceId,
    userId: options.userId,
    workflow: "comment_agent",
    workspaceId: options.workspaceId
  });

  recordAgentEvent("comment_agent.started", traceMetadata);

  try {
    const keywordMatch = await recorder.execute(createKeywordMatchTool(now, evaluationRef), {
      comment: input.comment,
      postTitle: input.postContext.title,
      rules: input.rules,
      recentAttempts: input.recentAttempts
    });
    const selected = evaluationRef.current?.selected ?? null;
    const blocked = evaluationRef.current?.blocked ?? [];
    let reply: CommentReplyOutput;

    if (detectEscalationRisk(input.comment.text)) {
      reply = commentReplyOutputSchema.parse({
        action: "approval_required",
        replyDraft: "Thanks for flagging this. A teammate will review and follow up directly.",
        confidence: 0.2,
        approvalRequired: true,
        triageLabel: "crisis_escalation",
        triageReason: "Comment contains crisis, legal, refund, or brand-risk language and needs human escalation.",
        auditNotes: ["Comment escalated to the approval queue; no automated reply was sent."],
        safety: {
          status: "blocked",
          warnings: ["Crisis, legal, refund, and brand-risk comments cannot be handled automatically."]
        }
      });
    } else if (selected && keywordMatch.selected) {
      const safety = await recorder.execute(createSafetyCheckTool(), {
        replyText: selected.replyText,
        source: "template"
      });
      const safeTemplate = safety.status === "safe";

      reply = commentReplyOutputSchema.parse({
        action: safeTemplate ? "auto_reply" : "approval_required",
        replyDraft: selected.replyText,
        confidence: 0.94,
        approvalRequired: !safeTemplate,
        matchedRuleId: selected.rule.id,
        matchedKeyword: selected.keyword,
        triageLabel: safeTemplate ? "safe_rule_match" : "needs_human_review",
        triageReason: safeTemplate
          ? "Enabled keyword rule matched and the template passed safety checks."
          : "Keyword rule matched, but the template needs human review before sending.",
        auditNotes: [
          ...selected.auditNotes,
          safeTemplate
            ? "Approved template reply can be sent automatically."
            : "Template reply needs review because safety warnings were found."
        ],
        safety
      });
    } else if (blocked.length > 0) {
      const blockedMatch = blocked[0];

      reply = commentReplyOutputSchema.parse({
        action: "ignore",
        replyDraft: null,
        confidence: 0,
        approvalRequired: false,
        matchedRuleId: blockedMatch.rule.id,
        matchedKeyword: blockedMatch.keyword,
        triageLabel: "duplicate_or_rate_limited",
        triageReason: "A matching reply rule was blocked by duplicate-send or rate-limit protection.",
        auditNotes: blockedMatch.auditNotes,
        safety: {
          status: "blocked",
          warnings: ["Matched rule is rate limited."]
        }
      });
    } else {
      const draft = await recorder.execute(createDraftReplyTool(model, traceId, traceMetadata), input);
      const safety = await recorder.execute(createSafetyCheckTool(), {
        replyText: draft.replyDraft,
        source: "suggestion"
      });

      reply = commentReplyOutputSchema.parse({
        action: "approval_required",
        replyDraft: draft.replyDraft,
        confidence: draft.confidence,
        approvalRequired: true,
        triageLabel: "needs_human_review",
        triageReason: "No safe keyword automation rule matched, so the generated reply must be approved.",
        auditNotes: [...draft.auditNotes, ...safety.warnings],
        safety
      });
    }

    const completedRun = await storage.saveRun({
      ...startedRun,
      status: "succeeded",
      output: reply,
      toolCalls: recorder.calls,
      completedAt: now().toISOString()
    });

    recordAgentEvent("comment_agent.succeeded", {
      ...traceMetadata,
      toolCallCount: recorder.calls.length
    });

    return {
      run: completedRun,
      reply,
      evaluation: evaluationRef.current ?? {
        selected: null,
        matches: [],
        blocked: []
      }
    };
  } catch (error) {
    const failedRun = await storage.saveRun({
      ...startedRun,
      status: "failed",
      toolCalls: recorder.calls,
      error: error instanceof Error ? error.message : "Unknown comment agent error",
      completedAt: now().toISOString()
    });

    recordAgentEvent("comment_agent.failed", {
      ...traceMetadata,
      error: failedRun.error,
      toolCallCount: recorder.calls.length
    });

    throw new CommentAgentExecutionError(failedRun.error ?? "Comment agent failed", failedRun);
  }
}
