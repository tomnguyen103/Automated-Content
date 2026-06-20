import { z } from "zod";
import { replyPlatformSchema } from "@/lib/replies/rules";
import { providerKeys } from "@/lib/providers/types";

const providerKeySchema = z.enum(providerKeys);

export const replyApprovalStatusSchema = z.enum(["pending", "approved", "changes_requested"]);

export const replyApprovalItemSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  commentId: z.string().min(1),
  provider: providerKeySchema,
  platform: replyPlatformSchema,
  authorName: z.string().min(1).optional(),
  commentText: z.string().min(1),
  suggestedReply: z.string().min(1).max(500),
  confidence: z.number().min(0).max(1),
  status: replyApprovalStatusSchema,
  auditNotes: z.array(z.string().min(1)),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  approvedAt: z.string().min(1).optional(),
  approvedByUserId: z.string().min(1).optional(),
  changeRequest: z.string().min(1).max(1000).optional()
});

export type ReplyApprovalStatus = z.infer<typeof replyApprovalStatusSchema>;
export type ReplyApprovalItem = z.infer<typeof replyApprovalItemSchema>;

export function createReplyApprovalItem({
  now = new Date(),
  ...input
}: Omit<ReplyApprovalItem, "createdAt" | "id" | "status" | "updatedAt"> & {
  id?: string;
  now?: Date;
}) {
  const timestamp = now.toISOString();

  return replyApprovalItemSchema.parse({
    ...input,
    id: input.id ?? `reply_approval_${crypto.randomUUID()}`,
    status: "pending",
    createdAt: timestamp,
    updatedAt: timestamp
  });
}

export function approveReplySuggestion({
  item,
  now = new Date(),
  replyText,
  userId
}: {
  item: ReplyApprovalItem;
  now?: Date;
  replyText?: string;
  userId: string;
}) {
  const timestamp = now.toISOString();

  return replyApprovalItemSchema.parse({
    ...item,
    suggestedReply: replyText?.trim() || item.suggestedReply,
    status: "approved",
    approvedAt: timestamp,
    approvedByUserId: userId,
    updatedAt: timestamp
  });
}

export function requestReplyChanges({
  comment,
  item,
  now = new Date()
}: {
  comment: string;
  item: ReplyApprovalItem;
  now?: Date;
}) {
  return replyApprovalItemSchema.parse({
    ...item,
    status: "changes_requested",
    changeRequest: comment.trim(),
    updatedAt: now.toISOString()
  });
}
