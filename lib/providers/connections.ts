import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { getDb, type DatabaseClient } from "@/db";
import { connectedAccounts, type ConnectedAccount } from "@/db/schema";
import { isDatabaseConfigured } from "@/lib/env";
import {
  evaluateProviderHealth,
  type ProviderHealthAccount,
  type ProviderHealthResult
} from "@/lib/providers/health";
import { isLinkedInConfigured } from "@/lib/providers/linkedin";
import { mockProvider } from "@/lib/providers/mock";
import { providerAdapters, getProviderAdapter } from "@/lib/providers/registry";
import type {
  ProviderCapabilityMap,
  ProviderConnectionResult,
  ProviderKey
} from "@/lib/providers/types";

type ConnectionRow = Pick<
  ConnectedAccount,
  | "id"
  | "workspaceId"
  | "provider"
  | "providerAccountId"
  | "displayName"
  | "status"
  | "tokenRef"
  | "scopes"
  | "capabilities"
  | "lastValidatedAt"
  | "metadata"
  | "createdAt"
  | "updatedAt"
  | "disconnectedAt"
>;

export type ProviderConnectionAccountView = {
  id: string;
  provider: ProviderKey;
  providerAccountId: string;
  displayName: string;
  status: ConnectedAccount["status"];
  scopes: string[];
  capabilities: string[];
  lastValidatedAt: string | null;
  disconnectedAt: string | null;
  metadata: Record<string, string | number | boolean | string[] | null>;
};

export type ProviderConnectionActionState = {
  enabled: boolean;
  href?: string;
  label: string;
  reason?: string;
};

export type ProviderConnectionState = {
  key: ProviderKey;
  displayName: string;
  group: "social" | "messaging";
  implementationStatus: "mock" | "stub" | "live";
  website?: string;
  configured: boolean;
  account: ProviderConnectionAccountView | null;
  health: ProviderHealthResult;
  capabilities: Array<{
    capability: string;
    label: string;
    supported: boolean;
    accountSupported: boolean;
    reason?: string;
  }>;
  actions: {
    connect: ProviderConnectionActionState;
    refreshHealth: ProviderConnectionActionState;
    disconnect: ProviderConnectionActionState;
    testPublish: ProviderConnectionActionState;
  };
};

const providerLabels: Record<ProviderKey, string> = {
  mock: "Mock Provider",
  meta: "Meta",
  linkedin: "LinkedIn",
  x: "X",
  slack: "Slack",
  discord: "Discord"
};

const capabilityLabels: Record<string, string> = {
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

const memoryConnections = new Map<string, ConnectionRow>();

function createMemoryConnectionKey(workspaceId: string, provider: ProviderKey, providerAccountId: string) {
  return `${workspaceId}:${provider}:${providerAccountId}`;
}

function getSupportedCapabilityKeys(capabilities: ProviderCapabilityMap) {
  return Object.values(capabilities)
    .filter((capability) => capability.supported)
    .map((capability) => capability.capability);
}

function toHealthAccount(row: ConnectionRow | null | undefined): ProviderHealthAccount | null {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    status: row.status,
    scopes: row.scopes,
    capabilities: row.capabilities,
    lastValidatedAt: row.lastValidatedAt
  };
}

function sanitizeMetadata(metadata: Record<string, unknown> | null | undefined) {
  const safeKeys = [
    "accountType",
    "authorUrn",
    "locale",
    "mode",
    "picture",
    "tokenExpiresAt",
    "missingScopes"
  ];
  const safe: ProviderConnectionAccountView["metadata"] = {};

  for (const key of safeKeys) {
    const value = metadata?.[key];

    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null ||
      (Array.isArray(value) && value.every((item) => typeof item === "string"))
    ) {
      safe[key] = value;
    }
  }

  return safe;
}

function toAccountView(row: ConnectionRow | null | undefined): ProviderConnectionAccountView | null {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    provider: row.provider,
    providerAccountId: row.providerAccountId,
    displayName: row.displayName,
    status: row.status,
    scopes: row.scopes,
    capabilities: row.capabilities,
    lastValidatedAt: row.lastValidatedAt?.toISOString() ?? null,
    disconnectedAt: row.disconnectedAt?.toISOString() ?? null,
    metadata: sanitizeMetadata(row.metadata)
  };
}

export async function ensureLocalPreviewMockConnection(workspaceId: string) {
  const key = createMemoryConnectionKey(workspaceId, "mock", `mock_${workspaceId}`);

  const existing = memoryConnections.get(key);

  if (existing) {
    return existing;
  }

  const now = new Date();
  const row = {
    id: crypto.randomUUID(),
    workspaceId,
    providerAccountId: `mock_${workspaceId}`,
    provider: "mock",
    displayName: "Local preview account",
    status: "connected",
    tokenRef: null,
    scopes: ["publish", "comments.read", "comments.write", "metrics.read"],
    capabilities: getSupportedCapabilityKeys(mockProvider.capabilities),
    lastValidatedAt: now,
    metadata: {
      mode: "local-preview"
    },
    createdAt: now,
    updatedAt: now,
    disconnectedAt: null
  } satisfies ConnectionRow;

  memoryConnections.set(key, row);
  return row;
}

function createMemoryConnectionRow({
  result,
  workspaceId
}: {
  workspaceId: string;
  result: ProviderConnectionResult;
}): ConnectionRow {
  const now = new Date();

  return {
    id: crypto.randomUUID(),
    workspaceId,
    provider: result.provider,
    providerAccountId: result.providerAccountId,
    displayName: result.displayName,
    status: result.status,
    tokenRef: result.tokenRef ?? null,
    scopes: result.scopes,
    capabilities: getSupportedCapabilityKeys(result.capabilities),
    lastValidatedAt: result.status === "connected" ? now : null,
    metadata: result.metadata ?? {},
    createdAt: now,
    updatedAt: now,
    disconnectedAt: null
  };
}

async function listConnectionRows({
  isLocalPreview = false,
  workspaceId
}: {
  isLocalPreview?: boolean;
  workspaceId: string | null | undefined;
}) {
  if (!workspaceId) {
    return [] as ConnectionRow[];
  }

  if (isLocalPreview || !isDatabaseConfigured) {
    if (isLocalPreview) {
      await ensureLocalPreviewMockConnection(workspaceId);
    }

    return [...memoryConnections.values()].filter((row) => row.workspaceId === workspaceId);
  }

  return getDb()
    .select()
    .from(connectedAccounts)
    .where(eq(connectedAccounts.workspaceId, workspaceId))
    .orderBy(asc(connectedAccounts.provider), asc(connectedAccounts.createdAt));
}

function pickActiveAccount(rows: ConnectionRow[], provider: ProviderKey) {
  return (
    rows.find((row) => row.provider === provider && row.status === "connected") ??
    rows.find((row) => row.provider === provider && row.status !== "disconnected") ??
    rows.find((row) => row.provider === provider) ??
    null
  );
}

function isProviderConfigured(provider: ProviderKey) {
  if (provider === "linkedin") {
    return isLinkedInConfigured();
  }

  return true;
}

function getActionState({
  account,
  provider
}: {
  account: ConnectionRow | null;
  provider: (typeof providerAdapters)[number];
}): ProviderConnectionState["actions"] {
  const scaffoldReason = `${provider.displayName} is scaffold-only. Configure a live adapter before connecting.`;
  const configurationReason =
    provider.key === "linkedin" && !isLinkedInConfigured()
      ? "Set LinkedIn OAuth credentials before connecting."
      : undefined;
  const canConnect = provider.implementationStatus !== "stub" && !configurationReason;

  return {
    connect: {
      enabled: canConnect,
      href: canConnect ? `/api/connections/${provider.key}/connect` : undefined,
      label: account?.status === "connected" ? "Reconnect" : provider.key === "mock" ? "Use mock" : "Connect",
      reason: configurationReason ?? (provider.implementationStatus === "stub" ? scaffoldReason : undefined)
    },
    refreshHealth: {
      enabled: Boolean(account && account.status !== "disconnected"),
      label: "Refresh health",
      reason: account ? undefined : "Connect an account before refreshing provider health."
    },
    disconnect: {
      enabled: Boolean(account && account.status === "connected"),
      label: "Disconnect",
      reason: account?.status === "connected" ? undefined : "No connected account is available to disconnect."
    },
    testPublish: {
      enabled: provider.key === "mock" && Boolean(account && account.status === "connected"),
      label: "Dry run",
      reason:
        provider.key === "mock"
          ? account
            ? undefined
            : "Connect the mock account before running diagnostics."
          : "Live provider test publishing is disabled to prevent irreversible external posts."
    }
  };
}

export async function getProviderConnectionStates({
  isLocalPreview = false,
  workspaceId
}: {
  isLocalPreview?: boolean;
  workspaceId: string | null | undefined;
}): Promise<ProviderConnectionState[]> {
  const rows = await listConnectionRows({ isLocalPreview, workspaceId });

  return providerAdapters.map((provider) => {
    const account = pickActiveAccount(rows, provider.key);
    const accountHealth = toHealthAccount(account);
    const health = evaluateProviderHealth({
      adapter: provider,
      allowMock: isLocalPreview || provider.key === "mock",
      connectedAccount: accountHealth,
      connectedAccountId: account?.id ?? null,
      requiredCapability: "scheduled_publish"
    });
    const configured = provider.implementationStatus === "live"
      ? health.configured && isProviderConfigured(provider.key)
      : health.configured;
    const capabilities = Object.values(provider.capabilities).map((capability) => ({
      capability: capability.capability,
      label: capabilityLabels[capability.capability],
      supported: capability.supported,
      accountSupported: account?.capabilities.includes(capability.capability) ?? false,
      reason: capability.reason
    }));

    return {
      key: provider.key,
      displayName: provider.displayName,
      group: provider.group,
      implementationStatus: provider.implementationStatus,
      website: provider.website,
      configured,
      account: toAccountView(account),
      health:
        provider.key === "linkedin" && !isLinkedInConfigured() && !account
          ? {
              ...health,
              configured: false,
              status: "configuration_required",
              blockingReason: "Set LinkedIn OAuth credentials before connecting a live account."
            }
          : health,
      capabilities,
      actions: getActionState({ account, provider })
    };
  });
}

export async function persistProviderConnection({
  db,
  result,
  workspaceId
}: {
  db?: DatabaseClient;
  workspaceId: string;
  result: ProviderConnectionResult;
}) {
  const capabilities = getSupportedCapabilityKeys(result.capabilities);
  const now = new Date();

  if (!isDatabaseConfigured) {
    const key = createMemoryConnectionKey(workspaceId, result.provider, result.providerAccountId);
    const existing = memoryConnections.get(key);
    const row = {
      ...(existing ?? createMemoryConnectionRow({ workspaceId, result })),
      displayName: result.displayName,
      status: result.status,
      tokenRef: result.tokenRef ?? existing?.tokenRef ?? null,
      scopes: result.scopes,
      capabilities,
      lastValidatedAt: result.status === "connected" ? now : null,
      metadata: result.metadata ?? existing?.metadata ?? {},
      updatedAt: now,
      disconnectedAt: null
    } satisfies ConnectionRow;

    memoryConnections.set(key, row);
    return row;
  }

  const database = db ?? getDb();
  const [row] = await database
    .insert(connectedAccounts)
    .values({
      workspaceId,
      provider: result.provider,
      providerAccountId: result.providerAccountId,
      displayName: result.displayName,
      status: result.status,
      tokenRef: result.tokenRef,
      scopes: result.scopes,
      capabilities,
      lastValidatedAt: result.status === "connected" ? now : null,
      metadata: result.metadata ?? {},
      updatedAt: now,
      disconnectedAt: null
    })
    .onConflictDoUpdate({
      target: [
        connectedAccounts.workspaceId,
        connectedAccounts.provider,
        connectedAccounts.providerAccountId
      ],
      set: {
        displayName: result.displayName,
        status: result.status,
        tokenRef: result.tokenRef,
        scopes: result.scopes,
        capabilities,
        lastValidatedAt: result.status === "connected" ? now : null,
        metadata: result.metadata ?? {},
        updatedAt: now,
        disconnectedAt: null
      }
    })
    .returning();

  return row;
}

export async function disconnectProviderAccount({
  accountId,
  db,
  isLocalPreview = false,
  provider,
  workspaceId
}: {
  accountId: string;
  db?: DatabaseClient;
  isLocalPreview?: boolean;
  provider: ProviderKey;
  workspaceId: string;
}) {
  const now = new Date();

  if (isLocalPreview || !isDatabaseConfigured) {
    const row = [...memoryConnections.values()].find(
      (entry) => entry.workspaceId === workspaceId && entry.provider === provider && entry.id === accountId
    );

    if (!row) {
      return null;
    }

    const updated = {
      ...row,
      status: "disconnected" as const,
      updatedAt: now,
      disconnectedAt: now
    };

    memoryConnections.set(createMemoryConnectionKey(workspaceId, provider, row.providerAccountId), updated);
    return updated;
  }

  const database = db ?? getDb();
  const [updated] = await database
    .update(connectedAccounts)
    .set({
      status: "disconnected",
      updatedAt: now,
      disconnectedAt: now
    })
    .where(
      and(
        eq(connectedAccounts.id, accountId),
        eq(connectedAccounts.workspaceId, workspaceId),
        eq(connectedAccounts.provider, provider)
      )
    )
    .returning();

  return updated ?? null;
}

export async function refreshProviderConnectionHealth({
  accountId,
  db,
  isLocalPreview = false,
  provider,
  workspaceId
}: {
  accountId?: string | null;
  db?: DatabaseClient;
  isLocalPreview?: boolean;
  provider: ProviderKey;
  workspaceId: string;
}) {
  const rows = await listConnectionRows({ isLocalPreview, workspaceId });
  const row =
    rows.find((entry) => entry.provider === provider && (accountId ? entry.id === accountId : entry.status === "connected")) ??
    null;

  if (!row) {
    return null;
  }

  const adapter = getProviderAdapter(provider);
  const capabilities = await adapter.validateCapabilities({
    workspaceId,
    connectedAccountId: row.id,
    providerAccountId: row.providerAccountId,
    tokenRef: row.tokenRef
  });
  const supportedCapabilities = getSupportedCapabilityKeys(capabilities);
  const health = evaluateProviderHealth({
    adapter,
    allowMock: isLocalPreview || provider === "mock",
    connectedAccount: {
      ...toHealthAccount(row),
      capabilities: supportedCapabilities
    } as ProviderHealthAccount,
    connectedAccountId: row.id,
    requiredCapability: "scheduled_publish"
  });
  const now = new Date();
  const status: ConnectedAccount["status"] =
    health.status === "ready" ? "connected" : "requires_configuration";

  if (isLocalPreview || !isDatabaseConfigured) {
    const updated = {
      ...row,
      status,
      capabilities: supportedCapabilities,
      lastValidatedAt: now,
      updatedAt: now
    };

    memoryConnections.set(createMemoryConnectionKey(workspaceId, provider, row.providerAccountId), updated);

    return {
      account: updated,
      health
    };
  }

  const database = db ?? getDb();
  const [updated] = await database
    .update(connectedAccounts)
    .set({
      status,
      capabilities: supportedCapabilities,
      lastValidatedAt: now,
      updatedAt: now
    })
    .where(and(eq(connectedAccounts.workspaceId, workspaceId), eq(connectedAccounts.id, row.id)))
    .returning();

  return {
    account: updated ?? row,
    health
  };
}

export function clearProviderConnectionsForTests() {
  memoryConnections.clear();
}

export { providerLabels };
