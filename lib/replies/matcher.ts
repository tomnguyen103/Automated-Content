import { z } from "zod";
import {
  autoReplyRuleSchema,
  normalizeKeyword,
  normalizeReplyRule,
  replyPlatformSchema,
  ruleAppliesToPlatform,
  type AutoReplyRule,
  type ReplyMatchType
} from "@/lib/replies/rules";
import { renderReplyTemplate, type ReplyTemplateContext } from "@/lib/replies/templates";

export const replyCommentInputSchema = z.object({
  id: z.string().min(1),
  text: z.string().trim().min(1).max(5000),
  platform: replyPlatformSchema,
  authorName: z.string().min(1).optional(),
  postTitle: z.string().min(1).optional(),
  receivedAt: z.string().min(1).optional()
});

export const recentReplyAttemptSchema = z.object({
  ruleId: z.string().min(1),
  attemptedAt: z.union([z.string().min(1), z.date()]),
  status: z.enum(["approved", "awaiting_approval", "sent", "failed", "skipped"]).optional()
});

export type ReplyCommentInput = z.infer<typeof replyCommentInputSchema>;
export type RecentReplyAttempt = z.infer<typeof recentReplyAttemptSchema>;

export type ReplyRateLimitState = {
  allowed: boolean;
  limit: number;
  used: number;
  resetAt: string;
  windowMinutes: number;
};

export type ReplyRuleMatch = {
  rule: AutoReplyRule;
  keyword: string;
  replyText: string;
  rateLimit: ReplyRateLimitState;
  auditNotes: string[];
};

export type ReplyRuleEvaluation = {
  selected: ReplyRuleMatch | null;
  matches: ReplyRuleMatch[];
  blocked: ReplyRuleMatch[];
};

function normalizeText(text: string) {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

function isCountedAttempt(attempt: RecentReplyAttempt) {
  return attempt.status !== "failed" && attempt.status !== "skipped";
}

function toDate(value: string | Date) {
  return value instanceof Date ? value : new Date(value);
}

function keywordMatches(text: string, keyword: string, matchType: ReplyMatchType) {
  const normalizedText = normalizeText(text);
  const normalizedKeyword = normalizeKeyword(keyword);

  if (matchType === "exact") {
    return normalizedText === normalizedKeyword;
  }

  if (matchType === "starts_with") {
    return normalizedText.startsWith(normalizedKeyword);
  }

  if (matchType === "regex") {
    try {
      return new RegExp(keyword, "i").test(text);
    } catch {
      return false;
    }
  }

  return normalizedText.includes(normalizedKeyword);
}

export function getReplyRateLimitState({
  attempts,
  now = new Date(),
  rule
}: {
  attempts: RecentReplyAttempt[];
  now?: Date;
  rule: AutoReplyRule;
}): ReplyRateLimitState {
  const parsedRule = normalizeReplyRule(rule);
  const windowStartMs = now.getTime() - parsedRule.rateLimit.windowMinutes * 60_000;
  const attemptsInWindow = attempts
    .filter((attempt) => attempt.ruleId === parsedRule.id && isCountedAttempt(attempt))
    .map((attempt) => toDate(attempt.attemptedAt))
    .filter((attemptedAt) => Number.isFinite(attemptedAt.getTime()) && attemptedAt.getTime() >= windowStartMs)
    .sort((a, b) => a.getTime() - b.getTime());
  const firstAttempt = attemptsInWindow[0];
  const resetAt = new Date(
    (firstAttempt?.getTime() ?? now.getTime()) + parsedRule.rateLimit.windowMinutes * 60_000
  ).toISOString();

  return {
    allowed: attemptsInWindow.length < parsedRule.rateLimit.maxReplies,
    limit: parsedRule.rateLimit.maxReplies,
    used: attemptsInWindow.length,
    resetAt,
    windowMinutes: parsedRule.rateLimit.windowMinutes
  };
}

export function evaluateReplyRules({
  comment,
  now = new Date(),
  recentAttempts = [],
  rules,
  templateContext
}: {
  comment: ReplyCommentInput;
  now?: Date;
  recentAttempts?: RecentReplyAttempt[];
  rules: AutoReplyRule[];
  templateContext?: Partial<ReplyTemplateContext>;
}): ReplyRuleEvaluation {
  const parsedComment = replyCommentInputSchema.parse(comment);
  const parsedRules = rules.map((rule) => normalizeReplyRule(autoReplyRuleSchema.parse(rule)));
  const parsedAttempts = recentAttempts.map((attempt) => recentReplyAttemptSchema.parse(attempt));
  const matches: ReplyRuleMatch[] = [];
  const blocked: ReplyRuleMatch[] = [];

  for (const rule of parsedRules) {
    if (!rule.enabled || !ruleAppliesToPlatform(rule, parsedComment.platform)) {
      continue;
    }

    const keyword = rule.keywords.find((candidate) => keywordMatches(parsedComment.text, candidate, rule.matchType));

    if (!keyword) {
      continue;
    }

    const rateLimit = getReplyRateLimitState({ attempts: parsedAttempts, now, rule });
    const replyText = renderReplyTemplate(rule.template, {
      authorName: parsedComment.authorName,
      commentText: parsedComment.text,
      keyword,
      platform: parsedComment.platform,
      postTitle: parsedComment.postTitle,
      ...templateContext
    });
    const match = {
      rule,
      keyword,
      replyText,
      rateLimit,
      auditNotes: [
        `Matched ${rule.matchType} keyword "${keyword}".`,
        rateLimit.allowed
          ? `Rule rate limit has ${rateLimit.limit - rateLimit.used} replies remaining.`
          : `Rule rate limit reached until ${rateLimit.resetAt}.`
      ]
    };

    if (rateLimit.allowed) {
      matches.push(match);
    } else {
      blocked.push(match);
    }
  }

  return {
    selected: matches[0] ?? null,
    matches,
    blocked
  };
}
