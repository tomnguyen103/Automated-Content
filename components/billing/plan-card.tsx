import { CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { BillingPlan, PlanEntitlements } from "@/lib/billing/entitlements";

type PlanCardProps = {
  plan: BillingPlan;
  entitlements: PlanEntitlements;
  active?: boolean;
};

const planHighlights: Record<BillingPlan, string[]> = {
  free: ["25 AI generations/month", "1 scheduled post/day", "1 provider connection"],
  premium: ["7 scheduled posts/day", "Multi-platform publishing", "Keyword auto replies"]
};

export function PlanCard({ plan, entitlements, active = false }: PlanCardProps) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{entitlements.label}</h2>
            {active ? <Badge tone={plan === "premium" ? "premium" : "primary"}>Current</Badge> : null}
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">{entitlements.description}</p>
        </div>
        <p className="text-2xl font-semibold">{entitlements.price}</p>
      </div>

      <ul className="mt-5 space-y-3">
        {planHighlights[plan].map((highlight) => (
          <li key={highlight} className="flex items-center gap-3 text-sm">
            <CheckCircle2
              className={plan === "premium" ? "text-[var(--color-premium)]" : "text-[var(--color-community)]"}
              size={17}
              aria-hidden="true"
            />
            <span>{highlight}</span>
          </li>
        ))}
      </ul>

      <Button className="mt-6 w-full" variant={active ? "outline" : "primary"}>
        {active ? "Manage plan" : plan === "premium" ? "Upgrade" : "Switch plan"}
      </Button>
    </section>
  );
}
