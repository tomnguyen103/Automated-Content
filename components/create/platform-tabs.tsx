"use client";

import { useMemo, useState } from "react";
import { MediaPicker } from "@/components/create/media-picker";
import { PlatformPreviewCard } from "@/components/create/platform-preview-card";
import { Badge } from "@/components/ui/badge";
import { platformLabels, type PlatformVariant } from "@/lib/agents/schemas/platform-variant";
import { getPolicyStatusForWarnings, replaceMediaWarnings } from "@/lib/media/platform-constraints";
import type { MediaAttachment } from "@/lib/media/types";

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
  const activeHashtagsValue = activeVariant?.hashtags.join(" ") ?? "";
  const [hashtagsDraft, setHashtagsDraft] = useState({
    variantId: activeVariant?.id ?? null,
    value: activeHashtagsValue
  });
  const hashtagsInput = hashtagsDraft.variantId === activeVariant?.id ? hashtagsDraft.value : activeHashtagsValue;

  const updateActiveVariant = (updates: Partial<PlatformVariant>) => {
    if (!activeVariant) {
      return;
    }

    onChange?.(
      variants.map((variant) => {
        if (variant.id !== activeVariant.id) {
          return variant;
        }

        const media = updates.media ?? variant.media;
        const policyWarnings =
          updates.media === undefined
            ? (updates.policyWarnings ?? variant.policyWarnings)
            : replaceMediaWarnings({
                platform: variant.platform,
                media,
                warnings: updates.policyWarnings ?? variant.policyWarnings
              });

        return {
          ...variant,
          ...updates,
          media,
          policyWarnings,
          policyStatus: getPolicyStatusForWarnings(policyWarnings)
        };
      })
    );
  };

  const parseHashtags = (value: string) =>
    value
      .split(/[\s,]+/)
      .map((tag) => tag.trim())
      .filter(Boolean);

  const updateHashtags = (value: string) => {
    const hashtags = parseHashtags(value);

    updateActiveVariant({
      hashtags
    });

    setHashtagsDraft({
      variantId: activeVariant?.id ?? null,
      value: hashtags.join(" ")
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

      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
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
            <Badge tone={activeVariant.policyStatus === "pass" ? "success" : activeVariant.policyStatus === "block" ? "critical" : "premium"}>
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
                value={hashtagsInput}
                onChange={(event) =>
                  setHashtagsDraft({
                    variantId: activeVariant.id,
                    value: event.target.value
                  })
                }
                onBlur={() => updateHashtags(hashtagsInput)}
              />
            </label>
            <MediaPicker
              media={activeVariant.media}
              onChange={(media: MediaAttachment[]) => updateActiveVariant({ media })}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {activeVariant.hashtags.map((tag) => (
              <Badge key={tag} tone="community">
                {tag}
              </Badge>
            ))}
          </div>
        </div>

        <PlatformPreviewCard variant={activeVariant} />
      </div>
    </section>
  );
}
