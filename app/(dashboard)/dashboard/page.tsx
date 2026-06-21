import Link from "next/link";
import { CalendarDays, CheckCircle2, CircleAlert, Clock3, Plus, Sparkles } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { SubNav } from "@/components/layout/sub-nav";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { getWorkspaceAnalyticsSnapshot, type AnalyticsSnapshot } from "@/lib/analytics/metrics";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getQueueRows, getQueueStats, type QueueRow } from "@/lib/scheduler/queue-overview";
import { resolvePersonalWorkspaceForUser } from "@/lib/workspaces/personal-workspace";

export const dynamic = "force-dynamic";

const enqueueTone = {
  Queued: "success",
  Pending: "neutral",
  "Retry needed": "critical"
} as const;

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function getPublishHealth(snapshot: AnalyticsSnapshot) {
  const publishOutcomes = snapshot.posting.published + snapshot.posting.failed;

  if (publishOutcomes === 0) {
    return {
      value: "No data",
      detail: "Awaiting rows",
      tone: "neutral" as const
    };
  }

  const health = Math.round((snapshot.posting.published / publishOutcomes) * 100);

  return {
    value: `${health}%`,
    detail: `${snapshot.posting.failed} failed`,
    tone: health >= 95 ? ("success" as const) : ("premium" as const)
  };
}

function getQueueBadge({
  isLocalPreview,
  queueRows,
  recoverable
}: {
  isLocalPreview: boolean;
  queueRows: QueueRow[];
  recoverable: number;
}) {
  if (isLocalPreview) {
    return <Badge tone="community">Preview queue</Badge>;
  }

  if (recoverable > 0) {
    return <Badge tone="critical">Retry needed</Badge>;
  }

  return (
    <Badge tone={queueRows.length > 0 ? "community" : "neutral"}>
      {queueRows.length > 0 ? "Worker queue" : "No rows"}
    </Badge>
  );
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const workspace = user ? await resolvePersonalWorkspaceForUser(user) : null;
  const [snapshot, queueRows] = await Promise.all([
    getWorkspaceAnalyticsSnapshot({
      isLocalPreview: workspace?.isLocalPreview,
      workspaceId: workspace?.id
    }),
    getQueueRows({
      isLocalPreview: workspace?.isLocalPreview,
      limit: 3,
      workspaceId: workspace?.id
    })
  ]);
  const queueStats = getQueueStats(queueRows);
  const publishHealth = getPublishHealth(snapshot);
  const agentActivity = [
    {
      label: "Running",
      value: formatNumber(snapshot.agents.running),
      icon: <CalendarDays className="text-[var(--color-premium)]" size={17} aria-hidden="true" />
    },
    {
      label: "Succeeded",
      value: formatNumber(snapshot.agents.succeeded),
      icon: <CheckCircle2 className="text-[var(--color-community)]" size={17} aria-hidden="true" />
    },
    {
      label: "Failed",
      value: formatNumber(snapshot.agents.failed),
      icon: <CircleAlert className="text-red-600" size={17} aria-hidden="true" />
    },
    {
      label: "Average tools",
      value: String(snapshot.agents.averageToolCalls),
      icon: <Sparkles className="text-[var(--color-primary)]" size={17} aria-hidden="true" />
    }
  ];

  return (
    <>
      <SubNav
        items={[
          { label: "Overview", active: true },
          { label: "Agent activity", href: "/analytics" },
          { label: "Queue health", href: "/calendar" },
          { label: "Usage", href: "/billing" }
        ]}
      />
      <PageShell
        title="Dashboard"
        description="Track scheduled content, agent activity, publishing health, and usage from one command center."
        actions={
          <Link
            href="/create"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-transparent bg-[var(--color-primary)] px-4 text-sm font-medium text-white shadow-sm transition hover:bg-[var(--color-primary-strong)] active:translate-y-px"
          >
            <Plus size={16} aria-hidden="true" />
            New content
          </Link>
        }
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Scheduled queue"
            value={formatNumber(queueStats.scheduled)}
            detail={`${queueStats.queued} queued`}
            tone="primary"
          />
          <StatCard
            label="Agent runs"
            value={formatNumber(snapshot.agents.total)}
            detail={`${snapshot.agents.running} running`}
            tone="community"
          />
          <StatCard
            label="Reply matches"
            value={formatNumber(snapshot.replies.matched)}
            detail={`${snapshot.replies.awaitingApproval} pending`}
            tone="premium"
          />
          <StatCard
            label="Publish health"
            value={publishHealth.value}
            detail={publishHealth.detail}
            tone={publishHealth.tone}
          />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] p-5">
              <div>
                <h2 className="text-base font-semibold">Scheduled queue</h2>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">Next posts waiting for worker execution.</p>
              </div>
              {getQueueBadge({
                isLocalPreview: Boolean(workspace?.isLocalPreview),
                queueRows,
                recoverable: queueStats.recoverable
              })}
            </div>
            <div className="divide-y divide-[var(--color-border)]">
              {queueRows.length > 0 ? (
                queueRows.map((post) => (
                  <div key={post.id} className="grid gap-3 p-5 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                    <div className="min-w-0">
                      <p className="font-medium">{post.title}</p>
                      <p className="mt-1 text-sm text-[var(--color-text-muted)]">{post.provider}</p>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
                      <Clock3 size={16} aria-hidden="true" />
                      {post.scheduledFor}
                    </div>
                    <Badge tone={enqueueTone[post.enqueue]}>{post.enqueue}</Badge>
                  </div>
                ))
              ) : (
                <div className="p-5 text-sm text-[var(--color-text-muted)]">
                  No scheduled posts are waiting for worker execution.
                </div>
              )}
            </div>
          </section>

          <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-rose-50 text-[var(--color-primary)]">
                <Sparkles size={19} aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-base font-semibold">Agent activity</h2>
                <p className="text-sm text-[var(--color-text-muted)]">Current counters from durable traces.</p>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {agentActivity.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--color-surface)] p-3"
                >
                  <div className="flex items-center gap-3">
                    {item.icon}
                    <span className="text-sm font-medium">{item.label}</span>
                  </div>
                  <span className="text-sm font-semibold">{item.value}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </PageShell>
    </>
  );
}
