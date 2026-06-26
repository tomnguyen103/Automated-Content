import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadTokenVault() {
  const {
    clearProviderTokenVaultForTests,
    getProviderTokens,
    storeProviderTokens
  } = await import("@/lib/providers/token-vault");

  return { clearProviderTokenVaultForTests, getProviderTokens, storeProviderTokens };
}

describe("provider token vault", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("PROVIDER_TOKEN_ENCRYPTION_KEY", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("stores and retrieves provider tokens through the local fallback vault", async () => {
    const { clearProviderTokenVaultForTests, getProviderTokens, storeProviderTokens } = await loadTokenVault();
    clearProviderTokenVaultForTests();

    const expiresAt = new Date(Date.now() + 60_000);
    const result = await storeProviderTokens({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      provider: "mock",
      providerAccountId: "mock_account",
      tokens: {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        expiresAt,
        scopes: ["publish"]
      }
    });
    const tokens = await getProviderTokens({
      tokenRef: result.tokenRef,
      workspaceId: "00000000-0000-0000-0000-000000000001"
    });

    expect(result.tokenRef).toContain("vault_mock_");
    expect(result.scopes).toEqual(["publish"]);
    expect(tokens?.accessToken).toBe("access-token");
    expect(tokens?.refreshToken).toBe("refresh-token");
    expect(tokens?.expiresAt?.toISOString()).toBe(expiresAt.toISOString());
  });

  it("does not return tokens for a different workspace", async () => {
    const { clearProviderTokenVaultForTests, getProviderTokens, storeProviderTokens } = await loadTokenVault();
    clearProviderTokenVaultForTests();

    const result = await storeProviderTokens({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      provider: "mock",
      providerAccountId: "mock_account",
      tokens: {
        accessToken: "access-token"
      }
    });
    const tokens = await getProviderTokens({
      tokenRef: result.tokenRef,
      workspaceId: "00000000-0000-0000-0000-000000000002"
    });

    expect(tokens).toBeNull();
  });

  it("rejects short production encryption keys before database storage", async () => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", "postgres://app_user:prod_password@db.example.com:5432/app");
    vi.stubEnv("PROVIDER_TOKEN_ENCRYPTION_KEY", "short-secret");
    const { storeProviderTokens } = await loadTokenVault();

    await expect(
      storeProviderTokens({
        workspaceId: "00000000-0000-0000-0000-000000000001",
        provider: "mock",
        providerAccountId: "mock_account",
        tokens: {
          accessToken: "access-token"
        }
      })
    ).rejects.toThrow("PROVIDER_TOKEN_ENCRYPTION_KEY must be at least 32 characters.");
  });
});
