import { CalendarDays, CheckCircle2, Clock3, Sparkles } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { SubNav } from "@/components/layout/sub-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";

const upcomingPosts = [
  { title: "Founder story carousel", platform: "Instagram", time: "9:00 AM", status: "Ready" },
  { title: "AI workflow thread", platform: "X", time: "12:30 PM", status: "Queued" },
  { title: "Product lesson post", platform: "LinkedIn", time: "3:45 PM", status: "Review" }
];

export default function DashboardPage() {
  return (
    <>
      <SubNav
        items={[
          { label: "Overview", active: true },
          { label: "Agent activity" },
          { label: "Queue health" },
          { label: "Usage" }
        ]}
      />
      <PageShell
        title="Dashboard"
        description="Track scheduled content, agent activity, publishing health, and usage from one command center."
        actions={<Button>New content</Button>}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Scheduled today" value="7" detail="Daily target" tone="primary" />
          <StatCard label="Agent runs" value="18" detail="Traced" tone="community" />
          <StatCard label="Reply matches" value="42" detail="Keyword" tone="premium" />
          <StatCard label="Publish health" value="98%" detail="Stable" tone="success" />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] p-5">
              <div>
                <h2 className="text-base font-semibold">Scheduled queue</h2>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">Next posts waiting for worker execution.</p>
              </div>
              <Badge tone="community">BullMQ ready</Badge>
            </div>
            <div className="divide-y divide-[var(--color-border)]">
              {upcomingPosts.map((post) => (
                <div key={post.title} className="grid gap-3 p-5 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="font-medium">{post.title}</p>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">{post.platform}</p>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
                    <Clock3 size={16} />
                    {post.time}
                  </div>
                  <Badge tone={post.status === "Review" ? "premium" : "primary"}>{post.status}</Badge>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-rose-50 text-[var(--color-primary)]">
                <Sparkles size={19} />
              </span>
              <div>
                <h2 className="text-base font-semibold">LangChain agent loop</h2>
                <p className="text-sm text-[var(--color-text-muted)]">Research, draft, adapt, verify.</p>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {["Research topic", "Generate content pack", "Create platform variants", "Wait for approval"].map(
                (step, index) => (
                  <div key={step} className="flex items-center gap-3 rounded-[var(--radius-md)] bg-[var(--color-surface)] p-3">
                    {index < 3 ? (
                      <CheckCircle2 className="text-[var(--color-community)]" size={17} />
                    ) : (
                      <CalendarDays className="text-[var(--color-premium)]" size={17} />
                    )}
                    <span className="text-sm font-medium">{step}</span>
                  </div>
                )
              )}
            </div>
          </section>
        </div>
      </PageShell>
    </>
  );
}
