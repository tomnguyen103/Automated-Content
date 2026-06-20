import { defineProviderCapabilities } from "@/lib/providers/capabilities";
import {
  ProviderCapabilityError,
  ProviderConfigurationError,
  normalizeProviderError
} from "@/lib/providers/errors";
import type {
  ProviderAdapter,
  ProviderCapability,
  ProviderConnectionResult,
  ProviderConnectionInput,
  ProviderGroup,
  ProviderKey
} from "@/lib/providers/types";

export function createProviderSkeleton({
  key,
  displayName,
  group,
  website,
  supported,
  unsupportedReasons
}: {
  key: ProviderKey;
  displayName: string;
  group: ProviderGroup;
  website?: string;
  supported: ProviderCapability[];
  unsupportedReasons?: Partial<Record<ProviderCapability, string>>;
}): ProviderAdapter {
  const capabilities = defineProviderCapabilities({ supported, unsupportedReasons });

  function unsupportedCapability(capability: ProviderCapability) {
    return new ProviderCapabilityError(key, capability, capabilities[capability].reason);
  }

  async function connect(input: ProviderConnectionInput): Promise<ProviderConnectionResult> {
    if (!input.authorizationCode && !input.tokens?.accessToken) {
      throw new ProviderConfigurationError(
        key,
        `${displayName} OAuth credentials are not configured for live connections yet.`
      );
    }

    throw new ProviderConfigurationError(
      key,
      `${displayName} OAuth exchange is intentionally stubbed until provider credentials are configured.`
    );
  }

  return {
    key,
    displayName,
    group,
    website,
    capabilities,
    connect,
    async refreshToken() {
      throw new ProviderConfigurationError(key, `${displayName} token refresh is not configured yet.`);
    },
    async validateCapabilities() {
      return capabilities;
    },
    async publish() {
      if (!capabilities.text_post.supported) {
        throw unsupportedCapability("text_post");
      }

      throw new ProviderConfigurationError(key, `${displayName} publishing is not configured yet.`);
    },
    async replyToComment() {
      if (!capabilities.comment_reply.supported) {
        throw unsupportedCapability("comment_reply");
      }

      throw new ProviderConfigurationError(key, `${displayName} replies are not configured yet.`);
    },
    async fetchMetrics() {
      if (!capabilities.metrics_sync.supported) {
        throw unsupportedCapability("metrics_sync");
      }

      throw new ProviderConfigurationError(key, `${displayName} metrics sync is not configured yet.`);
    },
    normalizeError(error) {
      return normalizeProviderError(key, error);
    }
  };
}
