import { CalendarClock, CheckCircle2, CircleAlert, Clock3, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { connectedAccounts, platformVariants, scheduledJobs } from "@/db/schema";
import { PageShell } from "@/components/layout/page-shell";
import { SubNav } from "@/components/layout/sub-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isDatabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

type QueueRow = {
  id: string;
  title: string;
  provider: string;
  scheduledFor: string;
  status: "Queued" | "Scheduled" | "Publishing" | "Published" | "Failed" | "Canceled";
  enqueue: "Queued" | "Pending" | "Retry needed";
};

const previewQueueRows: QueueRow[] = [
  {
    id: "queue-001",
    title: "Founder story carousel",
    provider: "Meta",
    scheduledFor: "Today 9:00 AM",
    status: "Queued",
    enqueue: "Queued"
  },
  {
    id: "queue-002",
    title: "AI workflow thread",
    provider: "X",
    scheduledFor: "Today 12:30 PM",
    status: "Scheduled",
    enqueue: "Retry needed"
  },
  {
    id: "queue-003",
    title: "Product lesson post",
    provider: "LinkedIn",
    scheduledFor: "Tomorrow 8:45 AM",
    status: "Scheduled",
    enqueue: "Pending"
  }
];

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

function toTitleCase(value: string) {
  return value
    .split("_")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ") as QueueRow["status"];
}

function toEnqueueLabel(value: string): QueueRow["enqueue"] {
  if (value === "queued") {
    return "Queued";
  }

  if (value === "failed") {
    return "Retry needed";
  }

  return "Pending";
}

function formatScheduledFor(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

async function getQueueRows(): Promise<QueueRow[]> {
  if (!isDatabaseConfigured) {
    return previewQueueRows;
  }

  const rows = await getDb()
    .select({
      id: scheduledJobs.id,
      title: platformVariants.title,
      provider: connectedAccounts.displayName,
      fallbackProvider: scheduledJobs.provider,
      scheduledFor: scheduledJobs.scheduledFor,
      status: scheduledJobs.status,
      enqueueStatus: scheduledJobs.enqueueStatus
    })
    .from(scheduledJobs)
    .innerJoin(
      platformVariants,
      and(
        eq(scheduledJobs.workspaceId, platformVariants.workspaceId),
        eq(scheduledJobs.platformVariantId, platformVariants.id)
      )
    )
    .leftJoin(connectedAccounts, eq(scheduledJobs.connectedAccountId, connectedAccounts.id))
    .orderBy(asc(scheduledJobs.scheduledFor))
    .limit(20);

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    provider: row.provider ?? toTitleCase(row.fallbackProvider),
    scheduledFor: formatScheduledFor(row.scheduledFor),
    status: toTitleCase(row.status),
    enqueue: toEnqueueLabel(row.enqueueStatus)
  }));
}

function getQueueStats(queueRows: QueueRow[]) {
  return {
    scheduled: queueRows.length,
    queued: queueRows.filter((row) => row.enqueue === "Queued").length,
    recoverable: queueRows.filter((row) => row.enqueue === "Retry needed").length
  };
}

export default async function CalendarPage() {
  const queueRows = await getQueueRows();
  const queueStats = getQueueStats(queueRows);

  return (
    <>
      <SubNav
        items={[
          { label: "Calendar", active: true },
          { label: "Queue" },
          { label: "Published" },
          { label: "Failed" },
          { label: "Drafts" }
        ]}
      />
      <PageShell
        title="Calendar"
        description="Track scheduled posts, queue enqueue state, worker attempts, and recoverable failures from one operational view."
        actions={
          <Button variant="outline" disabled title="Retry action is not available yet">
            <RotateCcw size={16} aria-hidden="true" />
            Retry failed
          </Button>
        }
      >
        <div className="grid gap-4 md:grid-cols-3">
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
            detail="BullMQ accepted"
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

        <section className="mt-6 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white">
          <div className="flex flex-col gap-3 border-b border-[var(--color-border)] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold">Publishing queue</h2>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                Rows stay visible when queue delivery needs attention.
              </p>
            </div>
            <Badge tone="community">Worker ready</Badge>
          </div>
          <div className="divide-y divide-[var(--color-border)]">
            {queueRows.map((row) => (
              <div key={row.id} className="grid gap-4 p-5 lg:grid-cols-[1fr_160px_150px_150px] lg:items-center">
                <div className="min-w-0">
                  <p className="font-medium">{row.title}</p>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">{row.provider}</p>
                </div>
                <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
                  <Clock3 size={16} aria-hidden="true" />
                  {row.scheduledFor}
                </div>
                <Badge tone={statusTone[row.status]}>{row.status}</Badge>
                <Badge tone={enqueueTone[row.enqueue as keyof typeof enqueueTone]}>{row.enqueue}</Badge>
              </div>
            ))}
          </div>
        </section>
      </PageShell>
    </>
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
