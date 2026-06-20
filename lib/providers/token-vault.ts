import "server-only";

import crypto from "node:crypto";
import type { ProviderKey, ProviderTokenSet } from "@/lib/providers/types";

export type TokenVaultStoreInput = {
  workspaceId: string;
  provider: ProviderKey;
  providerAccountId: string;
  tokens?: ProviderTokenSet;
};

export type TokenVaultStoreResult = {
  tokenRef: string;
  expiresAt?: Date;
  scopes: string[];
};

function hashTokenReference(input: TokenVaultStoreInput) {
  const tokenFingerprint = JSON.stringify({
    provider: input.provider,
    workspaceId: input.workspaceId,
    providerAccountId: input.providerAccountId,
    accessToken: input.tokens?.accessToken ? "present" : "missing",
    refreshToken: input.tokens?.refreshToken ? "present" : "missing"
  });

  return crypto.createHash("sha256").update(tokenFingerprint).digest("hex").slice(0, 24);
}

export async function storeProviderTokens(input: TokenVaultStoreInput): Promise<TokenVaultStoreResult> {
  return {
    tokenRef: `vault_${input.provider}_${hashTokenReference(input)}`,
    expiresAt: input.tokens?.expiresAt,
    scopes: input.tokens?.scopes ?? []
  };
}

export function maskTokenRef(tokenRef: string | null | undefined) {
  if (!tokenRef) {
    return null;
  }

  return `${tokenRef.slice(0, 12)}...${tokenRef.slice(-6)}`;
}
