"use client";

import { useEffect, useRef, useState } from "react";
import { MediaGrid } from "@/components/media/media-grid";
import { addMediaLibraryAssets, useMediaLibraryAssets } from "@/components/media/media-library-store";
import { TransformPanel } from "@/components/media/transform-panel";
import { UploadDropzone } from "@/components/media/upload-dropzone";
import { imageKitUploadAuthSchema } from "@/lib/media/upload-auth";
import { uploadMediaFile } from "@/lib/media/upload";

export function MediaLibrary() {
  const assets = useMediaLibraryAssets();
  const [selectedId, setSelectedId] = useState<string | null>(assets[0]?.id ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const selectedAsset = assets.find((asset) => asset.id === selectedId) ?? assets[0] ?? null;
  const displayedSelectedId = selectedAsset?.id ?? null;

  useEffect(
    () => () => {
      for (const objectUrl of objectUrlsRef.current) {
        URL.revokeObjectURL(objectUrl);
      }
    },
    []
  );

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

      addMediaLibraryAssets(uploadedAssets);
      setSelectedId(uploadedAssets[0]?.id ?? selectedId);

      const failedUploads = results.length - uploadedAssets.length;
      if (failedUploads > 0) {
        setError(`${failedUploads} upload${failedUploads === 1 ? "" : "s"} failed. Added ${uploadedAssets.length} successful file${uploadedAssets.length === 1 ? "" : "s"}.`);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="grid gap-5">
      <UploadDropzone uploading={uploading} error={error} onUpload={uploadFiles} />
      <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
        <MediaGrid assets={assets} selectedId={displayedSelectedId} onSelect={(asset) => setSelectedId(asset.id)} />
        <TransformPanel asset={selectedAsset} />
      </div>
    </div>
  );
}
