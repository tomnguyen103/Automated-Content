import { cn } from "@/lib/utils";
import type { UsageMetric } from "@/lib/billing/usage";

type UsageMeterProps = {
  metric: UsageMetric;
};

export function UsageMeter({ metric }: UsageMeterProps) {
  const percent = metric.limit === 0 ? 100 : Math.min(Math.round((metric.used / metric.limit) * 100), 100);
  const isAtLimit = metric.remaining === 0;

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">{metric.label}</h3>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            {metric.cadence === "daily" ? "Resets daily" : metric.cadence === "monthly" ? "Resets monthly" : "Current total"}
          </p>
        </div>
        <p className="text-sm font-medium">
          {metric.used} / {metric.limit}
        </p>
      </div>
      <div className="mt-4 h-2 rounded-full bg-[var(--color-surface-soft)]">
        <div
          className={cn(
            "h-2 rounded-full",
            isAtLimit ? "bg-[var(--color-warning)]" : "bg-[var(--color-community)]"
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-3 text-xs text-[var(--color-text-muted)]">
        {isAtLimit ? "Limit reached for this window." : `${metric.remaining} remaining.`}
      </p>
    </div>
  );
}
