import { CalendarClock, CheckCircle2, CircleAlert, Clock3 } from "lucide-react";
import type { ReactNode } from "react";
import { PublishRetryButton } from "@/components/calendar/publish-retry-button";
import { PageShell } from "@/components/layout/page-shell";
import { SubNav } from "@/components/layout/sub-nav";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getQueueRows, getQueueStats, type QueueRow } from "@/lib/scheduler/queue-overview";
import {
  getWorkerRuntimeReadiness,
  type WorkerQueueStatus
} from "@/lib/scheduler/worker-health";
import { resolvePersonalWorkspaceForUser } from "@/lib/workspaces/personal-workspace";

export const dynamic = "force-dynamic";

const enqueueTone = {
  Queued: "success",
  Pending: "neutral",
  "Retry needed": "critical"
} as const;

const statusTone = {
  Queued: "success",
  Scheduled: "primary",
  Publishing: "premium",
  Published: "success",
  Failed: "critical",
  Canceled: "neutral"
} as const;

const workerStatusTone: Record<WorkerQueueStatus, "community" | "critical" | "neutral" | "premium" | "success"> = {
  healthy: "success",
  preview: "community",
  queue_not_configured: "neutral",
  redis_unavailable: "critical",
  worker_not_running: "critical",
  jobs_failed: "critical",
  jobs_waiting: "premium"
};

export default async function CalendarPage() {
  const user = await getCurrentUser();
  const workspace = user ? await resolvePersonalWorkspaceForUser(user) : null;
  const [queueRows, workerReadiness] = await Promise.all([
    getQueueRows({
      isLocalPreview: workspace?.isLocalPreview,
      workspaceId: workspace?.id
    }),
    getWorkerRuntimeReadiness({
      isLocalPreview: workspace?.isLocalPreview,
      workspaceId: workspace?.id
    })
  ]);
  const queueStats = getQueueStats(queueRows);
  const publishedRows = queueRows.filter((row) => row.status === "Published");
  const failedRows = queueRows.filter((row) => row.status === "Failed" || row.enqueue === "Retry needed");
  const hasWaitingJobs = workerReadiness.queues.some((queue) => queue.status === "jobs_waiting");
  const workerBadge =
    workerReadiness.summary.blocked > 0
      ? `${workerReadiness.summary.blocked} blocked`
      : workerReadiness.summary.healthy > 0
        ? `${workerReadiness.summary.healthy} healthy`
        : workspace?.isLocalPreview
          ? "Preview mode"
          : hasWaitingJobs
            ? "Workers idle"
            : "Not configured";
  const workerBadgeTone =
    workerReadiness.summary.blocked > 0
      ? "critical"
      : workerReadiness.summary.healthy > 0
        ? "success"
        : hasWaitingJobs
          ? "premium"
          : workspace?.isLocalPreview
            ? "community"
            : "neutral";

  return (
    <>
      <SubNav
        items={[
          { label: "Calendar", href: "#calendar", active: true },
          { label: "Queue", href: "#queue" },
          { label: "Published", href: "#published" },
          { label: "Failed", href: "#failed" },
          { label: "Drafts", href: "#drafts" }
        ]}
      />
      <PageShell
        title="Calendar"
        description="Track scheduled posts, queue enqueue state, worker attempts, and recoverable failures from one operational view."
        actions={
          <Badge tone={queueStats.recoverable > 0 ? "critical" : "success"}>
            {queueStats.recoverable > 0 ? `${queueStats.recoverable} retryable` : "Queue stable"}
          </Badge>
        }
      >
        <div id="calendar" className="grid scroll-mt-24 gap-4 md:grid-cols-3">
          <StatusCard
            icon={<CalendarClock size={18} aria-hidden="true" />}
            label="Scheduled"
            value={String(queueStats.scheduled)}
            detail="Committed rows"
            tone="primary"
          />
          <StatusCard
            icon={<CheckCircle2 size={18} aria-hidden="true" />}
            label="Queued"
            value={String(queueStats.queued)}
            detail="Backend accepted"
            tone="success"
          />
          <StatusCard
            icon={<CircleAlert size={18} aria-hidden="true" />}
            label="Recoverable"
            value={String(queueStats.recoverable)}
            detail="Enqueue failed"
            tone="critical"
          />
        </div>

        <section id="queue" className="mt-6 scroll-mt-24 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white">
          <div className="flex flex-col gap-3 border-b border-[var(--color-border)] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold">Publishing queue</h2>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                Rows stay visible when queue delivery needs attention.
              </p>
            </div>
            <Badge tone={workerBadgeTone}>{workerBadge}</Badge>
          </div>
          <div className="grid gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] p-5 md:grid-cols-2">
            {workerReadiness.queues.map((queue) => (
              <div key={queue.kind} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-sm)] bg-white px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{queue.queueName}</p>
                  <p className="mt-0.5 text-xs font-mono text-[var(--color-text-muted)]">{queue.jobName}</p>
                </div>
                <Badge tone={workerStatusTone[queue.status]}>{queue.status.replaceAll("_", " ")}</Badge>
              </div>
            ))}
          </div>
          <div className="divide-y divide-[var(--color-border)]">
            {queueRows.map((row) => (
              <QueueRowItem key={row.id} row={row} retryDisabled={workspace?.isLocalPreview} />
            ))}
          </div>
        </section>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <QueueSummarySection id="published" rows={publishedRows} title="Published" empty="No published posts in this queue window." />
          <QueueSummarySection id="failed" rows={failedRows} title="Failed" empty="No failed or retryable rows." />
          <QueueSummarySection id="drafts" rows={[]} title="Drafts" empty="Draft rows are not part of the publishing queue yet." />
        </div>
      </PageShell>
    </>
  );
}

function QueueRowItem({
  retryDisabled,
  row
}: {
  retryDisabled?: boolean;
  row: QueueRow;
}) {
  return (
    <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_160px_150px_150px_160px] lg:items-center">
      <div className="min-w-0">
        <p className="font-medium">{row.title}</p>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">{row.provider}</p>
        {row.recovery ? (
          <p className="mt-2 max-w-3xl text-xs text-[var(--color-text-muted)]">
            {row.recovery.recommendation}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
        <Clock3 size={16} aria-hidden="true" />
        {row.scheduledFor}
      </div>
      <Badge tone={statusTone[row.status]}>{row.status}</Badge>
      <Badge tone={enqueueTone[row.enqueue as keyof typeof enqueueTone]}>{row.enqueue}</Badge>
      {row.recovery?.actions.includes("retry") ? (
        <PublishRetryButton disabled={retryDisabled} scheduledJobId={row.id} />
      ) : (
        <p className="text-sm text-[var(--color-text-muted)] lg:text-right">No action</p>
      )}
    </div>
  );
}

function QueueSummarySection({
  empty,
  id,
  rows,
  title
}: {
  empty: string;
  id: string;
  rows: QueueRow[];
  title: string;
}) {
  return (
    <section id={id} className="scroll-mt-24 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Badge tone={rows.length > 0 ? "primary" : "neutral"}>{rows.length}</Badge>
      </div>
      {rows.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {rows.slice(0, 4).map((row) => (
            <div key={row.id} className="rounded-[var(--radius-sm)] bg-[var(--color-surface)] px-3 py-2">
              <p className="truncate text-sm font-medium">{row.title}</p>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">{row.scheduledFor}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">{empty}</p>
      )}
    </section>
  );
}

function StatusCard({
  icon,
  label,
  value,
  detail,
  tone
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: "primary" | "success" | "critical";
}) {
  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-surface)] text-[var(--color-text)]">
          {icon}
        </span>
        <Badge tone={tone}>{detail}</Badge>
      </div>
      <p className="mt-4 text-sm text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p>
    </section>
  );
}
