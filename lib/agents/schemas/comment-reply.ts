import { z } from "zod";
import { providerKeys } from "@/lib/providers/types";
import { autoReplyRuleSchema, replyPlatformSchema } from "@/lib/replies/rules";
import { recentReplyAttemptSchema } from "@/lib/replies/matcher";

const providerKeySchema = z.enum(providerKeys);

export const commentReplyCommentSchema = z.object({
  id: z.string().min(1),
  providerCommentId: z.string().min(1).optional(),
  providerPostId: z.string().min(1).optional(),
  provider: providerKeySchema,
  connectedAccountId: z.string().min(1).optional(),
  platform: replyPlatformSchema,
  authorName: z.string().min(1).optional(),
  authorProviderId: z.string().min(1).optional(),
  text: z.string().trim().min(1).max(5000),
  receivedAt: z.string().min(1).optional()
});

export const commentReplyInputSchema = z.object({
  workspaceId: z.string().min(1),
  comment: commentReplyCommentSchema,
  postContext: z.object({
    postId: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    body: z.string().min(1).optional()
  }).default({}),
  brandVoice: z.string().trim().min(1).max(200).default("helpful, concise, and safe"),
  rules: z.array(autoReplyRuleSchema).default([]),
  recentAttempts: z.array(recentReplyAttemptSchema).default([])
});

export const commentReplySafetySchema = z.object({
  status: z.enum(["safe", "needs_review", "blocked"]),
  warnings: z.array(z.string().min(1))
});

export const commentReplyTriageLabelSchema = z.enum([
  "safe_rule_match",
  "needs_human_review",
  "blocked_policy",
  "crisis_escalation",
  "duplicate_or_rate_limited"
]);

export const commentReplyOutputSchema = z.object({
  action: z.enum(["auto_reply", "approval_required", "ignore"]),
  replyDraft: z.string().min(1).max(500).nullable(),
  confidence: z.number().min(0).max(1),
  approvalRequired: z.boolean(),
  matchedRuleId: z.string().min(1).optional(),
  matchedKeyword: z.string().min(1).optional(),
  triageLabel: commentReplyTriageLabelSchema,
  triageReason: z.string().min(1).max(500),
  auditNotes: z.array(z.string().min(1)),
  safety: commentReplySafetySchema
});

export type CommentReplyComment = z.infer<typeof commentReplyCommentSchema>;
export type CommentReplyInput = z.infer<typeof commentReplyInputSchema>;
export type CommentReplySafety = z.infer<typeof commentReplySafetySchema>;
export type CommentReplyTriageLabel = z.infer<typeof commentReplyTriageLabelSchema>;
export type CommentReplyOutput = z.infer<typeof commentReplyOutputSchema>;
