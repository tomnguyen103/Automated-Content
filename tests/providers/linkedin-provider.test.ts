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

async function loadLinkedInProvider() {
  const [{ clearProviderTokenVaultForTests }, { linkedinProvider }] = await Promise.all([
    import("@/lib/providers/token-vault"),
    import("@/lib/providers/linkedin")
  ]);

  clearProviderTokenVaultForTests();

  return linkedinProvider;
}

describe("linkedin provider", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("LINKEDIN_CLIENT_ID", "linkedin-client-id");
    vi.stubEnv("LINKEDIN_CLIENT_SECRET", "linkedin-client-secret");
    vi.stubEnv("LINKEDIN_REDIRECT_URI", "http://localhost:3000/api/connections/linkedin/callback");
    vi.stubEnv("LINKEDIN_SCOPES", "openid profile w_member_social");
    vi.stubEnv("LINKEDIN_API_VERSION", "202606");
    vi.stubEnv("LINKEDIN_API_BASE_URL", "https://api.linkedin.test");
    vi.stubEnv("LINKEDIN_OAUTH_BASE_URL", "https://www.linkedin.test/oauth/v2");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("node:dns/promises");
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("connects with OAuth tokens without returning raw secrets", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "linkedin-access-token",
          expires_in: 3600,
          refresh_token: "linkedin-refresh-token",
          scope: "openid profile w_member_social"
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          sub: "member_123",
          name: "Ada Lovelace",
          locale: "en-US"
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const linkedinProvider = await loadLinkedInProvider();
    const result = await linkedinProvider.connect({
      workspaceId,
      authorizationCode: "auth-code",
      redirectUri: "http://localhost:3000/api/connections/linkedin/callback"
    });

    expect(result).toMatchObject({
      provider: "linkedin",
      providerAccountId: "member_123",
      displayName: "Ada Lovelace",
      status: "connected",
      scopes: ["openid", "profile", "w_member_social"]
    });
    expect(result.tokenRef).toContain("vault_linkedin_");
    expect(JSON.stringify(result)).not.toContain("linkedin-access-token");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.linkedin.test/oauth/v2/accessToken",
      expect.objectContaining({
        method: "POST"
      })
    );
  });

  it("marks accounts missing publish scope as not ready", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "linkedin-access-token",
          expires_in: 3600,
          scope: "openid profile"
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          sub: "member_123",
          name: "Ada Lovelace"
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const linkedinProvider = await loadLinkedInProvider();
    const result = await linkedinProvider.connect({
      workspaceId,
      authorizationCode: "auth-code",
      redirectUri: "http://localhost:3000/api/connections/linkedin/callback"
    });

    expect(result.status).toBe("requires_configuration");
    expect(result.capabilities.scheduled_publish.supported).toBe(false);
  });

  it("requires member publishing scope for the member-author adapter", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "linkedin-access-token",
          expires_in: 3600,
          scope: "openid profile w_organization_social"
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          sub: "member_123",
          name: "Ada Lovelace"
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const linkedinProvider = await loadLinkedInProvider();
    const result = await linkedinProvider.connect({
      workspaceId,
      authorizationCode: "auth-code",
      redirectUri: "http://localhost:3000/api/connections/linkedin/callback"
    });

    expect(result.status).toBe("requires_configuration");
    expect(result.capabilities.scheduled_publish.supported).toBe(false);
  });

  it("refreshes expired tokens before publishing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "fresh-access-token",
          expires_in: 3600,
          scope: "openid profile w_member_social"
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {},
          {
            status: 201,
            headers: {
              "x-restli-id": "urn:li:share:123"
            }
          }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const linkedinProvider = await loadLinkedInProvider();
    const connection = await linkedinProvider.connect({
      workspaceId,
      providerAccountId: "member_123",
      tokens: {
        accessToken: "expired-access-token",
        refreshToken: "refresh-token",
        expiresAt: new Date(Date.now() - 60_000),
        scopes: ["openid", "profile", "w_member_social"]
      },
      metadata: {
        profile: {
          sub: "member_123",
          name: "Ada Lovelace"
        }
      }
    });
    const result = await linkedinProvider.publish({
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
      provider: "linkedin",
      providerPostId: "urn:li:share:123",
      status: "published"
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://www.linkedin.test/oauth/v2/accessToken",
      expect.objectContaining({
        method: "POST"
      })
    );
  });

  it("normalizes retryable LinkedIn API failures", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(
        {
          message: "Rate limit exceeded"
        },
        {
          status: 429
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const linkedinProvider = await loadLinkedInProvider();
    const connection = await linkedinProvider.connect({
      workspaceId,
      providerAccountId: "member_123",
      tokens: {
        accessToken: "access-token",
        expiresAt: new Date(Date.now() + 10 * 60_000),
        scopes: ["openid", "profile", "w_member_social"]
      },
      metadata: {
        profile: {
          sub: "member_123",
          name: "Ada Lovelace"
        }
      }
    });

    await expect(
      linkedinProvider.publish({
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
      })
    ).rejects.toMatchObject({
      code: "provider_transient",
      retryable: true
    });
  });

  it("rejects private image source URLs before outbound fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const linkedinProvider = await loadLinkedInProvider();
    const connection = await linkedinProvider.connect({
      workspaceId,
      providerAccountId: "member_123",
      tokens: {
        accessToken: "access-token",
        expiresAt: new Date(Date.now() + 10 * 60_000),
        scopes: ["openid", "profile", "w_member_social"]
      },
      metadata: {
        profile: {
          sub: "member_123",
          name: "Ada Lovelace"
        }
      }
    });

    await expect(
      linkedinProvider.publish({
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
          media: [
            {
              sourceUrl: "https://127.0.0.1/private.png"
            }
          ]
        }
      })
    ).rejects.toMatchObject({
      code: "content_invalid"
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects arbitrary external image source URLs before outbound fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const linkedinProvider = await loadLinkedInProvider();
    const connection = await linkedinProvider.connect({
      workspaceId,
      providerAccountId: "member_123",
      tokens: {
        accessToken: "access-token",
        expiresAt: new Date(Date.now() + 10 * 60_000),
        scopes: ["openid", "profile", "w_member_social"]
      },
      metadata: {
        profile: {
          sub: "member_123",
          name: "Ada Lovelace"
        }
      }
    });

    await expect(
      linkedinProvider.publish({
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
          media: [
            {
              sourceUrl: "https://cdn.example.com/customer-controlled.png"
            }
          ]
        }
      })
    ).rejects.toMatchObject({
      code: "content_invalid"
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects default ImageKit tenant URLs when a custom endpoint is configured", async () => {
    vi.stubEnv("IMAGEKIT_URL_ENDPOINT", "https://ik.imagekit.io/trusted-account");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const linkedinProvider = await loadLinkedInProvider();
    const connection = await linkedinProvider.connect({
      workspaceId,
      providerAccountId: "member_123",
      tokens: {
        accessToken: "access-token",
        expiresAt: new Date(Date.now() + 10 * 60_000),
        scopes: ["openid", "profile", "w_member_social"]
      },
      metadata: {
        profile: {
          sub: "member_123",
          name: "Ada Lovelace"
        }
      }
    });

    await expect(
      linkedinProvider.publish({
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
          media: [
            {
              sourceUrl: "https://ik.imagekit.io/other-account/customer-controlled.png"
            }
          ]
        }
      })
    ).rejects.toMatchObject({
      code: "content_invalid"
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("classifies trusted image source redirects as non-retryable invalid content", async () => {
    vi.stubEnv("IMAGEKIT_URL_ENDPOINT", "");
    vi.doMock("node:dns/promises", () => ({
      lookup: vi.fn(async () => [{ address: "203.0.113.10", family: 4 }])
    }));
    const sourceUrl = "https://ik.imagekit.io/local-preview/redirect.png";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          value: {
            image: "urn:li:image:123",
            uploadUrl: "https://linkedin-upload.test/image"
          }
        })
      )
      .mockResolvedValueOnce(
        // Node's undici fetch returns a visible 3xx response for redirect: "manual".
        new Response(null, {
          status: 302,
          headers: {
            Location: "https://127.0.0.1/private.png"
          }
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const linkedinProvider = await loadLinkedInProvider();
    const connection = await linkedinProvider.connect({
      workspaceId,
      providerAccountId: "member_123",
      tokens: {
        accessToken: "access-token",
        expiresAt: new Date(Date.now() + 10 * 60_000),
        scopes: ["openid", "profile", "w_member_social"]
      },
      metadata: {
        profile: {
          sub: "member_123",
          name: "Ada Lovelace"
        }
      }
    });

    await expect(
      linkedinProvider.publish({
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
          media: [
            {
              sourceUrl
            }
          ]
        }
      })
    ).rejects.toMatchObject({
      code: "content_invalid",
      retryable: false
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      sourceUrl,
      expect.objectContaining({
        redirect: "manual"
      })
    );
  });
});
