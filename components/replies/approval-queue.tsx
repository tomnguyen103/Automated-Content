"use client";

import { useState } from "react";
import { CheckCircle2, MessageSquareText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ReplyApprovalItem } from "@/lib/replies/approval";

type ApprovalQueueProps = {
  items: ReplyApprovalItem[];
  onApprove: (itemId: string, replyText: string) => Promise<void> | void;
  approving?: boolean;
};

export function ApprovalQueue({ approving = false, items, onApprove }: ApprovalQueueProps) {
  const pendingItems = items.filter((item) => item.status === "pending");

  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-amber-50 text-amber-700">
            <MessageSquareText size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-semibold">Approval queue</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              AI suggestions wait here until a user approves the final reply.
            </p>
          </div>
        </div>
        <Badge tone={pendingItems.length > 0 ? "premium" : "success"}>{pendingItems.length} pending</Badge>
      </div>

      <div className="mt-4 grid gap-3">
        {pendingItems.length === 0 ? (
          <div className="rounded-[var(--radius-md)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-muted)]">
            No pending suggestions. New unmatched comments will appear here.
          </div>
        ) : (
          pendingItems.map((item) => (
            <ApprovalQueueCard key={item.id} approving={approving} item={item} onApprove={onApprove} />
          ))
        )}
      </div>
    </section>
  );
}

function ApprovalQueueCard({
  item,
  onApprove,
  approving
}: {
  approving: boolean;
  item: ReplyApprovalItem;
  onApprove: (itemId: string, replyText: string) => Promise<void> | void;
}) {
  const [replyText, setReplyText] = useState(item.suggestedReply);

  return (
    <article className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{item.authorName ?? "Unknown commenter"}</h3>
        <Badge tone="neutral">{item.platform}</Badge>
        <Badge tone="premium">{Math.round(item.confidence * 100)} confidence</Badge>
      </div>
      <p className="mt-2 rounded-[var(--radius-sm)] bg-[var(--color-surface)] p-3 text-sm leading-6">
        {item.commentText}
      </p>
      <label className="mt-3 grid gap-2 text-sm font-medium" htmlFor={`approval-reply-${item.id}`}>
        Suggested reply
        <textarea
          className="min-h-24 resize-y rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm leading-6 outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-rose-100"
          id={`approval-reply-${item.id}`}
          value={replyText}
          onChange={(event) => setReplyText(event.target.value)}
        />
      </label>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-5 text-[var(--color-text-muted)]">{item.auditNotes[0]}</p>
        <Button onClick={() => onApprove(item.id, replyText)} size="sm" disabled={approving}>
          <CheckCircle2 size={15} aria-hidden="true" />
          {approving ? "Approving" : "Approve suggestion"}
        </Button>
      </div>
    </article>
  );
}
