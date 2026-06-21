import "server-only";

import { desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { mediaAssets, type MediaAssetRow } from "@/db/schema";
import { isDatabaseConfigured } from "@/lib/env";
import { mockMediaAssets } from "@/lib/media/mock-assets";
import {
  mediaAssetSchema,
  mediaTransformSettingsSchema,
  type MediaAsset,
  type MediaTransformSettings
} from "@/lib/media/types";

const memoryAssetsByWorkspace = new Map<string, MediaAsset[]>();

export class MediaAssetConflictError extends Error {
  constructor(message = "Media asset already belongs to a different workspace.") {
    super(message);
    this.name = "MediaAssetConflictError";
  }
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

function fallbackAssetsForWorkspace(workspaceId: string) {
  return uniqueAssets([...(memoryAssetsByWorkspace.get(workspaceId) ?? []), ...mockMediaAssets]);
}

export async function listMediaAssetsForWorkspace({
  allowMemoryFallback = false,
  workspaceId
}: {
  workspaceId: string;
  allowMemoryFallback?: boolean;
}) {
  if (allowMemoryFallback || !isDatabaseConfigured) {
    return fallbackAssetsForWorkspace(workspaceId);
  }

  const rows = await getDb()
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.workspaceId, workspaceId))
    .orderBy(desc(mediaAssets.createdAt));

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
  const normalizedAssets = assets.map((asset) =>
    normalizeAssetForWorkspace({ asset, uploadedByUserId, workspaceId })
  );

  if (allowMemoryFallback || !isDatabaseConfigured) {
    memoryAssetsByWorkspace.set(workspaceId, uniqueAssets([...normalizedAssets, ...fallbackAssetsForWorkspace(workspaceId)]));
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
