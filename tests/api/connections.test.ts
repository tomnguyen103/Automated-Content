import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadConnectionRoutes() {
  const [
    { GET: connect },
    { GET: callback },
    { GET: readHealth, POST: refreshHealth },
    { POST: disconnect },
    { clearProviderConnectionsForTests },
    { clearProviderTokenVaultForTests }
  ] =
    await Promise.all([
      import("@/app/api/connections/[provider]/connect/route"),
      import("@/app/api/connections/[provider]/callback/route"),
      import("@/app/api/connections/[provider]/health/route"),
      import("@/app/api/connections/[provider]/disconnect/route"),
      import("@/lib/providers/connections"),
      import("@/lib/providers/token-vault")
    ]);

  clearProviderConnectionsForTests();
  clearProviderTokenVaultForTests();

  return { connect, callback, readHealth, refreshHealth, disconnect };
}

describe("connection API routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("AUTH_LOCAL_PREVIEW", "1");
    vi.stubEnv("PLAYWRIGHT_AUTH_LOCAL_PREVIEW", "1");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    vi.stubEnv("CLERK_SECRET_KEY", "");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("LINKEDIN_CLIENT_ID", "");
    vi.stubEnv("LINKEDIN_CLIENT_SECRET", "");
    vi.stubEnv("X_API_BASE_URL", "https://api.x.test");
    vi.stubEnv("X_CLIENT_ID", "");
    vi.stubEnv("X_CLIENT_SECRET", "");
    vi.stubEnv("X_OAUTH_AUTHORIZE_URL", "https://x.test/i/oauth2/authorize");
    vi.stubEnv("X_REDIRECT_URI", "http://localhost:3000/api/connections/x/callback");
    vi.stubEnv("X_SCOPES", "tweet.read tweet.write users.read offline.access");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("connects the mock provider in local preview without raw token payloads", async () => {
    const { connect } = await loadConnectionRoutes();
    const response = await connect(
      new NextRequest("http://localhost:3000/api/connections/mock/connect", {
        headers: {
          Accept: "application/json"
        }
      }),
      {
        params: Promise.resolve({ provider: "mock" })
      }
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.connection).toMatchObject({
      provider: "mock",
      status: "connected"
    });
    expect(JSON.stringify(payload)).not.toContain("mock_access_token");
  });

  it("reads provider health with account metadata for configured preview providers", async () => {
    const { readHealth } = await loadConnectionRoutes();
    const response = await readHealth(
      new NextRequest("http://localhost:3000/api/connections/mock/health", {
        headers: {
          Accept: "application/json"
        }
      }),
      {
        params: Promise.resolve({ provider: "mock" })
      }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.health).toMatchObject({
      provider: "mock",
      status: "ready"
    });
    expect(payload.account).toMatchObject({
      provider: "mock",
      status: "connected"
    });
  });

  it("refreshes provider health with a POST mutation", async () => {
    const { refreshHealth } = await loadConnectionRoutes();
    const response = await refreshHealth(
      new NextRequest("http://localhost:3000/api/connections/mock/health", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      }),
      {
        params: Promise.resolve({ provider: "mock" })
      }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.health).toMatchObject({
      provider: "mock",
      status: "ready"
    });
    expect(payload.account).toMatchObject({
      provider: "mock",
      status: "connected"
    });
  });

  it("disconnects only owned provider accounts", async () => {
    const { disconnect, readHealth } = await loadConnectionRoutes();
    const healthResponse = await readHealth(
      new NextRequest("http://localhost:3000/api/connections/mock/health", {
        headers: {
          Accept: "application/json"
        }
      }),
      {
        params: Promise.resolve({ provider: "mock" })
      }
    );
    const healthPayload = await healthResponse.json();
    const response = await disconnect(
      new NextRequest("http://localhost:3000/api/connections/mock/disconnect", {
        method: "POST",
        body: JSON.stringify({
          accountId: healthPayload.account.id
        })
      }),
      {
        params: Promise.resolve({ provider: "mock" })
      }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.account.status).toBe("disconnected");

    const missingResponse = await disconnect(
      new NextRequest("http://localhost:3000/api/connections/mock/disconnect", {
        method: "POST",
        body: JSON.stringify({
          accountId: "not-owned"
        })
      }),
      {
        params: Promise.resolve({ provider: "mock" })
      }
    );

    expect(missingResponse.status).toBe(404);
  });

  it("keeps preview mock lifecycle memory-backed when database env exists", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@example.test/db");
    const { disconnect, readHealth } = await loadConnectionRoutes();
    const healthResponse = await readHealth(
      new NextRequest("http://localhost:3000/api/connections/mock/health", {
        headers: {
          Accept: "application/json"
        }
      }),
      {
        params: Promise.resolve({ provider: "mock" })
      }
    );
    const healthPayload = await healthResponse.json();

    expect(healthResponse.status).toBe(200);
    expect(healthPayload.account.status).toBe("connected");

    const disconnectResponse = await disconnect(
      new NextRequest("http://localhost:3000/api/connections/mock/disconnect", {
        method: "POST",
        body: JSON.stringify({
          accountId: healthPayload.account.id
        })
      }),
      {
        params: Promise.resolve({ provider: "mock" })
      }
    );
    const disconnectPayload = await disconnectResponse.json();

    expect(disconnectResponse.status).toBe(200);
    expect(disconnectPayload.account.status).toBe("disconnected");
  });

  it("starts X OAuth with a PKCE verifier stored only in cookies", async () => {
    vi.stubEnv("X_CLIENT_ID", "x-client-id");
    const { connect } = await loadConnectionRoutes();
    const response = await connect(
      new NextRequest("http://localhost:3000/api/connections/x/connect", {
        headers: {
          Accept: "application/json"
        }
      }),
      {
        params: Promise.resolve({ provider: "x" })
      }
    );
    const payload = await response.json();
    const authorizationUrl = new URL(payload.authorizationUrl);

    expect(response.status).toBe(200);
    expect(payload.provider.key).toBe("x");
    expect(JSON.stringify(payload)).not.toContain("codeVerifier");
    expect(authorizationUrl.origin).toBe("https://x.test");
    expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorizationUrl.searchParams.get("scope")).toBe("tweet.read tweet.write users.read offline.access");
    const setCookieHeaders =
      (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ??
      [response.headers.get("set-cookie") ?? ""];

    expect(setCookieHeaders.join("\n")).toContain("provider_oauth_code_verifier_x=");
  });

  it("completes X OAuth callbacks and persists a safe connection payload", async () => {
    vi.stubEnv("X_CLIENT_ID", "x-client-id");
    vi.stubEnv("X_CLIENT_SECRET", "x-client-secret");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "x-access-token",
            expires_in: 3600,
            refresh_token: "x-refresh-token",
            scope: "tweet.read tweet.write users.read offline.access"
          }),
          {
            headers: {
              "Content-Type": "application/json"
            }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              id: "user_123",
              name: "Ada Lovelace",
              username: "ada"
            }
          }),
          {
            headers: {
              "Content-Type": "application/json"
            }
          }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const { callback } = await loadConnectionRoutes();
    const response = await callback(
      new NextRequest("http://localhost:3000/api/connections/x/callback?code=auth-code&state=state-123", {
        headers: {
          Accept: "application/json",
          Cookie: "provider_oauth_state_x=state-123; provider_oauth_code_verifier_x=verifier-123"
        }
      }),
      {
        params: Promise.resolve({ provider: "x" })
      }
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.connection).toMatchObject({
      provider: "x",
      providerAccountId: "user_123",
      displayName: "@ada",
      status: "connected"
    });
    expect(JSON.stringify(payload)).not.toContain("x-access-token");
    const setCookieHeaders =
      (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ??
      [response.headers.get("set-cookie") ?? ""];

    expect(setCookieHeaders.join("\n")).toContain("provider_oauth_state_x=;");
    expect(setCookieHeaders.join("\n")).toContain("provider_oauth_code_verifier_x=;");
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain("code_verifier=verifier-123");
  });
});
