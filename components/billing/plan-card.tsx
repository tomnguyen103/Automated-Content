import Link from "next/link";
import { CheckCircle2, CreditCard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { BillingPlan, PlanEntitlements } from "@/lib/billing/entitlements";
import { cn } from "@/lib/utils";

type PlanCardProps = {
  plan: BillingPlan;
  entitlements: PlanEntitlements;
  active?: boolean;
  action: {
    label: string;
    href?: string;
    disabledReason?: string;
  };
};

const planHighlights: Record<BillingPlan, string[]> = {
  free: ["25 AI generations/month", "1 scheduled post/day", "1 provider connection"],
  premium: ["7 scheduled posts/day", "Multi-platform publishing", "Keyword auto replies"]
};

function actionClasses(active: boolean, disabled: boolean) {
  return cn(
    "mt-6 inline-flex h-10 w-full items-center justify-center gap-2 rounded-[var(--radius-md)] border px-4 text-sm font-medium transition active:translate-y-px",
    active
      ? "border-[var(--color-border)] bg-white text-[var(--color-text)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface)]"
      : "border-transparent bg-[var(--color-primary)] text-white shadow-sm hover:bg-[var(--color-primary-strong)]",
    disabled && "pointer-events-none cursor-not-allowed opacity-50"
  );
}

export function PlanCard({ plan, entitlements, active = false, action }: PlanCardProps) {
  const disabled = !action.href;

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

      {action.href ? (
        <Link href={action.href} className={actionClasses(active, disabled)}>
          <CreditCard size={16} aria-hidden="true" />
          {action.label}
        </Link>
      ) : (
        <button
          type="button"
          className={actionClasses(active, disabled)}
          disabled
          title={action.disabledReason}
        >
          <CreditCard size={16} aria-hidden="true" />
          {action.label}
        </button>
      )}
    </section>
  );
}
