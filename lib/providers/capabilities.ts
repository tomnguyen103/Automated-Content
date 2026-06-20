import type {
  ProviderAdapter,
  ProviderCapability,
  ProviderCapabilityMap,
  ProviderKey
} from "@/lib/providers/types";
import { providerCapabilities } from "@/lib/providers/types";

export const providerCapabilityLabels: Record<ProviderCapability, string> = {
  text_post: "Text post",
  image_post: "Image post",
  video_post: "Video post",
  carousel: "Carousel",
  scheduled_publish: "Scheduled publish",
  immediate_publish: "Immediate publish",
  comment_ingest: "Comment ingest",
  comment_reply: "Comment reply",
  metrics_sync: "Metrics sync"
};

const defaultUnsupportedReason = "Not available in this adapter.";

export function defineProviderCapabilities({
  supported,
  unsupportedReasons = {}
}: {
  supported: ProviderCapability[];
  unsupportedReasons?: Partial<Record<ProviderCapability, string>>;
}): ProviderCapabilityMap {
  return providerCapabilities.reduce((map, capability) => {
    const isSupported = supported.includes(capability);
    map[capability] = {
      capability,
      supported: isSupported,
      reason: isSupported ? undefined : unsupportedReasons[capability] ?? defaultUnsupportedReason
    };
    return map;
  }, {} as ProviderCapabilityMap);
}

export function summarizeCapabilities(capabilities: ProviderCapabilityMap) {
  return providerCapabilities.map((capability) => ({
    ...capabilities[capability],
    label: providerCapabilityLabels[capability]
  }));
}

export function buildProviderCapabilityMatrix(adapters: ProviderAdapter[]) {
  return adapters.map((adapter) => ({
    key: adapter.key,
    displayName: adapter.displayName,
    group: adapter.group,
    implementationStatus: adapter.implementationStatus,
    capabilities: summarizeCapabilities(adapter.capabilities),
    supportedCount: providerCapabilities.filter((capability) => adapter.capabilities[capability].supported).length,
    liveSupportedCount:
      adapter.implementationStatus === "stub"
        ? 0
        : providerCapabilities.filter((capability) => adapter.capabilities[capability].supported).length,
    totalCount: providerCapabilities.length
  }));
}

export function getCapabilitySupport(
  capabilities: ProviderCapabilityMap,
  capability: ProviderCapability
) {
  return capabilities[capability];
}

export function getProviderConnectionSummary({
  provider,
  capabilities
}: {
  provider: ProviderKey;
  capabilities: ProviderCapabilityMap;
}) {
  return {
    provider,
    publishingReady:
      capabilities.text_post.supported &&
      (capabilities.immediate_publish.supported || capabilities.scheduled_publish.supported),
    engagementReady: capabilities.comment_ingest.supported || capabilities.comment_reply.supported,
    metricsReady: capabilities.metrics_sync.supported
  };
}
