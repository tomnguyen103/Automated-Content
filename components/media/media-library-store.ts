"use client";

import { useEffect, useState } from "react";
import type { MediaAsset } from "@/lib/media/types";

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

function loadAssets() {
  if (!mediaAssets) {
    mediaAssets = [];
  }

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

export function setMediaLibraryAssets(assets: MediaAsset[]) {
  mediaAssets = uniqueAssets(assets);
  notifyUpdated();
}

export function addMediaLibraryAssets(assets: MediaAsset[]) {
  mediaAssets = uniqueAssets([...assets, ...loadAssets()]);
  notifyUpdated();
}

export function useMediaLibraryAssets() {
  const [assets, setAssets] = useState<MediaAsset[]>(() => getMediaLibraryAssets());

  useEffect(() => {
    const handleUpdate = () => setAssets([...getMediaLibraryAssets()]);

    window.addEventListener(updateEventName, handleUpdate);

    return () => {
      window.removeEventListener(updateEventName, handleUpdate);
    };
  }, []);

  return assets;
}
