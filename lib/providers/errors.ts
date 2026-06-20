import type { NormalizedProviderError, ProviderCapability, ProviderKey } from "@/lib/providers/types";

export class ProviderError extends Error {
  readonly code: string;
  readonly provider: ProviderKey;
  readonly retryable: boolean;
  readonly cause?: unknown;

  constructor({
    code,
    message,
    provider,
    retryable = false,
    cause
  }: {
    code: string;
    message: string;
    provider: ProviderKey;
    retryable?: boolean;
    cause?: unknown;
  }) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.provider = provider;
    this.retryable = retryable;
    this.cause = cause;
  }
}

export class ProviderConfigurationError extends ProviderError {
  constructor(provider: ProviderKey, message = "Provider credentials are not configured.") {
    super({
      code: "provider_configuration_required",
      message,
      provider,
      retryable: false
    });
    this.name = "ProviderConfigurationError";
  }
}

export class ProviderCapabilityError extends ProviderError {
  readonly capability: ProviderCapability;

  constructor(provider: ProviderKey, capability: ProviderCapability, reason?: string) {
    super({
      code: "provider_capability_unsupported",
      message: `${provider} does not support ${capability}${reason ? `: ${reason}` : "."}`,
      provider,
      retryable: false
    });
    this.name = "ProviderCapabilityError";
    this.capability = capability;
  }
}

export function normalizeProviderError(provider: ProviderKey, error: unknown): NormalizedProviderError {
  if (error instanceof ProviderError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      provider: error.provider,
      cause: error.cause
    };
  }

  if (error instanceof Error) {
    return {
      code: "provider_error",
      message: error.message,
      retryable: false,
      provider,
      cause: error
    };
  }

  return {
    code: "provider_unknown_error",
    message: "The provider returned an unknown error.",
    retryable: false,
    provider,
    cause: error
  };
}
