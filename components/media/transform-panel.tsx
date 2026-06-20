"use client";

import { Crop, ImageIcon, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { MediaAsset, MediaTransformSettings } from "@/lib/media/types";

type TransformPanelProps = {
  asset: MediaAsset | null;
};

const platformPresets: Array<{
  label: string;
  value: NonNullable<MediaTransformSettings["platform"]>;
  width: number;
  height: number;
}> = [
  { label: "LinkedIn", value: "linkedin", width: 1200, height: 627 },
  { label: "Instagram", value: "instagram", width: 1080, height: 1080 },
  { label: "TikTok", value: "tiktok", width: 1080, height: 1920 },
  { label: "X", value: "x", width: 1600, height: 900 }
];

function buildTransformToken(settings: MediaTransformSettings) {
  return [
    `w-${settings.width}`,
    `h-${settings.height}`,
    `c-${settings.crop}`,
    `fo-${settings.focus}`,
    `q-${settings.quality}`,
    `f-${settings.format}`
  ].join(",");
}

function backgroundImage(url: string) {
  return `url("${url.replace(/"/g, "%22")}")`;
}

export function TransformPanel({ asset }: TransformPanelProps) {
  const [platform, setPlatform] = useState<NonNullable<MediaTransformSettings["platform"]>>("instagram");
  const preset = platformPresets.find((item) => item.value === platform) ?? platformPresets[1];
  const settings: MediaTransformSettings = {
    platform,
    width: preset.width,
    height: preset.height,
    crop: "maintain_ratio",
    focus: "auto",
    format: "auto",
    quality: 82
  };
  const transformToken = buildTransformToken(settings);

  if (!asset) {
    return (
      <section className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-white p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-surface)] text-[var(--color-text-muted)]">
            <SlidersHorizontal size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-semibold">Transform preview</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">Select an asset to prepare platform crops.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white p-5">
      <div className="flex flex-col gap-3 border-b border-[var(--color-border)] pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-teal-50 text-teal-700">
            <Crop size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-semibold">Transform preview</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">{asset.name}</p>
          </div>
        </div>
        <Badge tone={asset.mediaType === "video" ? "community" : "primary"}>{asset.mediaType}</Badge>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="aspect-[4/3] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          {asset.mediaType === "image" ? (
            <div
              className="h-full w-full bg-cover bg-center"
              role="img"
              aria-label={asset.altText ?? asset.name}
              style={{ backgroundImage: backgroundImage(asset.thumbnailUrl ?? asset.url) }}
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-[var(--color-text-muted)]">
              <ImageIcon size={34} aria-hidden="true" />
              <span className="text-sm font-medium">Video thumbnail</span>
            </div>
          )}
        </div>

        <div className="grid content-start gap-4">
          <label className="grid gap-2 text-sm font-medium" htmlFor="transform-platform">
            Platform crop
            <select
              id="transform-platform"
              className="h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white px-3 text-sm font-normal outline-none transition focus:border-[var(--color-primary)]"
              value={platform}
              onChange={(event) => setPlatform(event.target.value as NonNullable<MediaTransformSettings["platform"]>)}
            >
              {platformPresets.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label} {item.width} x {item.height}
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-[var(--radius-md)] bg-[var(--color-surface)] p-3">
            <p className="text-xs font-semibold uppercase text-[var(--color-text-muted)]">ImageKit transform</p>
            <p className="mt-2 break-all font-mono text-xs text-[var(--color-text)]">tr:{transformToken}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
              <p className="text-xs text-[var(--color-text-muted)]">Original</p>
              <p className="mt-1 font-semibold">
                {asset.width && asset.height ? `${asset.width} x ${asset.height}` : "Pending"}
              </p>
            </div>
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
              <p className="text-xs text-[var(--color-text-muted)]">Output</p>
              <p className="mt-1 font-semibold">
                {preset.width} x {preset.height}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
