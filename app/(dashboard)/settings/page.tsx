import Link from "next/link";
import {
  ArrowRight,
  Bell,
  Bot,
  Brain,
  CreditCard,
  KeyRound,
  MessageCircleReply,
  Plug,
  ShieldCheck
} from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { SubNav } from "@/components/layout/sub-nav";
import { Badge } from "@/components/ui/badge";

const settingsSections = [
  {
    title: "Workspace",
    description: "Plan, billing, and account-level controls.",
    status: "Manage",
    tone: "neutral" as const,
    items: [
      { label: "Billing", href: "/billing", icon: CreditCard },
      { label: "Connections", href: "/connections", icon: Plug }
    ]
  },
  {
    title: "Brand Voice",
    description: "Reusable voice memory and content guardrails.",
    status: "Edit",
    tone: "primary" as const,
    items: [{ label: "Brand Memory", href: "/brand-memory", icon: Brain }]
  },
  {
    title: "Safety",
    description: "Human review queues and OAuth token storage readiness.",
    status: "Review",
    tone: "premium" as const,
    items: [
      { label: "Approvals", href: "/approvals", icon: Bell },
      { label: "Provider Tokens", href: "/connections", icon: KeyRound }
    ]
  },
  {
    title: "Automation",
    description: "Auto-reply rules and agent mission defaults.",
    status: "Configure",
    tone: "community" as const,
    items: [
      { label: "Auto Replies", href: "/auto-replies", icon: MessageCircleReply },
      { label: "Agents", href: "/agents", icon: Bot }
    ]
  }
];

export default function SettingsPage() {
  return (
    <>
      <SubNav
        items={[
          { label: "Overview", href: "/settings", active: true },
          { label: "Billing", href: "/billing" },
          { label: "Connections", href: "/connections" },
          { label: "Approvals", href: "/approvals" }
        ]}
      />
      <PageShell
        title="Settings"
        description="Review the operational settings surfaces that control billing, provider connections, safety queues, brand memory, and automation defaults."
      >
        <section className="grid gap-4 lg:grid-cols-2">
          {settingsSections.map((section) => (
            <div
              key={section.title}
              className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-[var(--color-text)]">{section.title}</h2>
                  <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">{section.description}</p>
                </div>
                <Badge tone={section.tone}>{section.status}</Badge>
              </div>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {section.items.map((item) => {
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-3 text-sm font-medium text-[var(--color-text)] transition hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface)]"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Icon size={16} aria-hidden="true" className="shrink-0 text-[var(--color-text-muted)]" />
                        <span className="truncate">{item.label}</span>
                      </span>
                      <ArrowRight size={15} aria-hidden="true" className="shrink-0 text-[var(--color-text-muted)]" />
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
        <section className="mt-5 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck size={20} aria-hidden="true" className="mt-0.5 text-[var(--color-primary)]" />
            <div>
              <h2 className="text-base font-semibold text-[var(--color-text)]">Production readiness</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--color-text-muted)]">
                Release checks require captured gate output and smoke evidence before production can be marked ready.
                Operator confirmations keep the audit trail visible without bypassing those requirements.
              </p>
            </div>
          </div>
        </section>
      </PageShell>
    </>
  );
}
