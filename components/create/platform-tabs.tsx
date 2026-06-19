"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { platformLabels, type PlatformVariant } from "@/lib/agents/schemas/platform-variant";

type PlatformTabsProps = {
  variants: PlatformVariant[];
};

export function PlatformTabs({ variants }: PlatformTabsProps) {
  const [activeId, setActiveId] = useState<string | null>(variants[0]?.id ?? null);
  const activeVariant = useMemo(
    () => variants.find((variant) => variant.id === activeId) ?? variants[0] ?? null,
    [activeId, variants]
  );

  if (variants.length === 0 || !activeVariant) {
    return (
      <section className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-white p-5">
        <h2 className="text-base font-semibold">Platform variants</h2>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">Platform copy will appear here.</p>
      </section>
    );
  }

  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white">
      <div className="overflow-x-auto border-b border-[var(--color-border)] p-2">
        <div className="flex min-h-10 gap-1">
          {variants.map((variant) => (
            <button
              key={variant.id}
              className={`whitespace-nowrap rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium transition ${
                variant.id === activeVariant.id
                  ? "bg-rose-50 text-[var(--color-primary)]"
                  : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
              }`}
              type="button"
              onClick={() => setActiveId(variant.id)}
            >
              {platformLabels[variant.platform]}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">{activeVariant.title}</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">{activeVariant.hook}</p>
          </div>
          <Badge tone={activeVariant.policyStatus === "pass" ? "success" : "premium"}>
            {activeVariant.policyStatus}
          </Badge>
        </div>

        <div className="mt-4 rounded-[var(--radius-md)] bg-[var(--color-surface)] p-4">
          <p className="whitespace-pre-wrap text-sm leading-6">{activeVariant.body}</p>
          <p className="mt-4 text-sm font-medium">{activeVariant.cta}</p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {activeVariant.hashtags.map((tag) => (
            <Badge key={tag} tone="community">
              {tag}
            </Badge>
          ))}
        </div>

        {activeVariant.policyWarnings.length > 0 ? (
          <div className="mt-4 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {activeVariant.policyWarnings.join(" ")}
          </div>
        ) : null}
      </div>
    </section>
  );
}
