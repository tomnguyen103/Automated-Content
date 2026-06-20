"use client";

import { Check, ImageIcon, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { MediaAsset } from "@/lib/media/types";

type MediaGridProps = {
  assets: MediaAsset[];
  selectedId: string | null;
  onSelect: (asset: MediaAsset) => void;
};

function formatBytes(bytes: number | undefined) {
  if (!bytes) {
    return "Unknown size";
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function backgroundImage(url: string) {
  return `url("${url.replace(/"/g, "%22")}")`;
}

export function MediaGrid({ assets, onSelect, selectedId }: MediaGridProps) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white p-5">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] pb-4">
        <div>
          <h2 className="text-base font-semibold">Library</h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">{assets.length} assets ready</p>
        </div>
        <Badge tone="community">Phase 5</Badge>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {assets.map((asset) => {
          const selected = asset.id === selectedId;
          const Icon = asset.mediaType === "video" ? Video : ImageIcon;

          return (
            <button
              key={asset.id}
              className={`group overflow-hidden rounded-[var(--radius-md)] border text-left transition ${
                selected
                  ? "border-[var(--color-primary)] ring-2 ring-rose-100"
                  : "border-[var(--color-border)] hover:border-[var(--color-border-strong)]"
              }`}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(asset)}
            >
              <div className="relative aspect-[4/3] bg-[var(--color-surface)]">
                {asset.mediaType === "image" ? (
                  <div
                    className="h-full w-full bg-cover bg-center"
                    role="img"
                    aria-label={asset.altText ?? asset.name}
                    style={{ backgroundImage: backgroundImage(asset.thumbnailUrl ?? asset.url) }}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-teal-50 text-teal-700">
                    <Video size={36} aria-hidden="true" />
                  </div>
                )}
                <span className="absolute left-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] bg-white/90 text-[var(--color-text)] shadow-sm">
                  <Icon size={16} aria-hidden="true" />
                </span>
                {selected ? (
                  <span className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-primary)] text-white shadow-sm">
                    <Check size={16} aria-hidden="true" />
                  </span>
                ) : null}
              </div>
              <div className="grid gap-2 p-3">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <p className="truncate text-sm font-semibold">{asset.name}</p>
                  <Badge tone={asset.provider === "imagekit" ? "primary" : "neutral"}>{asset.provider}</Badge>
                </div>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {asset.width && asset.height ? `${asset.width} x ${asset.height}` : "Dimensions pending"} / {formatBytes(asset.sizeBytes)}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
