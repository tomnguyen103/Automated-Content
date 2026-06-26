import "server-only";

import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb, type DatabaseClient } from "@/db";
import {
  autoReplyRules,
  commentEvents,
  replyAttempts,
  workflowCheckpoints
} from "@/db/schema";
import type { AgentRun } from "@/lib/agents/schemas/agent-run";
import type {
  CommentReplyInput,
  CommentReplyOutput,
  CommentReplyTriageLabel
} from "@/lib/agents/schemas/comment-reply";
import { isDatabaseConfigured } from "@/lib/env";
import type { ProviderReplyResult } from "@/lib/providers/types";
import { approveReplySuggestion, createReplyApprovalItem, type ReplyApprovalItem } from "@/lib/replies/approval";
import type { ReplyAuditEntry } from "@/lib/replies/audit";
import {
  autoRepliesConsoleStateSchema,
  type AutoRepliesConsoleState,
  type CreateReplyRuleRequest,
  type InboxComment,
  type ReplyLogEntry
} from "@/lib/replies/console";
import type { RecentReplyAttempt } from "@/lib/replies/matcher";
import { autoReplyRuleSchema, normalizeReplyRule, type AutoReplyRule } from "@/lib/replies/rules";

type CommentReplyWorkflowStatus = "sent" | "awaiting_approval" | "ignored" | "failed";
type ReplyAttemptStatus = "approved" | "awaiting_approval" | "sent" | "failed" | "skipped";

const autoReplyRuleListLimit = 100;
const autoReplyConsoleEventLimit = 100;
const autoReplyConsoleAttemptLimit = 100;
const recentReplyAttemptLimit = 250;

export type PersistedReplyAttemptInput = {
  id: string;
  commentId: string;
  ruleId?: string;
  status: "sent" | "awaiting_approval" | "failed" | "skipped";
  replyText: string | null;
  providerReplyId?: string;
  triageLabel?: CommentReplyTriageLabel;
  triageReason?: string;
  error?: string;
  audit: ReplyAuditEntry;
  createdAt: string;
  sentAt?: string;
};

export type PersistCommentReplyWorkflowInput = {
  input: CommentReplyInput;
  userId: string;
  run: AgentRun;
  reply: CommentReplyOutput;
  providerReply: ProviderReplyResult | null;
  approval: ReplyApprovalItem | null;
  attempt: PersistedReplyAttemptInput;
  status: CommentReplyWorkflowStatus;
  now: Date;
};

export type PendingReplyApproval = {
  approval: ReplyApprovalItem;
  attempt: StoredReplyAttempt;
  comment: InboxComment;
};

export type ReplyRepository = {
  getConsoleState: (workspaceId: string) => Promise<AutoRepliesConsoleState>;
  listRules: (workspaceId: string) => Promise<AutoReplyRule[]>;
  createRule: (input: {
    workspaceId: string;
    userId: string;
    rule: CreateReplyRuleRequest;
    now?: Date;
  }) => Promise<AutoReplyRule>;
  updateRuleEnabled: (input: {
    workspaceId: string;
    ruleId: string;
    enabled: boolean;
    now?: Date;
  }) => Promise<AutoReplyRule | null>;
  listRecentAttempts: (workspaceId: string) => Promise<RecentReplyAttempt[]>;
  persistWorkflowResult: (input: PersistCommentReplyWorkflowInput) => Promise<void>;
  getPendingApproval: (workspaceId: string, attemptId: string) => Promise<PendingReplyApproval | null>;
  claimPendingApproval: (input: {
    workspaceId: string;
    attemptId: string;
    userId: string;
    replyText: string;
    now?: Date;
  }) => Promise<PendingReplyApproval | null>;
  approvePendingAttempt: (input: {
    workspaceId: string;
    attemptId: string;
    userId: string;
    replyText: string;
    providerReply: ProviderReplyResult;
    now?: Date;
  }) => Promise<boolean>;
  failClaimedApproval: (input: {
    workspaceId: string;
    attemptId: string;
    error: string;
    now?: Date;
  }) => Promise<void>;
};

type StoredReplyAttempt = {
  id: string;
  workspaceId: string;
  commentId: string;
  ruleId?: string;
  provider: CommentReplyInput["comment"]["provider"];
  connectedAccountId?: string;
  status: ReplyAttemptStatus;
  replyText: string;
  approvalRequired: boolean;
  approvedByUserId?: string;
  providerReplyId?: string;
  providerResponse?: Record<string, unknown>;
  triageLabel?: CommentReplyTriageLabel;
  triageReason?: string;
  audit: ReplyAuditEntry;
  error?: string;
  sentAt?: string;
  createdAt: string;
  updatedAt: string;
};

const localPreviewInbox: InboxComment[] = [
  {
    id: "comment_pricing",
    provider: "mock",
    providerCommentId: "comment_pricing",
    platform: "linkedin",
    authorName: "Rina Patel",
    text: "Can you send pricing details?",
    postTitle: "Launch planning checklist",
    receivedAt: "2026-06-20T12:00:00.000Z",
    status: "new"
  },
  {
    id: "comment_voice",
    provider: "mock",
    providerCommentId: "comment_voice",
    platform: "instagram",
    authorName: "Marco Lee",
    text: "Can this keep our brand voice intact?",
    postTitle: "Automation without losing trust",
    receivedAt: "2026-06-20T12:01:00.000Z",
    status: "new"
  },
  {
    id: "comment_demo",
    provider: "mock",
    providerCommentId: "comment_demo",
    platform: "facebook",
    authorName: "Anika Cruz",
    text: "Demo please, I want to show my team.",
    postTitle: "Reply automation guide",
    receivedAt: "2026-06-20T12:02:00.000Z",
    status: "new"
  }
];

function toJsonRecord(value: unknown) {
  return value as Record<string, unknown>;
}

function formatTimestamp(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);

  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric"
  }).format(date);
}

function readStringMetadata(value: Record<string, unknown>, key: string) {
  const candidate = value[key];

  return typeof candidate === "string" && candidate.trim() ? candidate : undefined;
}

function toRule(row: typeof autoReplyRules.$inferSelect): AutoReplyRule {
  return normalizeReplyRule({
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    platformScope: autoReplyRuleSchema.shape.platformScope.parse(row.platformScope),
    matchType: row.matchType,
    keywords: row.keywords,
    template: row.template,
    rateLimit: {
      maxReplies: row.rateLimitMaxReplies,
      windowMinutes: row.rateLimitWindowMinutes
    },
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  });
}

function toRuleInsert({
  rule,
  userId,
  workspaceId,
  now
}: {
  rule: CreateReplyRuleRequest;
  userId: string;
  workspaceId: string;
  now: Date;
}) {
  const parsed = normalizeReplyRule({
    id: `rule_${crypto.randomUUID()}`,
    workspaceId,
    ...rule,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  });

  return {
    parsed,
    row: {
      id: parsed.id,
      workspaceId,
      createdByUserId: userId,
      name: parsed.name,
      platformScope: parsed.platformScope,
      matchType: parsed.matchType,
      keywords: parsed.keywords,
      template: parsed.template,
      rateLimitWindowMinutes: parsed.rateLimit.windowMinutes,
      rateLimitMaxReplies: parsed.rateLimit.maxReplies,
      enabled: parsed.enabled,
      updatedAt: now
    }
  };
}

function toLogEntry({
  attempt,
  comment,
  rule
}: {
  attempt: StoredReplyAttempt;
  comment: InboxComment;
  rule?: AutoReplyRule;
}): ReplyLogEntry {
  const status = attempt.status === "approved" ? "sent" : attempt.status;

  return {
    id: attempt.id,
    timestamp: formatTimestamp(attempt.sentAt ?? attempt.createdAt),
    status: status === "awaiting_approval" ? "awaiting_approval" : status,
    platform: comment.platform,
    authorName: comment.authorName,
    commentText: comment.text,
    replyText: attempt.status === "skipped" ? null : attempt.replyText,
    ruleName: rule?.name ?? (attempt.status === "awaiting_approval" ? "Pending approval" : undefined),
    triageLabel: attempt.triageLabel ?? attempt.audit.triageLabel,
    triageReason: attempt.triageReason ?? attempt.audit.triageReason,
    auditNotes: attempt.audit.notes
  };
}

function toApprovalItem(attempt: StoredReplyAttempt, comment: InboxComment): ReplyApprovalItem {
  return createReplyApprovalItem({
    id: attempt.id,
    workspaceId: attempt.workspaceId,
    commentId: comment.id,
    provider: attempt.provider,
    platform: comment.platform,
    authorName: comment.authorName,
    commentText: comment.text,
    suggestedReply: attempt.replyText,
    confidence: 0.72,
    triageLabel: attempt.triageLabel ?? attempt.audit.triageLabel,
    triageReason: attempt.triageReason ?? attempt.audit.triageReason,
    auditNotes: attempt.audit.notes,
    now: new Date(attempt.createdAt)
  });
}

function toCommentStatus(status: CommentReplyWorkflowStatus): InboxComment["status"] {
  if (status === "sent") {
    return "replied";
  }

  if (status === "awaiting_approval") {
    return "awaiting_approval";
  }

  if (status === "failed") {
    return "failed";
  }

  return "ignored";
}

function checkpointStatus(status: CommentReplyWorkflowStatus) {
  if (status === "awaiting_approval") {
    return "awaiting_review" as const;
  }

  if (status === "failed") {
    return "failed" as const;
  }

  return "succeeded" as const;
}

function checkpointNode(status: CommentReplyWorkflowStatus) {
  if (status === "awaiting_approval") {
    return "decide_reply";
  }

  if (status === "sent") {
    return "audit";
  }

  return "audit";
}

function createStoredAttempt({
  input,
  persist
}: {
  input: CommentReplyInput;
  persist: PersistCommentReplyWorkflowInput;
}): StoredReplyAttempt {
  const timestamp = persist.now.toISOString();
  const replyText =
    persist.attempt.replyText ?? persist.attempt.audit.replyPreview ?? persist.reply.replyDraft ?? "No reply sent.";

  return {
    id: persist.attempt.id,
    workspaceId: persist.input.workspaceId,
    commentId: input.comment.id,
    ruleId: persist.attempt.ruleId,
    provider: input.comment.provider,
    connectedAccountId: input.comment.connectedAccountId,
    status: persist.attempt.status,
    replyText,
    approvalRequired: persist.status === "awaiting_approval",
    providerReplyId: persist.providerReply?.providerReplyId,
    providerResponse: persist.providerReply?.raw,
    triageLabel: persist.attempt.triageLabel ?? persist.attempt.audit.triageLabel ?? persist.reply.triageLabel,
    triageReason: persist.attempt.triageReason ?? persist.attempt.audit.triageReason ?? persist.reply.triageReason,
    audit: persist.attempt.audit,
    error: persist.attempt.error,
    sentAt: persist.attempt.sentAt,
    createdAt: persist.attempt.createdAt,
    updatedAt: timestamp
  };
}

function createMemoryReplyRepository({ seedLocalPreview = false } = {}): ReplyRepository & {
  clear: () => void;
} {
  const rules = new Map<string, AutoReplyRule>();
  const comments = new Map<string, InboxComment>();
  const attempts = new Map<string, StoredReplyAttempt>();
  const checkpoints = new Map<string, Record<string, unknown>>();
  const seededWorkspaces = new Set<string>();

  function key(workspaceId: string, id: string) {
    return `${workspaceId}:${id}`;
  }

  function seed(workspaceId: string) {
    if (!seedLocalPreview || seededWorkspaces.has(workspaceId)) {
      return;
    }

    localPreviewInbox.forEach((comment) => comments.set(key(workspaceId, comment.id), { ...comment }));
    seededWorkspaces.add(workspaceId);
  }

  async function getConsoleState(workspaceId: string): Promise<AutoRepliesConsoleState> {
    seed(workspaceId);

    const workspaceRules = [...rules.values()]
      .filter((rule) => rule.workspaceId === workspaceId)
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || b.id.localeCompare(a.id))
      .slice(0, autoReplyRuleListLimit);
    const workspacePrefix = `${workspaceId}:`;
    const workspaceComments = [...comments.entries()]
      .filter(([commentKey]) => commentKey.startsWith(workspacePrefix))
      .map(([, comment]) => comment)
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt) || b.id.localeCompare(a.id))
      .slice(0, autoReplyConsoleEventLimit);
    const workspaceAttempts = [...attempts.values()]
      .filter((attempt) => attempt.workspaceId === workspaceId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
      .slice(0, autoReplyConsoleAttemptLimit);
    const approvals = workspaceAttempts
      .filter((attempt) => attempt.status === "awaiting_approval")
      .map((attempt) => {
        const comment = comments.get(key(workspaceId, attempt.commentId));
        return comment ? toApprovalItem(attempt, comment) : null;
      })
      .filter((approval): approval is ReplyApprovalItem => Boolean(approval));
    const logs = workspaceAttempts
      .map((attempt) => {
        const comment = comments.get(key(workspaceId, attempt.commentId));
        const rule = attempt.ruleId ? rules.get(key(workspaceId, attempt.ruleId)) : undefined;
        return comment ? toLogEntry({ attempt, comment, rule }) : null;
      })
      .filter((entry): entry is ReplyLogEntry => Boolean(entry));

    return autoRepliesConsoleStateSchema.parse({
      rules: workspaceRules,
      inbox: workspaceComments,
      approvals,
      logs
    });
  }

  return {
    async getConsoleState(workspaceId) {
      return getConsoleState(workspaceId);
    },
    async listRules(workspaceId) {
      return (await getConsoleState(workspaceId)).rules;
    },
    async createRule({ workspaceId, rule, now = new Date() }) {
      const parsed = normalizeReplyRule({
        id: `rule_${crypto.randomUUID()}`,
        workspaceId,
        ...rule,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      });

      rules.set(key(workspaceId, parsed.id), parsed);

      return parsed;
    },
    async updateRuleEnabled({ workspaceId, ruleId, enabled, now = new Date() }) {
      const rule = rules.get(key(workspaceId, ruleId));

      if (!rule) {
        return null;
      }

      const updated = normalizeReplyRule({
        ...rule,
        enabled,
        updatedAt: now.toISOString()
      });
      rules.set(key(workspaceId, ruleId), updated);

      return updated;
    },
    async listRecentAttempts(workspaceId) {
      return [...attempts.values()]
        .filter((attempt) => attempt.workspaceId === workspaceId && attempt.ruleId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
        .slice(0, recentReplyAttemptLimit)
        .map((attempt) => ({
          ruleId: attempt.ruleId!,
          attemptedAt: attempt.sentAt ?? attempt.createdAt,
          status: attempt.status
        }));
    },
    async persistWorkflowResult(persist) {
      seed(persist.input.workspaceId);

      const commentKey = key(persist.input.workspaceId, persist.input.comment.id);
      const current = comments.get(commentKey);
      const nextComment: InboxComment = current
        ? {
            ...current,
            status: toCommentStatus(persist.status)
          }
        : {
            id: persist.input.comment.id,
            provider: persist.input.comment.provider,
            providerCommentId: persist.input.comment.providerCommentId ?? persist.input.comment.id,
            providerPostId: persist.input.comment.providerPostId,
            connectedAccountId: persist.input.comment.connectedAccountId,
            platform: persist.input.comment.platform,
            authorName: persist.input.comment.authorName ?? "Unknown commenter",
            authorProviderId: persist.input.comment.authorProviderId,
            text: persist.input.comment.text,
            postTitle: persist.input.postContext.title,
            postBody: persist.input.postContext.body,
            receivedAt: persist.input.comment.receivedAt ?? persist.now.toISOString(),
            status: toCommentStatus(persist.status)
          };

      comments.set(commentKey, nextComment);

      attempts.set(key(persist.input.workspaceId, persist.attempt.id), createStoredAttempt({ input: persist.input, persist }));
      checkpoints.set(key(persist.input.workspaceId, persist.run.id), {
        runId: persist.run.id,
        traceId: persist.run.traceId,
        status: persist.status,
        reply: persist.reply,
        attempt: persist.attempt,
        approval: persist.approval
      });
    },
    async getPendingApproval(workspaceId, attemptId) {
      seed(workspaceId);

      const attempt = attempts.get(key(workspaceId, attemptId));

      if (!attempt || attempt.status !== "awaiting_approval") {
        return null;
      }

      const comment = comments.get(key(workspaceId, attempt.commentId));

      if (!comment) {
        return null;
      }

      return {
        approval: toApprovalItem(attempt, comment),
        attempt,
        comment
      };
    },
    async claimPendingApproval({ workspaceId, attemptId, userId, replyText, now = new Date() }) {
      const pending = await this.getPendingApproval(workspaceId, attemptId);

      if (!pending) {
        return null;
      }

      const approved = approveReplySuggestion({
        item: pending.approval,
        replyText,
        userId,
        now
      });
      const nextAttempt = {
        ...pending.attempt,
        status: "approved" as const,
        replyText: approved.suggestedReply,
        approvedByUserId: userId,
        updatedAt: now.toISOString(),
        audit: {
          ...pending.attempt.audit,
          notes: [...pending.attempt.audit.notes, "Suggestion was approved and provider send is starting."]
        }
      };

      attempts.set(key(workspaceId, attemptId), nextAttempt);

      return {
        ...pending,
        approval: approved,
        attempt: nextAttempt
      };
    },
    async approvePendingAttempt({ workspaceId, attemptId, userId, replyText, providerReply, now = new Date() }) {
      const attempt = attempts.get(key(workspaceId, attemptId));

      if (!attempt || !["approved", "awaiting_approval"].includes(attempt.status)) {
        return false;
      }

      attempts.set(key(workspaceId, attemptId), {
        ...attempt,
        status: "sent",
        replyText,
        approvedByUserId: userId,
        providerReplyId: providerReply.providerReplyId,
        providerResponse: providerReply.raw,
        sentAt: providerReply.sentAt.toISOString(),
        updatedAt: now.toISOString(),
        audit: {
          ...attempt.audit,
          providerReplyId: providerReply.providerReplyId,
          notes: [...attempt.audit.notes, "Suggestion was approved by a user before sending."]
        }
      });

      const comment = comments.get(key(workspaceId, attempt.commentId));
      if (comment) {
        comments.set(key(workspaceId, comment.id), {
          ...comment,
          status: "replied"
        });
      }

      return true;
    },
    async failClaimedApproval({ workspaceId, attemptId, error, now = new Date() }) {
      const attempt = attempts.get(key(workspaceId, attemptId));

      if (!attempt || attempt.status !== "approved") {
        return;
      }

      attempts.set(key(workspaceId, attemptId), {
        ...attempt,
        status: "failed",
        error,
        updatedAt: now.toISOString(),
        audit: {
          ...attempt.audit,
          notes: [...attempt.audit.notes, `Approved reply failed before provider confirmation: ${error}`]
        }
      });

      const comment = comments.get(key(workspaceId, attempt.commentId));

      if (comment) {
        comments.set(key(workspaceId, comment.id), {
          ...comment,
          status: "failed"
        });
      }
    },
    clear() {
      rules.clear();
      comments.clear();
      attempts.clear();
      checkpoints.clear();
      seededWorkspaces.clear();
    }
  };
}

export function createDatabaseReplyRepository(db: DatabaseClient = getDb()): ReplyRepository {
  async function getConsoleState(workspaceId: string): Promise<AutoRepliesConsoleState> {
    const rules = await repository.listRules(workspaceId);
    const commentRows = await db
      .select()
      .from(commentEvents)
      .where(eq(commentEvents.workspaceId, workspaceId))
      .orderBy(desc(commentEvents.receivedAt), desc(commentEvents.id))
      .limit(autoReplyConsoleEventLimit);
    const inbox: InboxComment[] = commentRows.map((comment) => {
      const metadata = toJsonRecord(comment.metadata);

      return {
        id: comment.id,
        provider: comment.provider,
        providerCommentId: comment.providerCommentId,
        providerPostId: comment.providerPostId ?? undefined,
        connectedAccountId: comment.connectedAccountId ?? undefined,
        platform: comment.platform,
        authorName: comment.authorDisplayName ?? "Unknown commenter",
        authorProviderId: comment.authorProviderId ?? undefined,
        text: comment.text,
        postTitle: readStringMetadata(metadata, "postTitle"),
        postBody: readStringMetadata(metadata, "postBody"),
        receivedAt: comment.receivedAt.toISOString(),
        status: comment.status === "matched" ? "new" : comment.status
      };
    });
    const attemptRows = await db
      .select({
        attempt: replyAttempts,
        comment: commentEvents,
        rule: autoReplyRules
      })
      .from(replyAttempts)
      .innerJoin(
        commentEvents,
        and(
          eq(replyAttempts.workspaceId, commentEvents.workspaceId),
          eq(replyAttempts.commentEventId, commentEvents.id)
        )
      )
      .leftJoin(
        autoReplyRules,
        and(
          eq(replyAttempts.workspaceId, autoReplyRules.workspaceId),
          eq(replyAttempts.ruleId, autoReplyRules.id)
        )
      )
      .where(eq(replyAttempts.workspaceId, workspaceId))
      .orderBy(desc(replyAttempts.createdAt), desc(replyAttempts.id))
      .limit(autoReplyConsoleAttemptLimit);
    const approvals: ReplyApprovalItem[] = [];
    const logs: ReplyLogEntry[] = [];

    for (const row of attemptRows) {
      const metadata = toJsonRecord(row.comment.metadata);
      const comment: InboxComment = {
        id: row.comment.id,
        provider: row.comment.provider,
        providerCommentId: row.comment.providerCommentId,
        providerPostId: row.comment.providerPostId ?? undefined,
        connectedAccountId: row.comment.connectedAccountId ?? undefined,
        platform: row.comment.platform,
        authorName: row.comment.authorDisplayName ?? "Unknown commenter",
        authorProviderId: row.comment.authorProviderId ?? undefined,
        text: row.comment.text,
        postTitle: readStringMetadata(metadata, "postTitle"),
        postBody: readStringMetadata(metadata, "postBody"),
        receivedAt: row.comment.receivedAt.toISOString(),
        status: row.comment.status === "matched" ? "new" : row.comment.status
      };
      const attempt: StoredReplyAttempt = {
        id: row.attempt.id,
        workspaceId: row.attempt.workspaceId,
        commentId: row.attempt.commentEventId,
        ruleId: row.attempt.ruleId ?? undefined,
        provider: row.attempt.provider,
        connectedAccountId: row.attempt.connectedAccountId ?? undefined,
        status: row.attempt.status,
        replyText: row.attempt.replyText,
        approvalRequired: row.attempt.approvalRequired,
        approvedByUserId: row.attempt.approvedByUserId ?? undefined,
        providerReplyId: row.attempt.providerReplyId ?? undefined,
        providerResponse: row.attempt.providerResponse ?? undefined,
        audit: row.attempt.audit as ReplyAuditEntry,
        error: row.attempt.error ?? undefined,
        sentAt: row.attempt.sentAt?.toISOString(),
        createdAt: row.attempt.createdAt.toISOString(),
        updatedAt: row.attempt.updatedAt.toISOString()
      };
      const rule = row.rule ? toRule(row.rule) : undefined;

      logs.push(toLogEntry({ attempt, comment, rule }));

      if (attempt.status === "awaiting_approval") {
        approvals.push(toApprovalItem(attempt, comment));
      }
    }

    return autoRepliesConsoleStateSchema.parse({
      rules,
      inbox,
      approvals,
      logs
    });
  }

  const repository: ReplyRepository = {
    getConsoleState,
    async listRules(workspaceId) {
      const rows = await db
        .select()
        .from(autoReplyRules)
        .where(eq(autoReplyRules.workspaceId, workspaceId))
        .orderBy(desc(autoReplyRules.createdAt), desc(autoReplyRules.id))
        .limit(autoReplyRuleListLimit);

      return rows.map(toRule);
    },
    async createRule({ workspaceId, userId, rule, now = new Date() }) {
      const { parsed, row } = toRuleInsert({ rule, workspaceId, userId, now });

      await db.insert(autoReplyRules).values(row);

      return parsed;
    },
    async updateRuleEnabled({ workspaceId, ruleId, enabled, now = new Date() }) {
      const [row] = await db
        .update(autoReplyRules)
        .set({
          enabled,
          updatedAt: now
        })
        .where(and(eq(autoReplyRules.workspaceId, workspaceId), eq(autoReplyRules.id, ruleId)))
        .returning();

      return row ? toRule(row) : null;
    },
    async listRecentAttempts(workspaceId) {
      const rows = await db
        .select({
          ruleId: replyAttempts.ruleId,
          attemptedAt: replyAttempts.createdAt,
          status: replyAttempts.status
        })
        .from(replyAttempts)
        .where(and(eq(replyAttempts.workspaceId, workspaceId), isNotNull(replyAttempts.ruleId)))
        .orderBy(desc(replyAttempts.createdAt), desc(replyAttempts.id))
        .limit(recentReplyAttemptLimit);

      return rows
        .filter((row): row is typeof row & { ruleId: string } => Boolean(row.ruleId))
        .map((row) => ({
          ruleId: row.ruleId,
          attemptedAt: row.attemptedAt,
          status: row.status
        }));
    },
    async persistWorkflowResult(persist) {
      const timestamp = persist.now;
      const comment = persist.input.comment;
      const providerCommentId = comment.providerCommentId ?? comment.id;
      const status = toCommentStatus(persist.status);
      const storedAttempt = createStoredAttempt({ input: persist.input, persist });

      await db.transaction(async (tx) => {
        const [savedComment] = await tx
          .insert(commentEvents)
          .values({
            id: comment.id,
            workspaceId: persist.input.workspaceId,
            connectedAccountId: comment.connectedAccountId ?? null,
            provider: comment.provider,
            platform: comment.platform,
            providerCommentId,
            providerPostId: comment.providerPostId ?? null,
            authorDisplayName: comment.authorName ?? null,
            authorProviderId: comment.authorProviderId ?? null,
            text: comment.text,
            status,
            receivedAt: comment.receivedAt ? new Date(comment.receivedAt) : timestamp,
            metadata: {
              postTitle: persist.input.postContext.title,
              postBody: persist.input.postContext.body,
              brandVoice: persist.input.brandVoice
            },
            updatedAt: timestamp
          })
          .onConflictDoUpdate({
            target: [commentEvents.workspaceId, commentEvents.provider, commentEvents.providerCommentId],
            set: {
              providerPostId: comment.providerPostId ?? null,
              authorDisplayName: comment.authorName ?? null,
              authorProviderId: comment.authorProviderId ?? null,
              text: comment.text,
              status,
              metadata: {
                postTitle: persist.input.postContext.title,
                postBody: persist.input.postContext.body,
                brandVoice: persist.input.brandVoice
              },
              updatedAt: timestamp
            }
          })
          .returning({ id: commentEvents.id });
        const commentEventId = savedComment?.id ?? storedAttempt.commentId;

        await tx
          .insert(replyAttempts)
          .values({
            id: storedAttempt.id,
            workspaceId: storedAttempt.workspaceId,
            commentEventId,
            ruleId: storedAttempt.ruleId ?? null,
            provider: storedAttempt.provider,
            connectedAccountId: storedAttempt.connectedAccountId ?? null,
            status: storedAttempt.status,
            replyText: storedAttempt.replyText,
            approvalRequired: storedAttempt.approvalRequired,
            providerReplyId: storedAttempt.providerReplyId ?? null,
            providerResponse: storedAttempt.providerResponse ?? null,
            audit: storedAttempt.audit,
            error: storedAttempt.error ?? null,
            sentAt: storedAttempt.sentAt ? new Date(storedAttempt.sentAt) : null,
            updatedAt: timestamp
          })
          .onConflictDoUpdate({
            target: replyAttempts.id,
            set: {
              status: storedAttempt.status,
              replyText: storedAttempt.replyText,
              approvalRequired: storedAttempt.approvalRequired,
              providerReplyId: storedAttempt.providerReplyId ?? null,
              providerResponse: storedAttempt.providerResponse ?? null,
              audit: storedAttempt.audit,
              error: storedAttempt.error ?? null,
              sentAt: storedAttempt.sentAt ? new Date(storedAttempt.sentAt) : null,
              updatedAt: timestamp
            }
          });

        await tx
          .insert(workflowCheckpoints)
          .values({
            id: persist.run.id,
            workspaceId: persist.input.workspaceId,
            runId: persist.run.id,
            userId: persist.userId,
            traceId: persist.run.traceId,
            status: checkpointStatus(persist.status),
            approvalStatus: persist.status === "awaiting_approval" ? "pending" : "not_requested",
            currentNode: checkpointNode(persist.status),
            state: {
              workflow: "comment_reply",
              status: persist.status,
              input: persist.input,
              reply: persist.reply,
              providerReply: persist.providerReply,
              approval: persist.approval,
              attempt: persist.attempt,
              runId: persist.run.id,
              traceId: persist.run.traceId,
              updatedAt: timestamp.toISOString()
            },
            updatedAt: timestamp
          })
          .onConflictDoUpdate({
            target: workflowCheckpoints.id,
            set: {
              status: checkpointStatus(persist.status),
              approvalStatus: persist.status === "awaiting_approval" ? "pending" : "not_requested",
              currentNode: checkpointNode(persist.status),
              state: {
                workflow: "comment_reply",
                status: persist.status,
                input: persist.input,
                reply: persist.reply,
                providerReply: persist.providerReply,
                approval: persist.approval,
                attempt: persist.attempt,
                runId: persist.run.id,
                traceId: persist.run.traceId,
                updatedAt: timestamp.toISOString()
              },
              updatedAt: timestamp
            }
          });
      });
    },
    async getPendingApproval(workspaceId, attemptId) {
      const [row] = await db
        .select({
          attempt: replyAttempts,
          comment: commentEvents
        })
        .from(replyAttempts)
        .innerJoin(
          commentEvents,
          and(
            eq(replyAttempts.workspaceId, commentEvents.workspaceId),
            eq(replyAttempts.commentEventId, commentEvents.id)
          )
        )
        .where(
          and(
            eq(replyAttempts.workspaceId, workspaceId),
            eq(replyAttempts.id, attemptId),
            eq(replyAttempts.status, "awaiting_approval")
          )
        )
        .limit(1);

      if (!row) {
        return null;
      }

      const metadata = toJsonRecord(row.comment.metadata);
      const comment: InboxComment = {
        id: row.comment.id,
        provider: row.comment.provider,
        providerCommentId: row.comment.providerCommentId,
        providerPostId: row.comment.providerPostId ?? undefined,
        connectedAccountId: row.comment.connectedAccountId ?? undefined,
        platform: row.comment.platform,
        authorName: row.comment.authorDisplayName ?? "Unknown commenter",
        authorProviderId: row.comment.authorProviderId ?? undefined,
        text: row.comment.text,
        postTitle: readStringMetadata(metadata, "postTitle"),
        postBody: readStringMetadata(metadata, "postBody"),
        receivedAt: row.comment.receivedAt.toISOString(),
        status: row.comment.status === "matched" ? "new" : row.comment.status
      };
      const attempt: StoredReplyAttempt = {
        id: row.attempt.id,
        workspaceId: row.attempt.workspaceId,
        commentId: row.attempt.commentEventId,
        ruleId: row.attempt.ruleId ?? undefined,
        provider: row.attempt.provider,
        connectedAccountId: row.attempt.connectedAccountId ?? undefined,
        status: row.attempt.status,
        replyText: row.attempt.replyText,
        approvalRequired: row.attempt.approvalRequired,
        approvedByUserId: row.attempt.approvedByUserId ?? undefined,
        providerReplyId: row.attempt.providerReplyId ?? undefined,
        providerResponse: row.attempt.providerResponse ?? undefined,
        audit: row.attempt.audit as ReplyAuditEntry,
        error: row.attempt.error ?? undefined,
        sentAt: row.attempt.sentAt?.toISOString(),
        createdAt: row.attempt.createdAt.toISOString(),
        updatedAt: row.attempt.updatedAt.toISOString()
      };

      return {
        approval: toApprovalItem(attempt, comment),
        attempt,
        comment
      };
    },
    async claimPendingApproval({ workspaceId, attemptId, userId, replyText, now = new Date() }) {
      const pending = await repository.getPendingApproval(workspaceId, attemptId);

      if (!pending) {
        return null;
      }

      const approved = approveReplySuggestion({
        item: pending.approval,
        replyText,
        userId,
        now
      });
      const audit = {
        ...pending.attempt.audit,
        notes: [...pending.attempt.audit.notes, "Suggestion was approved and provider send is starting."]
      };
      const [updated] = await db
        .update(replyAttempts)
        .set({
          status: "approved",
          replyText: approved.suggestedReply,
          approvedByUserId: userId,
          audit,
          updatedAt: now
        })
        .where(
          and(
            eq(replyAttempts.workspaceId, workspaceId),
            eq(replyAttempts.id, attemptId),
            eq(replyAttempts.status, "awaiting_approval")
          )
        )
        .returning({ id: replyAttempts.id });

      if (!updated) {
        return null;
      }

      return {
        ...pending,
        approval: approved,
        attempt: {
          ...pending.attempt,
          status: "approved",
          replyText: approved.suggestedReply,
          approvedByUserId: userId,
          updatedAt: now.toISOString(),
          audit
        }
      };
    },
    async approvePendingAttempt({ workspaceId, attemptId, userId, replyText, providerReply, now = new Date() }) {
      const [row] = await db
        .select({
          attempt: replyAttempts,
          comment: commentEvents
        })
        .from(replyAttempts)
        .innerJoin(
          commentEvents,
          and(
            eq(replyAttempts.workspaceId, commentEvents.workspaceId),
            eq(replyAttempts.commentEventId, commentEvents.id)
          )
        )
        .where(
          and(
            eq(replyAttempts.workspaceId, workspaceId),
            eq(replyAttempts.id, attemptId),
            inArray(replyAttempts.status, ["approved", "awaiting_approval"])
          )
        )
        .limit(1);

      if (!row) {
        return false;
      }

      const metadata = toJsonRecord(row.comment.metadata);
      const comment: InboxComment = {
        id: row.comment.id,
        provider: row.comment.provider,
        providerCommentId: row.comment.providerCommentId,
        providerPostId: row.comment.providerPostId ?? undefined,
        connectedAccountId: row.comment.connectedAccountId ?? undefined,
        platform: row.comment.platform,
        authorName: row.comment.authorDisplayName ?? "Unknown commenter",
        authorProviderId: row.comment.authorProviderId ?? undefined,
        text: row.comment.text,
        postTitle: readStringMetadata(metadata, "postTitle"),
        postBody: readStringMetadata(metadata, "postBody"),
        receivedAt: row.comment.receivedAt.toISOString(),
        status: row.comment.status === "matched" ? "new" : row.comment.status
      };
      const attempt: StoredReplyAttempt = {
        id: row.attempt.id,
        workspaceId: row.attempt.workspaceId,
        commentId: row.attempt.commentEventId,
        ruleId: row.attempt.ruleId ?? undefined,
        provider: row.attempt.provider,
        connectedAccountId: row.attempt.connectedAccountId ?? undefined,
        status: row.attempt.status,
        replyText: row.attempt.replyText,
        approvalRequired: row.attempt.approvalRequired,
        approvedByUserId: row.attempt.approvedByUserId ?? undefined,
        providerReplyId: row.attempt.providerReplyId ?? undefined,
        providerResponse: row.attempt.providerResponse ?? undefined,
        audit: row.attempt.audit as ReplyAuditEntry,
        error: row.attempt.error ?? undefined,
        sentAt: row.attempt.sentAt?.toISOString(),
        createdAt: row.attempt.createdAt.toISOString(),
        updatedAt: row.attempt.updatedAt.toISOString()
      };
      const approved = approveReplySuggestion({
        item: toApprovalItem(attempt, comment),
        replyText,
        userId,
        now
      });
      const audit = {
        ...attempt.audit,
        providerReplyId: providerReply.providerReplyId,
        notes: [...attempt.audit.notes, "Suggestion was approved by a user before sending."]
      };

      return db.transaction(async (tx) => {
        const [updated] = await tx
          .update(replyAttempts)
          .set({
            status: "sent",
            replyText: approved.suggestedReply,
            approvedByUserId: userId,
            providerReplyId: providerReply.providerReplyId,
            providerResponse: providerReply.raw ?? null,
            audit,
            sentAt: providerReply.sentAt,
            updatedAt: now
          })
          .where(
            and(
              eq(replyAttempts.workspaceId, workspaceId),
              eq(replyAttempts.id, attemptId),
              inArray(replyAttempts.status, ["approved", "awaiting_approval"])
            )
          )
          .returning({ id: replyAttempts.id });

        if (!updated) {
          return false;
        }

        await tx
          .update(commentEvents)
          .set({
            status: "replied",
            updatedAt: now
          })
          .where(and(eq(commentEvents.workspaceId, workspaceId), eq(commentEvents.id, comment.id)));

        return true;
      });
    },
    async failClaimedApproval({ workspaceId, attemptId, error, now = new Date() }) {
      await db.transaction(async (tx) => {
        const [existing] = await tx
          .select({
            audit: replyAttempts.audit,
            commentEventId: replyAttempts.commentEventId
          })
          .from(replyAttempts)
          .where(
            and(
              eq(replyAttempts.workspaceId, workspaceId),
              eq(replyAttempts.id, attemptId),
              eq(replyAttempts.status, "approved")
            )
          )
          .limit(1);

        if (!existing) {
          return;
        }

        const currentAudit = existing.audit as ReplyAuditEntry;
        const audit: ReplyAuditEntry = {
          ...currentAudit,
          notes: [...currentAudit.notes, `Approved reply failed before provider confirmation: ${error}`]
        };

        const [updated] = await tx
          .update(replyAttempts)
          .set({
            status: "failed",
            error,
            audit,
            updatedAt: now
          })
          .where(
            and(
              eq(replyAttempts.workspaceId, workspaceId),
              eq(replyAttempts.id, attemptId),
              eq(replyAttempts.status, "approved")
            )
          )
          .returning({ commentEventId: replyAttempts.commentEventId });

        if (!updated) {
          return;
        }

        await tx
          .update(commentEvents)
          .set({
            status: "failed",
            updatedAt: now
          })
          .where(and(eq(commentEvents.workspaceId, workspaceId), eq(commentEvents.id, updated.commentEventId)));
      });
    }
  };

  return repository;
}

const sharedMemoryReplyRepository = createMemoryReplyRepository({ seedLocalPreview: true });

export function createReplyRepository({ allowMemoryFallback = false } = {}) {
  if (allowMemoryFallback) {
    return sharedMemoryReplyRepository;
  }

  if (isDatabaseConfigured) {
    return createDatabaseReplyRepository();
  }

  throw new Error("DATABASE_URL is required for reply persistence.");
}

export function createMemoryReplyRepositoryForTests() {
  return createMemoryReplyRepository();
}

export function clearReplyRepositoryForTests() {
  sharedMemoryReplyRepository.clear();
}
