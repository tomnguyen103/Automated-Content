"use client";

import { ImagePlus, Loader2, UploadCloud } from "lucide-react";
import { type ChangeEvent, useRef } from "react";
import { Button } from "@/components/ui/button";

type UploadDropzoneProps = {
  uploading: boolean;
  error: string | null;
  onUpload: (files: File[]) => Promise<void> | void;
};

export function UploadDropzone({ error, onUpload, uploading }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);

    if (files.length > 0) {
      await onUpload(files);
      event.target.value = "";
    }
  };

  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-rose-50 text-[var(--color-primary)]">
            <UploadCloud size={19} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-semibold">Upload asset</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">Images and short videos for platform variants.</p>
          </div>
        </div>
        <div>
          <input
            ref={inputRef}
            id="media-upload-input"
            className="sr-only"
            type="file"
            accept="image/*,video/*"
            multiple
            aria-label="Upload media file"
            onChange={handleFiles}
          />
          <Button disabled={uploading} variant="outline" onClick={() => inputRef.current?.click()}>
            {uploading ? <Loader2 className="animate-spin" size={16} /> : <ImagePlus size={16} />}
            {uploading ? "Uploading" : "Choose files"}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-[var(--radius-md)] border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
    </section>
  );
}
