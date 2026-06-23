import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  ApprovalCommandCenterFilters,
  ApprovalCommandCenterItem,
  ApprovalCommandCenterResult,
  ApprovalDecisionType,
  ApprovalSeverity
} from "@/lib/approvals/command-center";

type ApprovalCommandCenterProps = {
  filters: ApprovalCommandCenterFilters;
  result: ApprovalCommandCenterResult;
};

const severityTone: Record<ApprovalSeverity, "critical" | "premium" | "neutral"> = {
  blocked: "critical",
  info: "neutral",
  warning: "premium"
};

const sourceLabels: Record<ApprovalCommandCenterItem["source"], string> = {
  agents: "Agents",
  brand_memory: "Brand Memory",
  content: "Content",
  reply: "Replies"
};

const typeLabels: Record<ApprovalDecisionType, string> = {
  brand_memory: "Brand memory",
  budget_block: "Budget block",
  content_review: "Content review",
  policy_escalation: "Policy escalation",
  provider_block: "Provider block",
  reply_approval: "Reply approval"
};

const filterLinks: Array<{
  href: string;
  label: string;
  matches: (filters: ApprovalCommandCenterFilters) => boolean;
}> = [
  {
    href: "/approvals",
    label: "All",
    matches: (filters) => !hasActiveFilters(filters)
  },
  {
    href: "/approvals?severity=blocked",
    label: "Blocked",
    matches: (filters) => filters.severity === "blocked"
  },
  {
    href: "/approvals?type=reply_approval",
    label: "Replies",
    matches: (filters) => filters.type === "reply_approval"
  },
  {
    href: "/approvals?type=brand_memory",
    label: "Brand memory",
    matches: (filters) => filters.type === "brand_memory"
  },
  {
    href: "/approvals?type=provider_block",
    label: "Provider blocks",
    matches: (filters) => filters.type === "provider_block"
  },
  {
    href: "/approvals?maxAgeHours=24",
    label: "Last 24h",
    matches: (filters) => filters.maxAgeHours === 24
  }
];

function formatAge(minutes: number) {
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 48) {
    return `${hours}h`;
  }

  return `${Math.floor(hours / 24)}d`;
}

function hasActiveFilters(filters: ApprovalCommandCenterFilters) {
  return Object.values(filters).some((value) => value !== undefined);
}

function Stat({
  label,
  value
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-4">
      <p className="text-sm text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function FilterLink({
  active,
  href,
  label
}: {
  active: boolean;
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-[var(--radius-md)] border px-3 py-2 text-sm font-medium transition",
        active
          ? "border-rose-200 bg-rose-50 text-[var(--color-primary)]"
          : "border-[var(--color-border)] bg-white text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
      )}
      aria-current={active ? "page" : undefined}
    >
      {label}
    </Link>
  );
}

function ApprovalRow({ item }: { item: ApprovalCommandCenterItem }) {
  return (
    <article className="grid gap-3 border-t border-[var(--color-border)] p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-semibold">{item.title}</h3>
          <Badge tone={severityTone[item.severity]}>{item.severity}</Badge>
          <Badge tone="neutral">{sourceLabels[item.source]}</Badge>
          <Badge tone="neutral">{typeLabels[item.type]}</Badge>
        </div>
        <p className="mt-2 text-sm leading-6 text-[var(--color-text)]">{item.detail}</p>
        <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">{item.reason}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--color-text-muted)]">
          {item.provider ? <span>Provider: {item.provider}</span> : null}
          {item.platform ? <span>Platform: {item.platform}</span> : null}
          {item.missionId ? <span>Mission: {item.missionId}</span> : null}
          <span>Age: {formatAge(item.ageMinutes)}</span>
        </div>
      </div>
      <Link
        href={item.href}
        className="inline-flex h-9 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-sm font-medium text-[var(--color-text)] transition hover:bg-[var(--color-surface)]"
      >
        Open source
      </Link>
    </article>
  );
}

export function ApprovalCommandCenter({ filters, result }: ApprovalCommandCenterProps) {
  return (
    <div className="grid gap-6">
      <section id="overview" className="grid scroll-mt-24 gap-3 md:grid-cols-4">
        <Stat label="Open decisions" value={result.stats.total} />
        <Stat label="Blocked" value={result.stats.blocked} />
        <Stat label="Pending" value={result.stats.pending} />
        <Stat label="Agent events" value={result.stats.bySource.agents} />
      </section>

      <section id="filters" className="scroll-mt-24">
        <div className="flex flex-wrap gap-2">
          {filterLinks.map((link) => (
            <FilterLink
              key={link.href}
              href={link.href}
              label={link.label}
              active={link.matches(filters)}
            />
          ))}
        </div>
      </section>

      <section id="queue" className="scroll-mt-24 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <h2 className="text-base font-semibold">Decision queue</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Reply, content, memory, provider, budget, and policy decisions from this workspace.
            </p>
          </div>
          {hasActiveFilters(filters) ? (
            <Link href="/approvals" className="text-sm font-medium text-[var(--color-primary)]">
              Clear filters
            </Link>
          ) : null}
        </div>

        {result.items.length === 0 ? (
          <div className="border-t border-[var(--color-border)] p-6 text-sm text-[var(--color-text-muted)]">
            No approval decisions match this view.
          </div>
        ) : (
          <div>
            {result.items.map((item) => (
              <ApprovalRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
