import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadConnectionRoutes() {
  const [{ GET: connect }, { GET: readHealth, POST: refreshHealth }, { POST: disconnect }, { clearProviderConnectionsForTests }] =
    await Promise.all([
      import("@/app/api/connections/[provider]/connect/route"),
      import("@/app/api/connections/[provider]/health/route"),
      import("@/app/api/connections/[provider]/disconnect/route"),
      import("@/lib/providers/connections")
    ]);

  clearProviderConnectionsForTests();

  return { connect, readHealth, refreshHealth, disconnect };
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
});
