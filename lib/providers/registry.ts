import { discordProvider } from "@/lib/providers/discord";
import { linkedinProvider } from "@/lib/providers/linkedin";
import { metaProvider } from "@/lib/providers/meta";
import { mockProvider } from "@/lib/providers/mock";
import { slackProvider } from "@/lib/providers/slack";
import type { ProviderAdapter, ProviderGroup, ProviderKey } from "@/lib/providers/types";
import { xProvider } from "@/lib/providers/x";
import { buildProviderCapabilityMatrix } from "@/lib/providers/capabilities";

export const providerRegistry = {
  mock: mockProvider,
  meta: metaProvider,
  linkedin: linkedinProvider,
  x: xProvider,
  slack: slackProvider,
  discord: discordProvider
} satisfies Record<ProviderKey, ProviderAdapter>;

export const providerAdapters = Object.values(providerRegistry);

export function getProviderAdapter(key: ProviderKey) {
  return providerRegistry[key];
}

export function getProviderAdaptersByGroup(group: ProviderGroup) {
  return providerAdapters.filter((provider) => provider.group === group);
}

export function getProviderCapabilityMatrix() {
  return buildProviderCapabilityMatrix(providerAdapters);
}

export function isProviderKey(value: string): value is ProviderKey {
  return value in providerRegistry;
}
