import type { SocialPlatform } from "@/lib/agents/schemas/platform-variant";
import type { ProviderKey } from "@/lib/providers/types";

export const defaultProviderByPlatform: Record<SocialPlatform, ProviderKey> = {
  facebook: "meta",
  instagram: "meta",
  linkedin: "linkedin",
  threads: "meta",
  tiktok: "mock",
  x: "x"
};

export function isProviderCompatibleWithPlatform({
  allowMock = false,
  platform,
  provider
}: {
  allowMock?: boolean;
  platform: SocialPlatform;
  provider: ProviderKey;
}) {
  return (allowMock && provider === "mock") || defaultProviderByPlatform[platform] === provider;
}

export function formatProviderPlatformError(provider: ProviderKey, platform: SocialPlatform) {
  return `Provider ${provider} cannot publish ${platform} variants.`;
}
