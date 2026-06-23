import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadCheckoutRoute() {
  const { GET } = await import("@/app/api/billing/checkout/route");
  return { GET };
}

async function loadPortalRoute() {
  const { GET } = await import("@/app/api/billing/portal/route");
  return { GET };
}

function mockWorkspaceUser() {
  vi.doMock("@/lib/auth/current-user", () => ({
    getCurrentUser: vi.fn(async () => ({
      id: "user_billing_1",
      email: "billing@example.com",
      name: "Billing User",
      imageUrl: null,
      initials: "BU",
      isLocalPreview: false
    }))
  }));
  vi.doMock("@/lib/workspaces/personal-workspace", () => ({
    resolvePersonalWorkspaceForUser: vi.fn(async () => ({
      id: "workspace_billing_1",
      role: "owner",
      isLocalPreview: false
    }))
  }));
}

function mockLocalPreviewUser() {
  vi.doMock("@/lib/auth/current-user", () => ({
    getCurrentUser: vi.fn(async () => ({
      id: "local-preview-user",
      email: "local-preview@example.com",
      name: "Local Preview",
      imageUrl: null,
      initials: "LP",
      isLocalPreview: true
    }))
  }));
  vi.doMock("@/lib/workspaces/personal-workspace", () => ({
    resolvePersonalWorkspaceForUser: vi.fn(async () => ({
      id: "00000000-0000-0000-0000-000000000001",
      role: "owner",
      isLocalPreview: true
    }))
  }));
}

describe("billing action routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("AUTH_LOCAL_PREVIEW", "");
    vi.stubEnv("PLAYWRIGHT_AUTH_LOCAL_PREVIEW", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.stubEnv("BILLING_UPGRADE_URL", "");
    vi.stubEnv("BILLING_CUSTOMER_PORTAL_URL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("@/lib/auth/current-user");
    vi.doUnmock("@/lib/workspaces/personal-workspace");
    vi.resetModules();
  });

  it("returns a safe unconfigured checkout contract", async () => {
    mockWorkspaceUser();
    const { GET } = await loadCheckoutRoute();
    const response = await GET(
      new NextRequest("http://localhost:3000/api/billing/checkout", {
        headers: {
          accept: "application/json"
        }
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({
      error: "Billing upgrade is not configured.",
      code: "billing_action_not_configured",
      action: "checkout"
    });
  });

  it("returns a configured checkout URL with workspace context", async () => {
    vi.stubEnv("BILLING_UPGRADE_URL", "https://billing.example.com/checkout?plan=premium");
    mockWorkspaceUser();
    const { GET } = await loadCheckoutRoute();
    const response = await GET(
      new NextRequest("http://localhost:3000/api/billing/checkout", {
        headers: {
          accept: "application/json"
        }
      })
    );
    const payload = await response.json();
    const url = new URL(payload.url);

    expect(response.status).toBe(200);
    expect(payload.action).toBe("checkout");
    expect(url.origin).toBe("https://billing.example.com");
    expect(url.searchParams.get("plan")).toBe("premium");
    expect(url.searchParams.get("workspace_id")).toBe("workspace_billing_1");
    expect(url.searchParams.get("user_id")).toBe("user_billing_1");
    expect(url.searchParams.get("client_reference_id")).toBe("workspace_billing_1");
    expect(url.searchParams.get("return_url")).toBe("http://localhost:3000/billing");
  });

  it("rejects configured billing actions in local preview", async () => {
    vi.stubEnv("BILLING_UPGRADE_URL", "https://billing.example.com/checkout");
    mockLocalPreviewUser();
    const { GET } = await loadCheckoutRoute();
    const response = await GET(
      new NextRequest("http://localhost:3000/api/billing/checkout", {
        headers: {
          accept: "application/json"
        }
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toEqual({
      error: "Billing actions are disabled in local preview.",
      code: "billing_action_unavailable",
      action: "checkout"
    });
  });

  it("redirects to the configured customer portal URL", async () => {
    vi.stubEnv("BILLING_CUSTOMER_PORTAL_URL", "https://billing.example.com/portal");
    mockWorkspaceUser();
    const { GET } = await loadPortalRoute();
    const response = await GET(new NextRequest("http://localhost:3000/api/billing/portal"));
    const location = response.headers.get("location");

    expect(response.status).toBe(307);
    expect(location).toContain("https://billing.example.com/portal");
    expect(location).toContain("workspace_id=workspace_billing_1");
  });
});
