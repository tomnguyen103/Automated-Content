import { z } from "zod";
import { providerKeys } from "@/lib/providers/types";
import { replyApprovalItemSchema } from "@/lib/replies/approval";
import {
  autoReplyRuleSchema,
  replyMatchTypeSchema,
  replyPlatformSchema,
  replyPlatformScopeSchema
} from "@/lib/replies/rules";

const providerKeySchema = z.enum(providerKeys);

export const inboxCommentStatusSchema = z.enum(["new", "awaiting_approval", "replied", "ignored", "failed"]);

export const inboxCommentSchema = z.object({
  id: z.string().min(1),
  provider: providerKeySchema,
  providerCommentId: z.string().min(1).optional(),
  providerPostId: z.string().min(1).optional(),
  connectedAccountId: z.string().min(1).optional(),
  platform: replyPlatformSchema,
  authorName: z.string().min(1),
  authorProviderId: z.string().min(1).optional(),
  text: z.string().min(1),
  postTitle: z.string().min(1).optional(),
  postBody: z.string().min(1).optional(),
  receivedAt: z.string().min(1),
  status: inboxCommentStatusSchema
});

export const replyLogEntrySchema = z.object({
  id: z.string().min(1),
  timestamp: z.string().min(1),
  status: z.enum(["sent", "awaiting_approval", "skipped", "failed"]),
  platform: z.string().min(1),
  authorName: z.string().min(1),
  commentText: z.string().min(1),
  replyText: z.string().min(1).nullable(),
  ruleName: z.string().min(1).optional(),
  auditNotes: z.array(z.string().min(1))
});

export const autoRepliesConsoleStateSchema = z.object({
  rules: z.array(autoReplyRuleSchema),
  inbox: z.array(inboxCommentSchema),
  approvals: z.array(replyApprovalItemSchema),
  logs: z.array(replyLogEntrySchema)
});

export const createReplyRuleRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
  platformScope: replyPlatformScopeSchema.default("all"),
  matchType: replyMatchTypeSchema.default("contains"),
  keywords: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
  template: z.string().trim().min(1).max(500),
  rateLimit: z.object({
    maxReplies: z.number().int().positive(),
    windowMinutes: z.number().int().positive()
  }),
  enabled: z.boolean().default(true)
});

export const updateReplyRuleRequestSchema = z.object({
  enabled: z.boolean()
});

export const approveReplyRequestSchema = z.object({
  replyText: z.string().trim().min(1).max(500)
});

export type InboxComment = z.infer<typeof inboxCommentSchema>;
export type ReplyLogEntry = z.infer<typeof replyLogEntrySchema>;
export type AutoRepliesConsoleState = z.infer<typeof autoRepliesConsoleStateSchema>;
export type CreateReplyRuleRequest = z.infer<typeof createReplyRuleRequestSchema>;
