import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
});
