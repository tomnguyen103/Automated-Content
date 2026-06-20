"use client";

import { ScrollText } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type ReplyLogEntry = {
  id: string;
  timestamp: string;
  status: "sent" | "awaiting_approval" | "skipped" | "failed";
  platform: string;
  authorName: string;
  commentText: string;
  replyText: string | null;
  ruleName?: string;
  auditNotes: string[];
};

const statusTone = {
  sent: "success",
  awaiting_approval: "premium",
  skipped: "neutral",
  failed: "critical"
} as const;

const statusLabel = {
  sent: "Sent",
  awaiting_approval: "Queued",
  skipped: "Skipped",
  failed: "Failed"
} as const;

export function ReplyLog({ entries }: { entries: ReplyLogEntry[] }) {
  return (
    <section
      aria-labelledby="reply-log-heading"
      className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-teal-50 text-teal-700">
            <ScrollText size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-semibold" id="reply-log-heading">
              Reply log
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">Audit output for sent and queued replies.</p>
          </div>
        </div>
        <Badge tone="neutral">{entries.length} entries</Badge>
      </div>

      <div className="mt-4 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)]">
        {entries.length === 0 ? (
          <div className="bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-muted)]">
            Run rules or approve a suggestion to create the first log entry.
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {entries.map((entry) => (
              <article key={entry.id} className="grid gap-3 bg-white p-4 md:grid-cols-[10rem_1fr_1fr]">
                <div>
                  <Badge tone={statusTone[entry.status]}>{statusLabel[entry.status]}</Badge>
                  <p className="mt-2 text-xs text-[var(--color-text-muted)]">{entry.timestamp}</p>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">{entry.platform}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold">{entry.authorName}</p>
                  <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">{entry.commentText}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold">{entry.ruleName ?? "Manual approval"}</p>
                  <p className="mt-1 text-sm leading-6">
                    {entry.replyText ?? entry.auditNotes[0] ?? "No reply text recorded."}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
