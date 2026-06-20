import type { PlatformPolicyStatus, SocialPlatform } from "@/lib/agents/schemas/platform-variant";
import type { MediaAttachment } from "@/lib/media/types";

const megabyte = 1024 * 1024;

type PlatformMediaRule = {
  maxAssets: number;
  maxImageBytes: number;
  maxVideoBytes: number;
  allowedTypes: Array<MediaAttachment["mediaType"]>;
  requiresVideo?: boolean;
  minAspectRatio?: number;
  maxAspectRatio?: number;
};

const platformMediaRules: Record<SocialPlatform, PlatformMediaRule> = {
  linkedin: {
    maxAssets: 9,
    maxImageBytes: 10 * megabyte,
    maxVideoBytes: 200 * megabyte,
    allowedTypes: ["image", "video"]
  },
  x: {
    maxAssets: 4,
    maxImageBytes: 5 * megabyte,
    maxVideoBytes: 512 * megabyte,
    allowedTypes: ["image", "video"]
  },
  instagram: {
    maxAssets: 10,
    maxImageBytes: 8 * megabyte,
    maxVideoBytes: 100 * megabyte,
    allowedTypes: ["image", "video"],
    minAspectRatio: 0.8,
    maxAspectRatio: 1.91
  },
  facebook: {
    maxAssets: 10,
    maxImageBytes: 10 * megabyte,
    maxVideoBytes: 200 * megabyte,
    allowedTypes: ["image", "video"]
  },
  tiktok: {
    maxAssets: 1,
    maxImageBytes: 8 * megabyte,
    maxVideoBytes: 250 * megabyte,
    allowedTypes: ["video"],
    requiresVideo: true,
    minAspectRatio: 0.45,
    maxAspectRatio: 0.75
  },
  threads: {
    maxAssets: 10,
    maxImageBytes: 8 * megabyte,
    maxVideoBytes: 100 * megabyte,
    allowedTypes: ["image", "video"],
    minAspectRatio: 0.8,
    maxAspectRatio: 1.91
  }
};

const mediaWarningPrefix = "Media:";

function formatMegabytes(bytes: number) {
  return `${Math.round(bytes / megabyte)} MB`;
}

function articleFor(value: string) {
  return /^[aeiou]/i.test(value) ? "an" : "a";
}

export function getPolicyStatusForWarnings(warnings: string[]): PlatformPolicyStatus {
  if (warnings.some((warning) => warning.startsWith("Avoid claim"))) {
    return "block";
  }

  return warnings.length > 0 ? "warn" : "pass";
}

export function getPlatformMediaWarnings(platform: SocialPlatform, media: MediaAttachment[] = []) {
  const rule = platformMediaRules[platform];
  const warnings: string[] = [];

  if (rule.requiresVideo && media.length === 0) {
    warnings.push(`${mediaWarningPrefix} TikTok variants need a video attachment before publishing.`);
  }

  if (media.length > rule.maxAssets) {
    warnings.push(`${mediaWarningPrefix} ${platform} supports up to ${rule.maxAssets} attached asset${rule.maxAssets === 1 ? "" : "s"}.`);
  }

  for (const asset of media) {
    if (!rule.allowedTypes.includes(asset.mediaType)) {
      warnings.push(`${mediaWarningPrefix} ${asset.name} is ${articleFor(asset.mediaType)} ${asset.mediaType}, which is not supported for ${platform}.`);
      continue;
    }

    const byteLimit = asset.mediaType === "video" ? rule.maxVideoBytes : rule.maxImageBytes;

    if (asset.sizeBytes && asset.sizeBytes > byteLimit) {
      warnings.push(`${mediaWarningPrefix} ${asset.name} is over the ${formatMegabytes(byteLimit)} ${asset.mediaType} guidance.`);
    }

    if (asset.width && asset.height && rule.minAspectRatio && rule.maxAspectRatio) {
      const aspectRatio = asset.width / asset.height;

      if (aspectRatio < rule.minAspectRatio || aspectRatio > rule.maxAspectRatio) {
        warnings.push(`${mediaWarningPrefix} ${asset.name} should be cropped for ${platform} before publishing.`);
      }
    }
  }

  return warnings.slice(0, 8);
}

export function replaceMediaWarnings({
  media,
  platform,
  warnings
}: {
  platform: SocialPlatform;
  media: MediaAttachment[];
  warnings: string[];
}) {
  const nonMediaWarnings = warnings.filter((warning) => !warning.startsWith(mediaWarningPrefix));

  return [...nonMediaWarnings, ...getPlatformMediaWarnings(platform, media)].slice(0, 8);
}
