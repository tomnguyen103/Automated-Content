import type {
  ProviderAdapter,
  ProviderCapability,
  ProviderCapabilityMap,
  ProviderConnectionStatus,
  ProviderKey
} from "@/lib/providers/types";

export type ProviderHealthStatus =
  | "ready"
  | "configuration_required"
  | "account_required"
  | "account_not_ready"
  | "scope_missing"
  | "capability_unsupported";

export type ProviderHealthAccount = {
  id: string;
  status: ProviderConnectionStatus;
  scopes?: string[];
  capabilities?: string[];
  lastValidatedAt?: Date | null;
};

export type ProviderHealthResult = {
  provider: ProviderKey;
  connectedAccountId: string | null;
  configured: boolean;
  status: ProviderHealthStatus;
  requiredScopes: string[];
  capabilities: ProviderCapabilityMap;
  lastChecked: string;
  blockingReason?: string;
  warnings: string[];
};

const capabilityRequiredScopes: Partial<Record<ProviderCapability, string[]>> = {
  scheduled_publish: ["publish"],
  immediate_publish: ["publish"],
  comment_ingest: ["comments.read"],
  comment_reply: ["comments.write"],
  metrics_sync: ["metrics.read"]
};

function missingRequiredScopes(requiredScopes: string[], account?: ProviderHealthAccount | null) {
  if (requiredScopes.length === 0 || !account?.scopes || account.scopes.length === 0) {
    return [];
  }

  return requiredScopes.filter((scope) => !account.scopes?.includes(scope));
}

function accountSupportsCapability(requiredCapability: ProviderCapability | undefined, account?: ProviderHealthAccount | null) {
  if (!requiredCapability || !account?.capabilities || account.capabilities.length === 0) {
    return true;
  }

  return account.capabilities.includes(requiredCapability);
}

export function evaluateProviderHealth({
  adapter,
  allowMock = false,
  connectedAccount = null,
  connectedAccountId = connectedAccount?.id ?? null,
  now = () => new Date(),
  requiredCapability
}: {
  adapter: ProviderAdapter;
  allowMock?: boolean;
  connectedAccount?: ProviderHealthAccount | null;
  connectedAccountId?: string | null;
  now?: () => Date;
  requiredCapability?: ProviderCapability;
}): ProviderHealthResult {
  const requiredScopes = requiredCapability ? (capabilityRequiredScopes[requiredCapability] ?? []) : [];
  const support = requiredCapability ? adapter.capabilities[requiredCapability] : undefined;
  const lastChecked = now().toISOString();
  const base = {
    provider: adapter.key,
    connectedAccountId,
    requiredScopes,
    capabilities: adapter.capabilities,
    lastChecked,
    warnings: [] as string[]
  };

  if (support && !support.supported) {
    return {
      ...base,
      configured: adapter.implementationStatus !== "stub",
      status: "capability_unsupported",
      blockingReason: support.reason ?? `${adapter.displayName} does not support ${requiredCapability}.`
    };
  }

  if (connectedAccountId && !connectedAccount) {
    return {
      ...base,
      configured: false,
      status: "account_not_ready",
      blockingReason: `Connected account ${connectedAccountId} was not found for ${adapter.displayName}.`
    };
  }

  if (connectedAccount && connectedAccount.status !== "connected") {
    return {
      ...base,
      configured: false,
      status: "account_not_ready",
      blockingReason: `Connected account ${connectedAccount.id} is ${connectedAccount.status}. Reconnect it before scheduling or publishing.`
    };
  }

  if (adapter.implementationStatus === "stub") {
    return {
      ...base,
      configured: false,
      status: "configuration_required",
      blockingReason: `${adapter.displayName} is scaffold-only. Configure the provider adapter and credentials before live scheduling or publishing.`
    };
  }

  if (adapter.implementationStatus === "mock") {
    return {
      ...base,
      configured: true,
      status: "ready",
      warnings: allowMock ? [] : ["Mock provider readiness is intended for local preview and automated tests."]
    };
  }

  if (!connectedAccount) {
    return {
      ...base,
      configured: false,
      status: "account_required",
      blockingReason: `Connect a ${adapter.displayName} account before scheduling or publishing.`
    };
  }

  const missingScopes = missingRequiredScopes(requiredScopes, connectedAccount);

  if (missingScopes.length > 0) {
    return {
      ...base,
      configured: false,
      status: "scope_missing",
      blockingReason: `Connected account ${connectedAccount.id} is missing required scopes: ${missingScopes.join(", ")}.`
    };
  }

  if (!accountSupportsCapability(requiredCapability, connectedAccount)) {
    return {
      ...base,
      configured: false,
      status: "capability_unsupported",
      blockingReason: `Connected account ${connectedAccount.id} does not expose ${requiredCapability}.`
    };
  }

  return {
    ...base,
    configured: true,
    status: "ready",
    warnings: connectedAccount.lastValidatedAt ? [] : [`${adapter.displayName} account readiness has not been checked yet.`]
  };
}

export function isProviderHealthBlocking(health: ProviderHealthResult) {
  return health.status !== "ready";
}
