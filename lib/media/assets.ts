import "server-only";

import { desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { mediaAssets, type MediaAssetRow } from "@/db/schema";
import { env, isDatabaseConfigured } from "@/lib/env";
import {
  createImageKitUploadFolder,
  isImageKitConfigured,
  sanitizeImageKitPathSegment
} from "@/lib/media/imagekit";
import { mockMediaAssets } from "@/lib/media/mock-assets";
import {
  mediaAssetSchema,
  mediaTransformSettingsSchema,
  type MediaAsset,
  type MediaTransformSettings
} from "@/lib/media/types";

const memoryAssetsByWorkspace = new Map<string, MediaAsset[]>();
export const mediaAssetListLimit = 100;

export class MediaAssetConflictError extends Error {
  constructor(message = "Media asset already belongs to a different workspace.") {
    super(message);
    this.name = "MediaAssetConflictError";
  }
}

export class MediaAssetProvenanceError extends Error {
  constructor(message = "Media asset provenance could not be verified.") {
    super(message);
    this.name = "MediaAssetProvenanceError";
  }
}

function normalizeUrlPrefix(value: string) {
  return value.replace(/\/+$/, "");
}

function isUrlFromEndpoint(value: string, endpoint: string) {
  const normalizedEndpoint = normalizeUrlPrefix(endpoint);
  const normalizedValue = normalizeUrlPrefix(value);

  return normalizedValue === normalizedEndpoint || normalizedValue.startsWith(`${normalizedEndpoint}/`);
}

function assertImageKitAssetProvenance({
  asset,
  workspaceId
}: {
  asset: MediaAsset;
  workspaceId: string;
}) {
  if (!isImageKitConfigured(env)) {
    throw new MediaAssetProvenanceError("ImageKit media cannot be saved until ImageKit is configured.");
  }

  if (!asset.imagekitFileId) {
    throw new MediaAssetProvenanceError("ImageKit media must include the ImageKit file id.");
  }

  const expectedFolder = createImageKitUploadFolder(workspaceId);
  const expectedWorkspaceTag = `workspace:${sanitizeImageKitPathSegment(workspaceId) || "workspace"}`;

  if (asset.folder !== expectedFolder) {
    throw new MediaAssetProvenanceError("ImageKit media must use the workspace upload folder.");
  }

  if (!asset.tags.includes("automated-content") || !asset.tags.includes(expectedWorkspaceTag)) {
    throw new MediaAssetProvenanceError("ImageKit media must include the expected workspace tags.");
  }

  if (!isUrlFromEndpoint(asset.url, env.IMAGEKIT_URL_ENDPOINT!)) {
    throw new MediaAssetProvenanceError("ImageKit media URL must come from the configured ImageKit endpoint.");
  }

  if (asset.thumbnailUrl && !isUrlFromEndpoint(asset.thumbnailUrl, env.IMAGEKIT_URL_ENDPOINT!)) {
    throw new MediaAssetProvenanceError("ImageKit media thumbnail URL must come from the configured ImageKit endpoint.");
  }
}

function assertMockAssetProvenance({
  allowMemoryFallback,
  asset
}: {
  allowMemoryFallback?: boolean;
  asset: MediaAsset;
}) {
  if (!allowMemoryFallback) {
    throw new MediaAssetProvenanceError("Mock media uploads are allowed only in local preview.");
  }

  const urls = [asset.url, asset.thumbnailUrl].filter((url): url is string => Boolean(url));

  if (urls.some((url) => !url.startsWith("data:"))) {
    throw new MediaAssetProvenanceError("Mock media uploads must use local data URLs.");
  }
}

export function assertMediaAssetProvenance({
  allowMemoryFallback,
  asset,
  uploadedByUserId,
  workspaceId
}: {
  workspaceId: string;
  uploadedByUserId: string;
  asset: MediaAsset;
  allowMemoryFallback?: boolean;
}) {
  if (asset.workspaceId !== workspaceId || asset.uploadedByUserId !== uploadedByUserId) {
    throw new MediaAssetProvenanceError("Media asset ownership metadata does not match the current workspace.");
  }

  if (asset.provider === "imagekit") {
    assertImageKitAssetProvenance({ asset, workspaceId });
    return;
  }

  assertMockAssetProvenance({ allowMemoryFallback, asset });
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

export function normalizeMediaAssetListLimit(value: number | string | undefined = mediaAssetListLimit) {
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : value;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return mediaAssetListLimit;
  }

  return Math.min(Math.floor(parsed), mediaAssetListLimit);
}

function parseTransformDefaults(value: Record<string, unknown>): MediaTransformSettings {
  const parsed = mediaTransformSettingsSchema.safeParse(value);

  if (parsed.success) {
    return parsed.data;
  }

  return {
    crop: "maintain_ratio",
    focus: "auto",
    format: "auto",
    quality: 82
  };
}

function metadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];

  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function mediaAssetRowToAsset(row: MediaAssetRow): MediaAsset {
  return mediaAssetSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    uploadedByUserId: row.uploadedByUserId,
    provider: row.provider,
    imagekitFileId: row.imagekitFileId ?? undefined,
    name: row.name,
    fileName: row.fileName,
    url: row.sourceUrl,
    thumbnailUrl: row.thumbnailUrl ?? undefined,
    mediaType: row.mediaType,
    mimeType: row.mimeType,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    sizeBytes: row.sizeBytes ?? undefined,
    folder: row.folder ?? undefined,
    tags: row.tags,
    transformationDefaults: parseTransformDefaults(row.transformationDefaults),
    altText: metadataString(row.metadata, "altText"),
    createdAt: row.createdAt.toISOString()
  });
}

function normalizeAssetForWorkspace({
  asset,
  uploadedByUserId,
  workspaceId
}: {
  asset: MediaAsset;
  uploadedByUserId: string;
  workspaceId: string;
}) {
  return mediaAssetSchema.parse({
    ...asset,
    workspaceId,
    uploadedByUserId
  });
}

function mockAssetsForWorkspace({
  uploadedByUserId,
  workspaceId
}: {
  uploadedByUserId: string;
  workspaceId: string;
}) {
  return mockMediaAssets.map((asset) =>
    normalizeAssetForWorkspace({
      asset,
      uploadedByUserId,
      workspaceId
    })
  );
}

function fallbackAssetsForWorkspace({
  uploadedByUserId,
  workspaceId
}: {
  uploadedByUserId: string;
  workspaceId: string;
}) {
  return uniqueAssets([
    ...(memoryAssetsByWorkspace.get(workspaceId) ?? []),
    ...mockAssetsForWorkspace({ uploadedByUserId, workspaceId })
  ]);
}

export async function listMediaAssetsForWorkspace({
  allowMemoryFallback = false,
  fallbackUploadedByUserId = "local-preview-user",
  limit = mediaAssetListLimit,
  workspaceId
}: {
  workspaceId: string;
  allowMemoryFallback?: boolean;
  fallbackUploadedByUserId?: string;
  limit?: number | string;
}) {
  const normalizedLimit = normalizeMediaAssetListLimit(limit);

  if (allowMemoryFallback || !isDatabaseConfigured) {
    return fallbackAssetsForWorkspace({
      uploadedByUserId: fallbackUploadedByUserId,
      workspaceId
    }).slice(0, normalizedLimit);
  }

  const rows = await getDb()
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.workspaceId, workspaceId))
    .orderBy(desc(mediaAssets.createdAt))
    .limit(normalizedLimit);

  return rows.map(mediaAssetRowToAsset);
}

export async function saveMediaAssetsForWorkspace({
  allowMemoryFallback = false,
  assets,
  uploadedByUserId,
  workspaceId
}: {
  workspaceId: string;
  uploadedByUserId: string;
  assets: MediaAsset[];
  allowMemoryFallback?: boolean;
}) {
  for (const asset of assets) {
    assertMediaAssetProvenance({ allowMemoryFallback, asset, uploadedByUserId, workspaceId });
  }

  const normalizedAssets = uniqueAssets(
    assets.map((asset) => normalizeAssetForWorkspace({ asset, uploadedByUserId, workspaceId }))
  );

  if (allowMemoryFallback || !isDatabaseConfigured) {
    memoryAssetsByWorkspace.set(
      workspaceId,
      uniqueAssets([
        ...normalizedAssets,
        ...fallbackAssetsForWorkspace({
          uploadedByUserId,
          workspaceId
        })
      ])
    );
    return normalizedAssets;
  }

  const now = new Date();
  const assetIds = [...new Set(normalizedAssets.map((asset) => asset.id))];
  const existingAssets = await getDb()
    .select({
      id: mediaAssets.id,
      workspaceId: mediaAssets.workspaceId
    })
    .from(mediaAssets)
    .where(inArray(mediaAssets.id, assetIds));
  const conflictingAsset = existingAssets.find((asset) => asset.workspaceId !== workspaceId);

  if (conflictingAsset) {
    throw new MediaAssetConflictError(`Media asset ${conflictingAsset.id} already belongs to a different workspace.`);
  }

  const rows = await getDb()
    .insert(mediaAssets)
    .values(
      normalizedAssets.map((asset) => ({
        id: asset.id,
        workspaceId,
        uploadedByUserId,
        provider: asset.provider,
        imagekitFileId: asset.imagekitFileId ?? null,
        name: asset.name,
        fileName: asset.fileName,
        mediaType: asset.mediaType,
        mimeType: asset.mimeType,
        sourceUrl: asset.url,
        thumbnailUrl: asset.thumbnailUrl ?? null,
        width: asset.width ?? null,
        height: asset.height ?? null,
        sizeBytes: asset.sizeBytes ?? null,
        folder: asset.folder ?? null,
        tags: asset.tags,
        transformationDefaults: asset.transformationDefaults,
        metadata: {
          altText: asset.altText ?? null
        },
        updatedAt: now
      }))
    )
    .onConflictDoUpdate({
      target: mediaAssets.id,
      setWhere: eq(mediaAssets.workspaceId, workspaceId),
      set: {
        provider: sql`excluded.provider`,
        imagekitFileId: sql`excluded.imagekit_file_id`,
        name: sql`excluded.name`,
        fileName: sql`excluded.file_name`,
        mediaType: sql`excluded.media_type`,
        mimeType: sql`excluded.mime_type`,
        sourceUrl: sql`excluded.source_url`,
        thumbnailUrl: sql`excluded.thumbnail_url`,
        width: sql`excluded.width`,
        height: sql`excluded.height`,
        sizeBytes: sql`excluded.size_bytes`,
        folder: sql`excluded.folder`,
        tags: sql`excluded.tags`,
        transformationDefaults: sql`excluded.transformation_defaults`,
        metadata: sql`excluded.metadata`,
        updatedAt: now
      }
    })
    .returning();

  if (rows.length !== normalizedAssets.length) {
    throw new MediaAssetConflictError("One or more media assets could not be saved for this workspace.");
  }

  return rows.map(mediaAssetRowToAsset);
}

export function clearMediaAssetsForTests() {
  memoryAssetsByWorkspace.clear();
}
