import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/layout/page-shell";
import { SubNav } from "@/components/layout/sub-nav";

type PlaceholderPageProps = {
  title: string;
  description: string;
  tabs: string[];
  phase: string;
};

export function PlaceholderPage({ title, description, tabs, phase }: PlaceholderPageProps) {
  return (
    <>
      <SubNav items={tabs.map((label, index) => ({ label, active: index === 0 }))} />
      <PageShell
        title={title}
        description={description}
        actions={<Button variant="outline">View phase spec</Button>}
      >
        <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white p-6">
          <Badge tone="primary">{phase}</Badge>
          <h2 className="mt-4 text-lg font-semibold">Implementation surface reserved</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-muted)]">
            This route is wired into the app shell now so navigation, page hierarchy, and tab behavior stay stable as
            feature work lands phase by phase.
          </p>
        </section>
      </PageShell>
    </>
  );
}
