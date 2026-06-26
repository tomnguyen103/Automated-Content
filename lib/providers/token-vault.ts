import "server-only";

import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb, type DatabaseClient } from "@/db";
import { tokenVaultEntries } from "@/db/schema";
import { env, isDatabaseConfigured } from "@/lib/env";
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

export type TokenVaultReadInput = {
  tokenRef: string;
  workspaceId: string;
};

export type TokenVaultUpdateInput = TokenVaultStoreInput & {
  tokenRef: string;
};

type TokenVaultPayload = {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  scopes: string[];
  raw?: Record<string, unknown>;
};

type StoredMemoryToken = {
  workspaceId: string;
  provider: ProviderKey;
  providerAccountId: string;
  payload: TokenVaultPayload;
  expiresAt?: Date;
};

export class TokenVaultConfigurationError extends Error {
  constructor(message = "PROVIDER_TOKEN_ENCRYPTION_KEY is required to store provider tokens.") {
    super(message);
    this.name = "TokenVaultConfigurationError";
  }
}

const memoryTokenVault = new Map<string, StoredMemoryToken>();

function createTokenRef(provider: ProviderKey) {
  return `vault_${provider}_${crypto.randomUUID()}`;
}

function toPayload(tokens?: ProviderTokenSet): TokenVaultPayload {
  return {
    accessToken: tokens?.accessToken,
    refreshToken: tokens?.refreshToken,
    expiresAt: tokens?.expiresAt?.toISOString(),
    scopes: tokens?.scopes ?? [],
    raw: tokens?.raw
  };
}

function fromPayload(payload: TokenVaultPayload): ProviderTokenSet {
  return {
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : undefined,
    scopes: payload.scopes,
    raw: payload.raw
  };
}

function getVaultKey() {
  const secret = getRequiredVaultSecret();

  return crypto.createHash("sha256").update(secret).digest();
}

function getKeyVersion() {
  const secret = getRequiredVaultSecret();

  return crypto.createHash("sha256").update(secret).digest("hex").slice(0, 12);
}

function getRequiredVaultSecret() {
  if (!env.PROVIDER_TOKEN_ENCRYPTION_KEY) {
    throw new TokenVaultConfigurationError();
  }

  if (env.PROVIDER_TOKEN_ENCRYPTION_KEY.length < 32) {
    throw new TokenVaultConfigurationError("PROVIDER_TOKEN_ENCRYPTION_KEY must be at least 32 characters.");
  }

  return env.PROVIDER_TOKEN_ENCRYPTION_KEY;
}

function encryptPayload(payload: TokenVaultPayload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getVaultKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url")
  ].join(".");
}

function decryptPayload(encryptedPayload: string): TokenVaultPayload {
  const [version, iv, tag, ciphertext] = encryptedPayload.split(".");

  if (version !== "v1" || !iv || !tag || !ciphertext) {
    throw new Error("Unsupported token vault payload format.");
  }

  const decipher = crypto.createDecipheriv("aes-256-gcm", getVaultKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final()
  ]).toString("utf8");

  return JSON.parse(plaintext) as TokenVaultPayload;
}

export async function storeProviderTokens(
  input: TokenVaultStoreInput,
  db?: DatabaseClient
): Promise<TokenVaultStoreResult> {
  const tokenRef = createTokenRef(input.provider);
  const payload = toPayload(input.tokens);

  if (!isDatabaseConfigured) {
    memoryTokenVault.set(tokenRef, {
      workspaceId: input.workspaceId,
      provider: input.provider,
      providerAccountId: input.providerAccountId,
      payload,
      expiresAt: input.tokens?.expiresAt
    });

    return {
      tokenRef,
      expiresAt: input.tokens?.expiresAt,
      scopes: payload.scopes
    };
  }

  const now = new Date();
  const database = db ?? getDb();
  await database.insert(tokenVaultEntries).values({
    id: tokenRef,
    workspaceId: input.workspaceId,
    provider: input.provider,
    providerAccountId: input.providerAccountId,
    encryptedPayload: encryptPayload(payload),
    keyVersion: getKeyVersion(),
    expiresAt: input.tokens?.expiresAt,
    updatedAt: now
  });

  return {
    tokenRef,
    expiresAt: input.tokens?.expiresAt,
    scopes: payload.scopes
  };
}

export async function updateProviderTokens(
  input: TokenVaultUpdateInput,
  db?: DatabaseClient
): Promise<TokenVaultStoreResult> {
  const payload = toPayload(input.tokens);

  if (!isDatabaseConfigured) {
    const existing = memoryTokenVault.get(input.tokenRef);

    if (!existing || existing.workspaceId !== input.workspaceId) {
      throw new Error("Token vault entry was not found.");
    }

    memoryTokenVault.set(input.tokenRef, {
      workspaceId: input.workspaceId,
      provider: input.provider,
      providerAccountId: input.providerAccountId,
      payload,
      expiresAt: input.tokens?.expiresAt
    });

    return {
      tokenRef: input.tokenRef,
      expiresAt: input.tokens?.expiresAt,
      scopes: payload.scopes
    };
  }

  const now = new Date();
  const database = db ?? getDb();
  const [updated] = await database
    .update(tokenVaultEntries)
    .set({
      provider: input.provider,
      providerAccountId: input.providerAccountId,
      encryptedPayload: encryptPayload(payload),
      keyVersion: getKeyVersion(),
      expiresAt: input.tokens?.expiresAt,
      updatedAt: now
    })
    .where(and(eq(tokenVaultEntries.id, input.tokenRef), eq(tokenVaultEntries.workspaceId, input.workspaceId)))
    .returning({ id: tokenVaultEntries.id });

  if (!updated) {
    throw new Error("Token vault entry was not found.");
  }

  return {
    tokenRef: input.tokenRef,
    expiresAt: input.tokens?.expiresAt,
    scopes: payload.scopes
  };
}

export async function getProviderTokens(input: TokenVaultReadInput, db?: DatabaseClient): Promise<ProviderTokenSet | null> {
  if (!isDatabaseConfigured) {
    const entry = memoryTokenVault.get(input.tokenRef);

    return entry?.workspaceId === input.workspaceId ? fromPayload(entry.payload) : null;
  }

  const database = db ?? getDb();
  const [entry] = await database
    .select({ encryptedPayload: tokenVaultEntries.encryptedPayload })
    .from(tokenVaultEntries)
    .where(and(eq(tokenVaultEntries.id, input.tokenRef), eq(tokenVaultEntries.workspaceId, input.workspaceId)))
    .limit(1);

  if (!entry) {
    return null;
  }

  return fromPayload(decryptPayload(entry.encryptedPayload));
}

export function maskTokenRef(tokenRef: string | null | undefined) {
  if (!tokenRef) {
    return null;
  }

  return `${tokenRef.slice(0, 12)}...${tokenRef.slice(-6)}`;
}

export function clearProviderTokenVaultForTests() {
  memoryTokenVault.clear();
}
