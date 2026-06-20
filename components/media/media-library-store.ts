"use client";

import { useEffect, useState } from "react";
import { mockMediaAssets } from "@/lib/media/mock-assets";
import { mediaAssetSchema, type MediaAsset } from "@/lib/media/types";

const storageKey = "automated-content.media-assets.v1";
const updateEventName = "automated-content:media-library-updated";

let mediaAssets: MediaAsset[] | null = null;

function isBrowser() {
  return typeof window !== "undefined";
}

function uniqueAssets(assets: MediaAsset[]) {
  const seen = new Set<string>();
  const unique: MediaAsset[] = [];

  for (const asset of assets) {
    if (!seen.has(asset.id)) {
      seen.add(asset.id);
      unique.push(asset);
    }
  }

  return unique;
}

function readStoredAssets() {
  if (!isBrowser()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];

    return mediaAssetSchema.array().parse(parsed);
  } catch {
    return [];
  }
}

function writeStoredAssets(assets: MediaAsset[]) {
  if (!isBrowser()) {
    return;
  }

  const durableAssets = assets.filter((asset) => !asset.url.startsWith("blob:"));

  window.localStorage.setItem(storageKey, JSON.stringify(durableAssets));
}

function loadAssets() {
  if (!mediaAssets) {
    mediaAssets = uniqueAssets([...readStoredAssets(), ...mockMediaAssets]);
  }

  return mediaAssets;
}

function reloadAssets() {
  mediaAssets = uniqueAssets([...readStoredAssets(), ...mockMediaAssets]);
  return mediaAssets;
}

function notifyUpdated() {
  if (isBrowser()) {
    window.dispatchEvent(new Event(updateEventName));
  }
}

export function getMediaLibraryAssets() {
  return loadAssets();
}

export function addMediaLibraryAssets(assets: MediaAsset[]) {
  mediaAssets = uniqueAssets([...assets, ...loadAssets()]);
  writeStoredAssets(mediaAssets);
  notifyUpdated();
}

export function useMediaLibraryAssets() {
  const [assets, setAssets] = useState<MediaAsset[]>(() => getMediaLibraryAssets());

  useEffect(() => {
    const handleUpdate = () => setAssets([...getMediaLibraryAssets()]);
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) {
        return;
      }

      setAssets([...reloadAssets()]);
    };

    window.addEventListener(updateEventName, handleUpdate);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(updateEventName, handleUpdate);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  return assets;
}
