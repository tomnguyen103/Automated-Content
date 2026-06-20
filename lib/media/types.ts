import { z } from "zod";

export const mediaAssetTypeSchema = z.enum(["image", "video"]);
export const mediaProviderSchema = z.enum(["imagekit", "mock"]);
export const mediaPlatformSchema = z.enum([
  "linkedin",
  "x",
  "instagram",
  "facebook",
  "tiktok",
  "threads"
]);

export const mediaTransformSettingsSchema = z.object({
  platform: mediaPlatformSchema.optional(),
  width: z.number().int().positive().max(8192).optional(),
  height: z.number().int().positive().max(8192).optional(),
  crop: z.enum(["maintain_ratio", "force", "at_least", "at_max"]).default("maintain_ratio"),
  focus: z.enum(["auto", "center", "top", "bottom", "left", "right"]).default("auto"),
  format: z.enum(["auto", "jpg", "png", "webp", "mp4"]).default("auto"),
  quality: z.number().int().min(1).max(100).default(82)
});

const mediaFileFields = {
  provider: mediaProviderSchema.default("mock"),
  name: z.string().min(1).max(160),
  url: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
  mediaType: mediaAssetTypeSchema,
  mimeType: z.string().min(1).max(120),
  width: z.number().int().positive().max(16384).optional(),
  height: z.number().int().positive().max(16384).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  altText: z.string().max(280).optional()
};

export const mediaAttachmentSchema = z.object({
  assetId: z.string().min(1),
  ...mediaFileFields
});

export const mediaAssetSchema = z.object({
  id: z.string().min(1),
  ...mediaFileFields,
  workspaceId: z.string().min(1),
  uploadedByUserId: z.string().min(1),
  fileName: z.string().min(1).max(240),
  imagekitFileId: z.string().min(1).optional(),
  folder: z.string().min(1).max(240).optional(),
  tags: z.array(z.string().min(1).max(64)).max(16).default([]),
  transformationDefaults: mediaTransformSettingsSchema.default({
    crop: "maintain_ratio",
    focus: "auto",
    format: "auto",
    quality: 82
  }),
  createdAt: z.string().min(1)
});

export type MediaAssetType = z.infer<typeof mediaAssetTypeSchema>;
export type MediaProvider = z.infer<typeof mediaProviderSchema>;
export type MediaTransformSettings = z.infer<typeof mediaTransformSettingsSchema>;
export type MediaAttachment = z.infer<typeof mediaAttachmentSchema>;
export type MediaAsset = z.infer<typeof mediaAssetSchema>;
