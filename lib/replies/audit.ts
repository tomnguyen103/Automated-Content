import { z } from "zod";
import { replyPlatformSchema, type ReplyPlatform } from "@/lib/replies/rules";
import type { ReplyRuleMatch } from "@/lib/replies/matcher";

export const replyAuditActionSchema = z.enum([
  "auto_reply_approved",
  "approval_required",
  "ignored",
  "rate_limited",
  "sent",
  "failed"
]);

export const replyAuditEntrySchema = z.object({
  id: z.string().min(1),
  action: replyAuditActionSchema,
  commentId: z.string().min(1),
  platform: replyPlatformSchema,
  ruleId: z.string().min(1).optional(),
  keyword: z.string().min(1).optional(),
  replyPreview: z.string().min(1).optional(),
  providerReplyId: z.string().min(1).optional(),
  notes: z.array(z.string().min(1)),
  createdAt: z.string().min(1)
});

export type ReplyAuditAction = z.infer<typeof replyAuditActionSchema>;
export type ReplyAuditEntry = z.infer<typeof replyAuditEntrySchema>;

export function createReplyAuditEntry({
  action,
  commentId,
  match,
  notes = [],
  platform,
  providerReplyId,
  replyText,
  now = new Date()
}: {
  action: ReplyAuditAction;
  commentId: string;
  match?: ReplyRuleMatch | null;
  notes?: string[];
  platform: ReplyPlatform;
  providerReplyId?: string;
  replyText?: string;
  now?: Date;
}) {
  return replyAuditEntrySchema.parse({
    id: `reply_audit_${crypto.randomUUID()}`,
    action,
    commentId,
    platform,
    ruleId: match?.rule.id,
    keyword: match?.keyword,
    replyPreview: replyText?.slice(0, 160) ?? match?.replyText.slice(0, 160),
    providerReplyId,
    notes: [...(match?.auditNotes ?? []), ...notes],
    createdAt: now.toISOString()
  });
}
