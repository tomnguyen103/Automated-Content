import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localPreviewWorkspaceId } from "@/lib/workspaces/personal-workspace";

async function loadRoute() {
  const { GET } = await import("@/app/api/media/upload-auth/route");

  return { GET };
}

function signUploadToken(privateKey: string, token: string, expire: number) {
  return crypto.createHmac("sha1", privateKey).update(`${token}${expire}`).digest("hex");
}

describe("media upload auth API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("AUTH_LOCAL_PREVIEW", "1");
    vi.stubEnv("PLAYWRIGHT_AUTH_LOCAL_PREVIEW", "1");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    vi.stubEnv("CLERK_SECRET_KEY", "");
    vi.stubEnv("IMAGEKIT_PUBLIC_KEY", "");
    vi.stubEnv("IMAGEKIT_PRIVATE_KEY", "");
    vi.stubEnv("IMAGEKIT_URL_ENDPOINT", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("@/lib/auth/current-user");
    vi.doUnmock("@/lib/billing/usage");
    vi.doUnmock("@/lib/media/imagekit");
    vi.doUnmock("@/lib/workspaces/personal-workspace");
    vi.resetModules();
  });

  it("returns mock upload auth for authenticated local preview users", async () => {
    const { GET } = await loadRoute();
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.isConfigured).toBe(false);
    expect(payload.publicKey).toBe("local_preview_public_key");
    expect(payload.metadata.workspaceId).toBe(localPreviewWorkspaceId);
    expect(payload.metadata.provider).toBe("mock");
    expect(payload.folder).toContain("automated-content");
    expect(payload.signature).toBe(signUploadToken("local-preview-private-key", payload.token, payload.expire));
  });

  it("returns signed ImageKit upload auth when ImageKit is configured", async () => {
    vi.stubEnv("PLAYWRIGHT_AUTH_LOCAL_PREVIEW", "");
    vi.stubEnv("IMAGEKIT_PUBLIC_KEY", "public_test_key");
    vi.stubEnv("IMAGEKIT_PRIVATE_KEY", "private_test_key");
    vi.stubEnv("IMAGEKIT_URL_ENDPOINT", "https://ik.imagekit.io/test-account");

    const { GET } = await loadRoute();
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.isConfigured).toBe(true);
    expect(payload.publicKey).toBe("public_test_key");
    expect(payload.urlEndpoint).toBe("https://ik.imagekit.io/test-account");
    expect(payload.metadata.provider).toBe("imagekit");
    expect(payload.signature).toBe(signUploadToken("private_test_key", payload.token, payload.expire));
  });

  it("atomically consumes media usage for workspace-backed upload auth", async () => {
    vi.resetModules();
    vi.stubEnv("AUTH_LOCAL_PREVIEW", "");
    vi.stubEnv("PLAYWRIGHT_AUTH_LOCAL_PREVIEW", "1");
    vi.stubEnv("IMAGEKIT_PUBLIC_KEY", "public_test_key");
    vi.stubEnv("IMAGEKIT_PRIVATE_KEY", "private_test_key");
    vi.stubEnv("IMAGEKIT_URL_ENDPOINT", "https://ik.imagekit.io/test-account");

    const consumeUsageForLimit = vi.fn(async () => null);

    vi.doMock("@/lib/auth/current-user", () => ({
      getCurrentUser: vi.fn(async () => ({
        id: "user_usage_1",
        email: "user@example.com",
        name: "User Usage",
        imageUrl: null,
        initials: "UU",
        isLocalPreview: false
      }))
    }));
    vi.doMock("@/lib/workspaces/personal-workspace", () => ({
      resolvePersonalWorkspaceForUser: vi.fn(async () => ({
        id: "workspace_usage_1",
        role: "owner",
        isLocalPreview: false
      }))
    }));
    vi.doMock("@/lib/billing/usage", () => ({
      UsageLimitExceededError: class UsageLimitExceededError extends Error {},
      consumeUsageForLimit
    }));

    const { GET } = await loadRoute();
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.metadata.provider).toBe("imagekit");
    expect(consumeUsageForLimit).toHaveBeenCalledWith({
      workspaceId: "workspace_usage_1",
      key: "mediaTransformsPerMonth",
      metadata: {
        userId: "user_usage_1"
      },
      skip: false
    });
  });

  it("does not create upload auth when media usage is exhausted", async () => {
    vi.resetModules();
    vi.stubEnv("AUTH_LOCAL_PREVIEW", "");
    vi.stubEnv("PLAYWRIGHT_AUTH_LOCAL_PREVIEW", "");

    const metric = {
      key: "mediaTransformsPerMonth",
      label: "Media transforms",
      used: 10,
      limit: 10,
      remaining: 0,
      allowed: false,
      cadence: "monthly"
    };
    class UsageLimitExceededError extends Error {
      readonly metric = metric;

      constructor() {
        super("Media transforms limit reached for the current plan.");
      }
    }
    const consumeUsageForLimit = vi.fn(async () => {
      throw new UsageLimitExceededError();
    });
    const createImageKitUploadAuth = vi.fn();

    vi.doMock("@/lib/auth/current-user", () => ({
      getCurrentUser: vi.fn(async () => ({
        id: "user_usage_1",
        email: "user@example.com",
        name: "User Usage",
        imageUrl: null,
        initials: "UU",
        isLocalPreview: false
      }))
    }));
    vi.doMock("@/lib/workspaces/personal-workspace", () => ({
      resolvePersonalWorkspaceForUser: vi.fn(async () => ({
        id: "workspace_usage_1",
        role: "owner",
        isLocalPreview: false
      }))
    }));
    vi.doMock("@/lib/billing/usage", () => ({
      UsageLimitExceededError,
      consumeUsageForLimit
    }));
    vi.doMock("@/lib/media/imagekit", () => ({
      ImageKitConfigurationError: class ImageKitConfigurationError extends Error {},
      createImageKitUploadAuth
    }));

    const { GET } = await loadRoute();
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload.error).toBe("Media transforms limit reached for the current plan.");
    expect(payload.usage).toEqual(metric);
    expect(createImageKitUploadAuth).not.toHaveBeenCalled();
  });
});
