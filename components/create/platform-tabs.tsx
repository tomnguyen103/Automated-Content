"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { platformLabels, type PlatformVariant } from "@/lib/agents/schemas/platform-variant";

type PlatformTabsProps = {
  variants: PlatformVariant[];
  onChange?: (variants: PlatformVariant[]) => void;
};

export function PlatformTabs({ onChange, variants }: PlatformTabsProps) {
  const [activeId, setActiveId] = useState<string | null>(variants[0]?.id ?? null);
  const activeVariant = useMemo(
    () => variants.find((variant) => variant.id === activeId) ?? variants[0] ?? null,
    [activeId, variants]
  );

  const updateActiveVariant = (updates: Partial<PlatformVariant>) => {
    if (!activeVariant) {
      return;
    }

    onChange?.(
      variants.map((variant) =>
        variant.id === activeVariant.id
          ? {
              ...variant,
              ...updates
            }
          : variant
      )
    );
  };

  const updateHashtags = (value: string) => {
    updateActiveVariant({
      hashtags: value
        .split(/[\s,]+/)
        .map((tag) => tag.trim())
        .filter(Boolean)
    });
  };

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
          <div className="grid flex-1 gap-3">
            <label className="grid gap-2 text-sm font-medium" htmlFor={`variant-title-${activeVariant.id}`}>
              Title
              <input
                id={`variant-title-${activeVariant.id}`}
                className="h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-sm font-normal outline-none transition focus:border-[var(--color-primary)]"
                value={activeVariant.title}
                onChange={(event) => updateActiveVariant({ title: event.target.value })}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium" htmlFor={`variant-hook-${activeVariant.id}`}>
              Hook
              <textarea
                id={`variant-hook-${activeVariant.id}`}
                className="min-h-20 resize-y rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm font-normal leading-6 outline-none transition focus:border-[var(--color-primary)]"
                value={activeVariant.hook}
                onChange={(event) => updateActiveVariant({ hook: event.target.value })}
              />
            </label>
          </div>
          <Badge tone={activeVariant.policyStatus === "pass" ? "success" : "premium"}>
            {activeVariant.policyStatus}
          </Badge>
        </div>

        <div className="mt-4 grid gap-3">
          <label className="grid gap-2 text-sm font-medium" htmlFor={`variant-body-${activeVariant.id}`}>
            Body
            <textarea
              id={`variant-body-${activeVariant.id}`}
              className="min-h-40 resize-y rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-normal leading-6 outline-none transition focus:border-[var(--color-primary)]"
              value={activeVariant.body}
              onChange={(event) => updateActiveVariant({ body: event.target.value })}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium" htmlFor={`variant-cta-${activeVariant.id}`}>
            CTA
            <input
              id={`variant-cta-${activeVariant.id}`}
              className="h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-sm font-normal outline-none transition focus:border-[var(--color-primary)]"
              value={activeVariant.cta}
              onChange={(event) => updateActiveVariant({ cta: event.target.value })}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium" htmlFor={`variant-hashtags-${activeVariant.id}`}>
            Hashtags
            <input
              id={`variant-hashtags-${activeVariant.id}`}
              className="h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-sm font-normal outline-none transition focus:border-[var(--color-primary)]"
              value={activeVariant.hashtags.join(" ")}
              onChange={(event) => updateHashtags(event.target.value)}
            />
          </label>
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
