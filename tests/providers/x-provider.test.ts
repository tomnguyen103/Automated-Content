import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const workspaceId = "00000000-0000-0000-0000-000000000001";

function jsonResponse(payload: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(payload), {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    status: init?.status ?? 200
  });
}

async function loadXProvider() {
  const [{ clearProviderTokenVaultForTests }, { xProvider }] = await Promise.all([
    import("@/lib/providers/token-vault"),
    import("@/lib/providers/x")
  ]);

  clearProviderTokenVaultForTests();

  return xProvider;
}

describe("X provider", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("X_API_BASE_URL", "https://api.x.test");
    vi.stubEnv("X_CLIENT_ID", "x-client-id");
    vi.stubEnv("X_CLIENT_SECRET", "x-client-secret");
    vi.stubEnv("X_OAUTH_AUTHORIZE_URL", "https://x.test/i/oauth2/authorize");
    vi.stubEnv("X_REDIRECT_URI", "http://localhost:3000/api/connections/x/callback");
    vi.stubEnv("X_SCOPES", "tweet.read tweet.write users.read offline.access");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("builds an OAuth authorization URL with PKCE and requested scopes", async () => {
    const {
      buildXAuthorizationUrl,
      createXCodeChallenge
    } = await import("@/lib/providers/x");
    const authorizationUrl = buildXAuthorizationUrl({
      state: "state-123",
      codeChallenge: createXCodeChallenge("verifier-123"),
      redirectUri: "http://localhost:3000/api/connections/x/callback"
    });

    expect(authorizationUrl.origin).toBe("https://x.test");
    expect(authorizationUrl.searchParams.get("response_type")).toBe("code");
    expect(authorizationUrl.searchParams.get("client_id")).toBe("x-client-id");
    expect(authorizationUrl.searchParams.get("scope")).toBe("tweet.read tweet.write users.read offline.access");
    expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorizationUrl.searchParams.get("code_challenge")).toBeTruthy();
  });

  it("connects with OAuth tokens without returning raw secrets", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "x-access-token",
          expires_in: 3600,
          refresh_token: "x-refresh-token",
          scope: "tweet.read tweet.write users.read offline.access"
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            id: "user_123",
            name: "Ada Lovelace",
            username: "ada",
            profile_image_url: "https://x.test/ada.png"
          }
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const xProvider = await loadXProvider();
    const result = await xProvider.connect({
      workspaceId,
      authorizationCode: "auth-code",
      redirectUri: "http://localhost:3000/api/connections/x/callback",
      metadata: {
        codeVerifier: "verifier-123"
      }
    });

    expect(result).toMatchObject({
      provider: "x",
      providerAccountId: "user_123",
      displayName: "@ada",
      status: "connected",
      scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"]
    });
    expect(result.tokenRef).toContain("vault_x_");
    expect(JSON.stringify(result)).not.toContain("x-access-token");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.x.test/2/oauth2/token",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Basic /)
        })
      })
    );
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain("code_verifier=verifier-123");
  });

  it("marks accounts missing tweet.write as not ready for publishing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "x-access-token",
          expires_in: 3600,
          scope: "tweet.read users.read"
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            id: "user_123",
            name: "Ada Lovelace",
            username: "ada"
          }
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const xProvider = await loadXProvider();
    const result = await xProvider.connect({
      workspaceId,
      authorizationCode: "auth-code",
      metadata: {
        codeVerifier: "verifier-123"
      }
    });

    expect(result.status).toBe("requires_configuration");
    expect(result.capabilities.scheduled_publish.supported).toBe(false);
    expect(result.metadata?.missingScopes).toEqual(["tweet.write"]);
  });

  it("does not infer publish scopes for pre-supplied tokens", async () => {
    const xProvider = await loadXProvider();
    const result = await xProvider.connect({
      workspaceId,
      providerAccountId: "user_123",
      tokens: {
        accessToken: "x-access-token"
      },
      metadata: {
        profile: {
          id: "user_123",
          name: "Ada Lovelace",
          username: "ada"
        }
      }
    });

    expect(result.status).toBe("requires_configuration");
    expect(result.scopes).toEqual([]);
    expect(result.capabilities.scheduled_publish.supported).toBe(false);
    expect(result.metadata?.missingScopes).toEqual(["tweet.read", "tweet.write", "users.read"]);
  });

  it("refreshes expired tokens before publishing a text post", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "fresh-x-access-token",
          expires_in: 3600,
          scope: "tweet.read tweet.write users.read offline.access"
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            data: {
              id: "1888888888888888888",
              text: "Hook\n\nBody\n\nCTA\n\n#build"
            }
          },
          {
            status: 201
          }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const xProvider = await loadXProvider();
    const connection = await xProvider.connect({
      workspaceId,
      providerAccountId: "user_123",
      tokens: {
        accessToken: "expired-x-access-token",
        refreshToken: "refresh-token",
        expiresAt: new Date(Date.now() - 60_000),
        scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"]
      },
      metadata: {
        profile: {
          id: "user_123",
          name: "Ada Lovelace",
          username: "ada"
        }
      }
    });
    const result = await xProvider.publish({
      workspaceId,
      providerAccountId: connection.providerAccountId,
      tokenRef: connection.tokenRef,
      content: {
        variantId: "variant_1",
        title: "Launch post",
        hook: "Hook",
        body: "Body",
        cta: "CTA",
        hashtags: ["#build"],
        media: []
      }
    });

    expect(result).toMatchObject({
      provider: "x",
      providerPostId: "1888888888888888888",
      status: "published",
      url: "https://x.com/i/web/status/1888888888888888888"
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.x.test/2/tweets",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer fresh-x-access-token"
        }),
        body: JSON.stringify({
          text: "Hook\n\nBody\n\nCTA\n\n#build"
        })
      })
    );
  });

  it("does not refresh stored tokens under a synthetic account id", async () => {
    const [{ storeProviderTokens }, xProvider] = await Promise.all([
      import("@/lib/providers/token-vault"),
      loadXProvider()
    ]);
    const tokenResult = await storeProviderTokens({
      workspaceId,
      provider: "x",
      providerAccountId: "user_123",
      tokens: {
        accessToken: "expired-x-access-token",
        refreshToken: "refresh-token",
        expiresAt: new Date(Date.now() - 60_000),
        scopes: ["tweet.read", "tweet.write", "users.read"]
      }
    });

    await expect(
      xProvider.refreshToken({
        workspaceId,
        tokenRef: tokenResult.tokenRef
      })
    ).rejects.toMatchObject({
      code: "provider_account_missing"
    });
  });

  it("keeps media, replies, metrics, and too-long text blocked explicitly", async () => {
    const xProvider = await loadXProvider();
    const connection = await xProvider.connect({
      workspaceId,
      providerAccountId: "user_123",
      tokens: {
        accessToken: "x-access-token",
        expiresAt: new Date(Date.now() + 10 * 60_000),
        scopes: ["tweet.read", "tweet.write", "users.read"]
      },
      metadata: {
        profile: {
          id: "user_123",
          username: "ada"
        }
      }
    });
    const publishInput = {
      workspaceId,
      providerAccountId: connection.providerAccountId,
      tokenRef: connection.tokenRef,
      content: {
        variantId: "variant_1",
        title: "Launch post",
        hook: "Hook",
        body: "Body",
        cta: "CTA",
        hashtags: [],
        media: []
      }
    };

    await expect(
      xProvider.publish({
        ...publishInput,
        content: {
          ...publishInput.content,
          media: [{ sourceUrl: "https://ik.imagekit.io/example/post.png" }]
        }
      })
    ).rejects.toMatchObject({
      code: "provider_capability_unsupported"
    });
    await expect(
      xProvider.publish({
        ...publishInput,
        content: {
          ...publishInput.content,
          hook: "x".repeat(281)
        }
      })
    ).rejects.toMatchObject({
      code: "content_invalid"
    });
    await expect(
      xProvider.replyToComment({
        workspaceId,
        commentId: "comment_1",
        message: "Reply"
      })
    ).rejects.toMatchObject({
      code: "provider_capability_unsupported"
    });
    await expect(
      xProvider.fetchMetrics({
        workspaceId,
        providerPostId: "1888888888888888888"
      })
    ).rejects.toMatchObject({
      code: "provider_capability_unsupported"
    });
  });
});
