"use client";

import { AlertTriangle, ImageIcon, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { platformLabels, type PlatformVariant } from "@/lib/agents/schemas/platform-variant";

type PlatformPreviewCardProps = {
  variant: PlatformVariant;
};

function backgroundImage(url: string) {
  return `url("${url.replace(/"/g, "%22")}")`;
}

function countCharacters(variant: PlatformVariant) {
  return [variant.hook, variant.body, variant.cta, variant.hashtags.join(" ")].join(" ").length;
}

export function PlatformPreviewCard({ variant }: PlatformPreviewCardProps) {
  const firstMedia = variant.media[0] ?? null;
  const statusTone = variant.policyStatus === "block" ? "critical" : variant.policyStatus === "warn" ? "premium" : "success";

  return (
    <aside className="grid gap-4 lg:border-l lg:border-[var(--color-border)] lg:pl-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{platformLabels[variant.platform]} preview</h3>
          <p className="mt-1 font-mono text-xs text-[var(--color-text-muted)]">{countCharacters(variant)} characters</p>
        </div>
        <Badge tone={statusTone}>{variant.policyStatus}</Badge>
      </div>

      <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="aspect-[4/3]">
          {firstMedia?.mediaType === "image" ? (
            <div
              className="h-full w-full bg-cover bg-center"
              role="img"
              aria-label={firstMedia.altText ?? firstMedia.name}
              style={{ backgroundImage: backgroundImage(firstMedia.thumbnailUrl ?? firstMedia.url) }}
            />
          ) : firstMedia?.mediaType === "video" ? (
            <div className="flex h-full w-full items-center justify-center bg-teal-50 text-teal-700">
              <Video size={34} aria-hidden="true" />
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[var(--color-text-muted)]">
              <ImageIcon size={34} aria-hidden="true" />
            </div>
          )}
        </div>
        <div className="grid gap-2 border-t border-[var(--color-border)] bg-white p-3">
          <p className="line-clamp-2 text-sm font-semibold">{variant.hook}</p>
          <p className="line-clamp-4 text-sm leading-6 text-[var(--color-text-muted)]">{variant.body}</p>
          <p className="text-sm font-medium text-[var(--color-primary)]">{variant.cta}</p>
        </div>
      </div>

      {variant.policyWarnings.length > 0 ? (
        <div className="grid gap-2 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {variant.policyWarnings.map((warning) => (
            <p key={warning} className="flex gap-2">
              <AlertTriangle className="mt-0.5 shrink-0" size={15} aria-hidden="true" />
              <span>{warning}</span>
            </p>
          ))}
        </div>
      ) : null}
    </aside>
  );
}
