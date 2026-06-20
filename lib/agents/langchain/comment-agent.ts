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
          postTitle: input.comment.providerPostId
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

function createDraftReplyTool(model: CommentModel, traceId: string) {
  return {
    name: "draft_reply_suggestion",
    description: "Draft a safe reply suggestion when keyword automation does not apply.",
    inputSchema: draftReplyInputSchema,
    outputSchema: draftReplyOutputSchema,
    execute(input) {
      return model.draftReply(input, { traceId });
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

  try {
    const keywordMatch = await recorder.execute(createKeywordMatchTool(now, evaluationRef), {
      comment: input.comment,
      rules: input.rules,
      recentAttempts: input.recentAttempts
    });
    const selected = evaluationRef.current?.selected ?? null;
    const blocked = evaluationRef.current?.blocked ?? [];
    let reply: CommentReplyOutput;

    if (selected && keywordMatch.selected) {
      const safety = await recorder.execute(createSafetyCheckTool(), {
        replyText: selected.replyText,
        source: "template"
      });

      reply = commentReplyOutputSchema.parse({
        action: safety.status === "safe" ? "auto_reply" : "approval_required",
        replyDraft: selected.replyText,
        confidence: 0.94,
        approvalRequired: safety.status !== "safe",
        matchedRuleId: selected.rule.id,
        matchedKeyword: selected.keyword,
        auditNotes: [
          ...selected.auditNotes,
          safety.status === "safe"
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
        auditNotes: blockedMatch.auditNotes,
        safety: {
          status: "blocked",
          warnings: ["Matched rule is rate limited."]
        }
      });
    } else {
      const draft = await recorder.execute(createDraftReplyTool(model, traceId), input);
      const safety = await recorder.execute(createSafetyCheckTool(), {
        replyText: draft.replyDraft,
        source: "suggestion"
      });

      reply = commentReplyOutputSchema.parse({
        action: "approval_required",
        replyDraft: draft.replyDraft,
        confidence: draft.confidence,
        approvalRequired: true,
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

    throw new CommentAgentExecutionError(failedRun.error ?? "Comment agent failed", failedRun);
  }
}
