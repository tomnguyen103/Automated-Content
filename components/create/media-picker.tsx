"use client";

import { Check, ImagePlus, Link2Off, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMediaLibraryAssets } from "@/components/media/media-library-store";
import { createMediaAttachment } from "@/lib/media/mock-assets";
import type { MediaAttachment } from "@/lib/media/types";

type MediaPickerProps = {
  media: MediaAttachment[];
  onChange: (media: MediaAttachment[]) => void;
};

export function MediaPicker({ media, onChange }: MediaPickerProps) {
  const assets = useMediaLibraryAssets();
  const attachedIds = new Set(media.map((asset) => asset.assetId));

  const toggleAsset = (assetId: string) => {
    const asset = assets.find((item) => item.id === assetId);

    if (!asset) {
      return;
    }

    if (attachedIds.has(asset.id)) {
      onChange(media.filter((item) => item.assetId !== asset.id));
      return;
    }

    onChange([...media, createMediaAttachment(asset)]);
  };

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Media</h3>
        {media.length > 0 ? (
          <Button size="sm" variant="ghost" onClick={() => onChange([])}>
            <Link2Off size={15} />
            Clear
          </Button>
        ) : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {assets.map((asset) => {
          const selected = attachedIds.has(asset.id);
          const Icon = asset.mediaType === "video" ? Video : ImagePlus;

          return (
            <button
              key={asset.id}
              className={`flex min-h-16 items-center gap-3 rounded-[var(--radius-md)] border p-3 text-left transition ${
                selected
                  ? "border-rose-200 bg-rose-50"
                  : "border-[var(--color-border)] bg-white hover:bg-[var(--color-surface)]"
              }`}
              type="button"
              aria-pressed={selected}
              onClick={() => toggleAsset(asset.id)}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-white text-[var(--color-text-muted)]">
                {selected ? <Check size={16} /> : <Icon size={16} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{asset.name}</span>
                <span className="mt-1 block text-xs text-[var(--color-text-muted)]">
                  {asset.mediaType} / {asset.width} x {asset.height}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex min-h-7 flex-wrap gap-2">
        {media.length === 0 ? (
          <Badge tone="neutral">No media attached</Badge>
        ) : (
          media.map((asset) => (
            <Badge key={asset.assetId} tone={asset.mediaType === "video" ? "community" : "primary"}>
              {asset.name}
            </Badge>
          ))
        )}
      </div>
    </div>
  );
}
