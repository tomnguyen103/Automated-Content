import { z } from "zod";
import { mediaAssetSchema, type MediaAsset, type MediaAssetType } from "@/lib/media/types";
import type { ImageKitUploadAuth } from "@/lib/media/upload-auth";

const imageKitUploadResponseSchema = z
  .object({
    fileId: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    url: z.string().url(),
    thumbnailUrl: z.string().url().optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    size: z.number().int().nonnegative().optional(),
    fileType: z.string().optional()
  })
  .passthrough();

function getMediaType(file: File, fileType?: string): MediaAssetType {
  const normalizedFileType = fileType?.toLowerCase() ?? "";

  if (normalizedFileType === "video" || normalizedFileType.startsWith("video/") || file.type.startsWith("video/")) {
    return "video";
  }

  return "image";
}

function getAssetName(fileName: string, fallback: string | undefined) {
  return (fallback ?? fileName.replace(/\.[^.]+$/, "")) || fileName;
}

async function getImageDimensions(file: File, url: string) {
  if (!file.type.startsWith("image/")) {
    return {};
  }

  return new Promise<{ width?: number; height?: number }>((resolve) => {
    const image = new Image();

    image.onload = () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight
      });
    };
    image.onerror = () => resolve({});
    image.src = url;
  });
}

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Unable to read local preview media file."));
    };
    reader.onerror = () => reject(new Error("Unable to read local preview media file."));
    reader.readAsDataURL(file);
  });
}

function createBaseAsset({
  auth,
  file,
  id,
  mediaType,
  name,
  url,
  thumbnailUrl,
  width,
  height,
  imagekitFileId
}: {
  auth: ImageKitUploadAuth;
  file: File;
  id: string;
  mediaType: MediaAssetType;
  name: string;
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  imagekitFileId?: string;
}) {
  return mediaAssetSchema.parse({
    id,
    workspaceId: auth.metadata.workspaceId,
    uploadedByUserId: auth.metadata.uploadedByUserId,
    provider: auth.metadata.provider,
    imagekitFileId,
    name,
    fileName: file.name,
    url,
    thumbnailUrl,
    mediaType,
    mimeType: file.type || (mediaType === "video" ? "video/mp4" : "image/png"),
    width,
    height,
    sizeBytes: file.size,
    folder: auth.folder,
    tags: auth.tags,
    transformationDefaults: {
      crop: "maintain_ratio",
      focus: "auto",
      format: "auto",
      quality: 82
    },
    createdAt: new Date().toISOString()
  });
}

async function createLocalPreviewAsset(file: File, auth: ImageKitUploadAuth): Promise<MediaAsset> {
  const url = await fileToDataUrl(file);
  const dimensions = await getImageDimensions(file, url);
  const mediaType = getMediaType(file);

  return createBaseAsset({
    auth,
    file,
    id: `media_${crypto.randomUUID()}`,
    mediaType,
    name: getAssetName(file.name, undefined),
    url,
    thumbnailUrl: mediaType === "image" ? url : undefined,
    width: dimensions.width,
    height: dimensions.height
  });
}

async function uploadImageKitAsset(file: File, auth: ImageKitUploadAuth): Promise<MediaAsset> {
  const formData = new FormData();

  formData.append("file", file);
  formData.append("fileName", file.name);
  formData.append("publicKey", auth.publicKey);
  formData.append("signature", auth.signature);
  formData.append("expire", String(auth.expire));
  formData.append("token", auth.token);
  formData.append("folder", auth.folder);
  formData.append("tags", auth.tags.join(","));

  const response = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    let message = "ImageKit upload failed.";

    try {
      const errorPayload = (await response.json()) as { message?: string; error?: string };
      message = errorPayload.message ?? errorPayload.error ?? message;
    } catch {
      // Keep the generic upload error when ImageKit returns a non-JSON response.
    }

    throw new Error(message);
  }

  const result = imageKitUploadResponseSchema.parse(await response.json());
  const mediaType = getMediaType(file, result.fileType);

  return createBaseAsset({
    auth,
    file,
    id: result.fileId ?? `media_${crypto.randomUUID()}`,
    imagekitFileId: result.fileId,
    mediaType,
    name: getAssetName(file.name, result.name),
    url: result.url,
    thumbnailUrl: result.thumbnailUrl,
    width: result.width,
    height: result.height
  });
}

export async function uploadMediaFile(file: File, auth: ImageKitUploadAuth): Promise<MediaAsset> {
  if (!auth.isConfigured) {
    return createLocalPreviewAsset(file, auth);
  }

  return uploadImageKitAsset(file, auth);
}
