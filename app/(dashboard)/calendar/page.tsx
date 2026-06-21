import { CalendarClock, CheckCircle2, CircleAlert, Clock3, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { SubNav } from "@/components/layout/sub-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getQueueRows, getQueueStats } from "@/lib/scheduler/queue-overview";
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

export default async function CalendarPage() {
  const user = await getCurrentUser();
  const workspace = user ? await resolvePersonalWorkspaceForUser(user) : null;
  const queueRows = await getQueueRows({
    isLocalPreview: workspace?.isLocalPreview,
    workspaceId: workspace?.id
  });
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
