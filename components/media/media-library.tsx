"use client";

import { useEffect, useRef, useState } from "react";
import { MediaGrid } from "@/components/media/media-grid";
import {
  addMediaLibraryAssets,
  setMediaLibraryAssets,
  useMediaLibraryAssets
} from "@/components/media/media-library-store";
import { TransformPanel } from "@/components/media/transform-panel";
import { UploadDropzone } from "@/components/media/upload-dropzone";
import { imageKitUploadAuthSchema } from "@/lib/media/upload-auth";
import { mediaAssetSchema, type MediaAsset } from "@/lib/media/types";
import { uploadMediaFile } from "@/lib/media/upload";
import { z } from "zod";

const mediaAssetsResponseSchema = z.object({
  assets: z.array(mediaAssetSchema)
});

export function MediaLibrary() {
  const assets = useMediaLibraryAssets();
  const [selectedId, setSelectedId] = useState<string | null>(assets[0]?.id ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const selectedAsset = assets.find((asset) => asset.id === selectedId) ?? assets[0] ?? null;
  const displayedSelectedId = selectedAsset?.id ?? null;

  useEffect(() => {
    let cancelled = false;

    const loadAssets = async () => {
      try {
        const response = await fetch("/api/media/assets");
        const payload = await response.json();

        if (!response.ok) {
          const message = payload && typeof payload === "object" && "error" in payload ? String(payload.error) : "Media library failed to load.";
          throw new Error(message);
        }

        const parsed = mediaAssetsResponseSchema.parse(payload);

        if (cancelled) {
          return;
        }

        setMediaLibraryAssets(parsed.assets);
        setSelectedId((currentId) =>
          currentId && parsed.assets.some((asset) => asset.id === currentId)
            ? currentId
            : (parsed.assets[0]?.id ?? null)
        );
      } catch (caughtError) {
        if (!cancelled) {
          setError(caughtError instanceof Error ? caughtError.message : "Media library failed to load.");
        }
      }
    };

    void loadAssets();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      for (const objectUrl of objectUrlsRef.current) {
        URL.revokeObjectURL(objectUrl);
      }
    },
    []
  );

  const persistUploadedAssets = async (assetsToPersist: MediaAsset[]) => {
    const response = await fetch("/api/media/assets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        assets: assetsToPersist
      })
    });
    const payload = await response.json();

    if (!response.ok) {
      const message = payload && typeof payload === "object" && "error" in payload ? String(payload.error) : "Media asset save failed.";
      throw new Error(message);
    }

    return mediaAssetsResponseSchema.parse(payload).assets;
  };

  const uploadFiles = async (files: File[]) => {
    setUploading(true);
    setError(null);

    try {
      const response = await fetch("/api/media/upload-auth");
      const payload = await response.json();

      if (!response.ok) {
        const message = payload && typeof payload === "object" && "error" in payload ? String(payload.error) : "Upload auth failed.";
        throw new Error(message);
      }

      const uploadAuth = imageKitUploadAuthSchema.parse(payload);
      const results = await Promise.allSettled(files.map((file) => uploadMediaFile(file, uploadAuth)));
      const uploadedAssets = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));

      if (uploadedAssets.length === 0) {
        const rejected = results.find((result) => result.status === "rejected");
        throw new Error(rejected?.reason instanceof Error ? rejected.reason.message : "Upload failed.");
      }

      objectUrlsRef.current.push(...uploadedAssets.map((asset) => asset.url).filter((url) => url.startsWith("blob:")));

      const savedAssets = await persistUploadedAssets(uploadedAssets);

      addMediaLibraryAssets(savedAssets);
      setSelectedId(savedAssets[0]?.id ?? selectedId);

      const failedUploads = results.length - savedAssets.length;
      if (failedUploads > 0) {
        setError(`${failedUploads} upload${failedUploads === 1 ? "" : "s"} failed. Added ${savedAssets.length} successful file${savedAssets.length === 1 ? "" : "s"}.`);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="grid gap-5">
      <div id="uploads" className="scroll-mt-20">
        <UploadDropzone uploading={uploading} error={error} onUpload={uploadFiles} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
        <div id="library" className="scroll-mt-20">
          <MediaGrid assets={assets} selectedId={displayedSelectedId} onSelect={(asset) => setSelectedId(asset.id)} />
        </div>
        <div id="transforms" className="scroll-mt-20">
          <div id="crops" className="scroll-mt-20">
            <TransformPanel asset={selectedAsset} />
          </div>
        </div>
      </div>
    </div>
  );
}
