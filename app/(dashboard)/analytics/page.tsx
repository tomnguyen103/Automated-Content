import { Activity, BarChart3, CircleAlert, MessageCircle, Send, Zap } from "lucide-react";
import type { ReactNode } from "react";
import { AgentRunTable } from "@/components/analytics/agent-run-table";
import { PlatformBreakdown } from "@/components/analytics/platform-breakdown";
import { UsageChart } from "@/components/analytics/usage-chart";
import { PageShell } from "@/components/layout/page-shell";
import { SubNav } from "@/components/layout/sub-nav";
import { Badge } from "@/components/ui/badge";
import { getWorkspaceAnalyticsSnapshot } from "@/lib/analytics/metrics";
import { getCurrentUser } from "@/lib/auth/current-user";
import { resolvePersonalWorkspaceForUser } from "@/lib/workspaces/personal-workspace";

export const dynamic = "force-dynamic";

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function StatTile({
  detail,
  icon,
  label,
  tone,
  value
}: {
  detail: string;
  icon: ReactNode;
  label: string;
  tone: "primary" | "community" | "premium" | "success" | "critical";
  value: number;
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
      <p className="mt-1 text-3xl font-semibold tracking-tight">{formatNumber(value)}</p>
    </section>
  );
}

export default async function AnalyticsPage() {
  const user = await getCurrentUser();
  const workspace = user ? await resolvePersonalWorkspaceForUser(user) : null;
  const snapshot = await getWorkspaceAnalyticsSnapshot({
    isLocalPreview: workspace?.isLocalPreview,
    workspaceId: workspace?.id
  });

  return (
    <>
      <SubNav
        items={[
          { label: "Overview", href: "#overview", active: true },
          { label: "Platforms", href: "#platforms" },
          { label: "Replies", href: "#replies" },
          { label: "Usage", href: "#usage" },
          { label: "Agent activity", href: "#agent-activity" }
        ]}
      />
      <PageShell
        title="Analytics"
        description="Measure posting volume, publishing failures, reply automation, usage ledger activity, and agent traces."
      >
        <div id="overview" className="grid scroll-mt-20 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatTile
            icon={<Send size={18} aria-hidden="true" />}
            label="Posts tracked"
            value={snapshot.posting.total}
            detail={`${snapshot.posting.published} published`}
            tone="primary"
          />
          <StatTile
            icon={<CircleAlert size={18} aria-hidden="true" />}
            label="Failures"
            value={snapshot.failures.total}
            detail="Needs review"
            tone={snapshot.failures.total > 0 ? "critical" : "success"}
          />
          <StatTile
            icon={<MessageCircle size={18} aria-hidden="true" />}
            label="Replies"
            value={snapshot.replies.sent}
            detail={`${snapshot.replies.awaitingApproval} pending`}
            tone="community"
          />
          <StatTile
            icon={<BarChart3 size={18} aria-hidden="true" />}
            label="Usage events"
            value={snapshot.usage.totalQuantity}
            detail="Ledger total"
            tone="premium"
          />
          <StatTile
            icon={<Activity size={18} aria-hidden="true" />}
            label="Agent runs"
            value={snapshot.agents.total}
            detail={`${snapshot.agents.averageToolCalls} tools avg`}
            tone="success"
          />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
          <div id="platforms" className="scroll-mt-20">
            <PlatformBreakdown rows={snapshot.platformBreakdown} />
          </div>
          <section id="replies" className="scroll-mt-20 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-rose-50 text-[var(--color-primary)]">
                <Zap size={18} aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-base font-semibold">Operational health</h2>
                <p className="text-sm text-[var(--color-text-muted)]">Current counters from durable rows.</p>
              </div>
            </div>
            <dl className="mt-5 space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--color-surface)] px-3 py-2">
                <dt className="text-sm text-[var(--color-text-muted)]">Queued posts</dt>
                <dd className="text-sm font-semibold">{formatNumber(snapshot.posting.queued)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--color-surface)] px-3 py-2">
                <dt className="text-sm text-[var(--color-text-muted)]">Comments received</dt>
                <dd className="text-sm font-semibold">{formatNumber(snapshot.replies.comments)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--color-surface)] px-3 py-2">
                <dt className="text-sm text-[var(--color-text-muted)]">Running agents</dt>
                <dd className="text-sm font-semibold">{formatNumber(snapshot.agents.running)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--color-surface)] px-3 py-2">
                <dt className="text-sm text-[var(--color-text-muted)]">Reply failures</dt>
                <dd className="text-sm font-semibold">{formatNumber(snapshot.failures.replies)}</dd>
              </div>
            </dl>
          </section>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div id="usage" className="scroll-mt-20">
            <UsageChart byType={snapshot.usage.byType} points={snapshot.usage.daily} />
          </div>
          <div id="agent-activity" className="scroll-mt-20">
            <AgentRunTable runs={snapshot.agents.recent} />
          </div>
        </div>
      </PageShell>
    </>
  );
}
