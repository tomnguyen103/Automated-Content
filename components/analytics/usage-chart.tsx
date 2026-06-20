import { Badge } from "@/components/ui/badge";
import type { UsageBreakdownItem, UsageChartPoint } from "@/lib/analytics/metrics";

export function getBarWidth(quantity: number, maxQuantity: number) {
  if (quantity <= 0 || maxQuantity <= 0) {
    return "0%";
  }

  return `${Math.max(6, Math.round((quantity / maxQuantity) * 100))}%`;
}

export function UsageChart({
  byType,
  points
}: {
  byType: UsageBreakdownItem[];
  points: UsageChartPoint[];
}) {
  const maxQuantity = Math.max(0, ...points.map((point) => point.quantity));

  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Usage history</h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Ledger events across generation, scheduling, publishing, media, and replies.
          </p>
        </div>
        <Badge tone="primary">{byType.reduce((sum, item) => sum + item.quantity, 0)} events</Badge>
      </div>

      <div className="mt-5 space-y-3" aria-label="Daily usage totals">
        {points.map((point) => (
          <div key={point.date} className="grid grid-cols-[72px_1fr_42px] items-center gap-3">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">{point.label}</span>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-soft)]">
              <div
                className="h-full rounded-full bg-[var(--color-primary)]"
                style={{ width: getBarWidth(point.quantity, maxQuantity) }}
              />
            </div>
            <span className="text-right text-xs font-medium text-[var(--color-text-muted)]">{point.quantity}</span>
          </div>
        ))}
      </div>

      {byType.length > 0 ? (
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {byType.map((item) => (
            <div
              key={item.type}
              className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--color-surface)] px-3 py-2"
            >
              <span className="text-sm text-[var(--color-text-muted)]">{item.label}</span>
              <span className="text-sm font-semibold text-[var(--color-text)]">{item.quantity}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-5 text-sm text-[var(--color-text-muted)]">No usage ledger rows are available yet.</p>
      )}
    </section>
  );
}
