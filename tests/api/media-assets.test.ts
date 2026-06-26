import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localPreviewWorkspaceId } from "@/lib/workspaces/personal-workspace";

const sampleAsset = {
  id: "media_route_asset",
  workspaceId: localPreviewWorkspaceId,
  uploadedByUserId: "local-preview-user",
  provider: "mock",
  name: "Route asset",
  fileName: "route-asset.png",
  url: "data:image/png;base64,cm91dGUtYXNzZXQ=",
  thumbnailUrl: "data:image/png;base64,cm91dGUtYXNzZXQtdGh1bWI=",
  mediaType: "image",
  mimeType: "image/png",
  width: 1200,
  height: 900,
  sizeBytes: 24000,
  tags: ["automated-content", "campaign"],
  transformationDefaults: {
    crop: "maintain_ratio",
    focus: "auto",
    format: "auto",
    quality: 82
  },
  createdAt: "2026-06-20T18:00:00.000Z"
} as const;

async function loadMediaAssetRoute() {
  const [{ GET, POST }, { clearMediaAssetsForTests }] = await Promise.all([
    import("@/app/api/media/assets/route"),
    import("@/lib/media/assets")
  ]);

  return { GET, POST, clearMediaAssetsForTests };
}

describe("media assets API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("AUTH_LOCAL_PREVIEW", "1");
    vi.stubEnv("PLAYWRIGHT_AUTH_LOCAL_PREVIEW", "1");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    vi.stubEnv("CLERK_SECRET_KEY", "");
    vi.stubEnv("DATABASE_URL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("@/lib/auth/current-user");
    vi.doUnmock("@/lib/billing/usage");
    vi.doUnmock("@/lib/media/assets");
    vi.doUnmock("@/lib/workspaces/personal-workspace");
    vi.resetModules();
  });

  it("lists mock and saved media assets in local preview", async () => {
    const { GET, POST, clearMediaAssetsForTests } = await loadMediaAssetRoute();
    clearMediaAssetsForTests();

    const initialResponse = await GET();
    const initialPayload = await initialResponse.json();

    expect(initialResponse.status).toBe(200);
    expect(initialPayload.assets.length).toBeGreaterThan(0);
    expect(initialPayload.assets[0]).toMatchObject({
      workspaceId: localPreviewWorkspaceId,
      uploadedByUserId: "local-preview-user"
    });

    const saveResponse = await POST(
      new NextRequest("http://localhost:3000/api/media/assets", {
        method: "POST",
        body: JSON.stringify({
          assets: [sampleAsset]
        })
      })
    );
    const savePayload = await saveResponse.json();

    expect(saveResponse.status).toBe(201);
    expect(savePayload.assets).toHaveLength(1);
    expect(savePayload.assets[0]).toMatchObject({
      id: sampleAsset.id,
      workspaceId: localPreviewWorkspaceId,
      uploadedByUserId: "local-preview-user"
    });

    const nextResponse = await GET();
    const nextPayload = await nextResponse.json();

    expect(nextPayload.assets.some((asset: { id: string }) => asset.id === sampleAsset.id)).toBe(true);
  });

  it("bounds media asset list responses", async () => {
    const { GET, clearMediaAssetsForTests } = await loadMediaAssetRoute();
    clearMediaAssetsForTests();

    const response = await GET(new NextRequest("http://localhost:3000/api/media/assets?limit=1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.assets).toHaveLength(1);
  });

  it("fails closed when media assets are requested without authentication", async () => {
    vi.resetModules();
    vi.stubEnv("AUTH_LOCAL_PREVIEW", "");
    vi.stubEnv("PLAYWRIGHT_AUTH_LOCAL_PREVIEW", "");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    vi.stubEnv("CLERK_SECRET_KEY", "");

    const { GET } = await loadMediaAssetRoute();
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toBe("Authentication is required.");
  });

  it("rejects malformed media asset payloads", async () => {
    const { POST, clearMediaAssetsForTests } = await loadMediaAssetRoute();
    clearMediaAssetsForTests();

    const response = await POST(
      new NextRequest("http://localhost:3000/api/media/assets", {
        method: "POST",
        body: JSON.stringify({
          assets: [{ id: "" }]
        })
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Invalid media asset payload.");
  });

  it("deduplicates repeated asset ids before saving", async () => {
    const { POST, clearMediaAssetsForTests } = await loadMediaAssetRoute();
    clearMediaAssetsForTests();

    const response = await POST(
      new NextRequest("http://localhost:3000/api/media/assets", {
        method: "POST",
        body: JSON.stringify({
          assets: [sampleAsset, { ...sampleAsset, name: "Duplicate route asset" }]
        })
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.assets).toHaveLength(1);
    expect(payload.assets[0]).toMatchObject({
      id: sampleAsset.id,
      name: sampleAsset.name
    });
  });

  it("records one media usage event per saved production asset id", async () => {
    vi.resetModules();
    vi.stubEnv("AUTH_LOCAL_PREVIEW", "");
    vi.stubEnv("PLAYWRIGHT_AUTH_LOCAL_PREVIEW", "");
    vi.stubEnv("IMAGEKIT_PUBLIC_KEY", "public_test_key");
    vi.stubEnv("IMAGEKIT_PRIVATE_KEY", "private_test_key");
    vi.stubEnv("IMAGEKIT_URL_ENDPOINT", "https://ik.imagekit.io/test-account");

    const consumeUsageForLimit = vi.fn(async () => null);
    const productionAsset = {
      ...sampleAsset,
      id: "media_usage_asset",
      workspaceId: "workspace_usage_1",
      uploadedByUserId: "user_usage_1",
      provider: "imagekit",
      url: "https://ik.imagekit.io/test-account/automated-content/workspace_usage_1/media_usage_asset.png",
      thumbnailUrl: "https://ik.imagekit.io/test-account/automated-content/workspace_usage_1/media_usage_asset_thumb.png",
      imagekitFileId: "media_usage_asset",
      folder: "/automated-content/workspace_usage_1",
      tags: ["automated-content", "workspace:workspace_usage_1"]
    };

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

    const { POST, clearMediaAssetsForTests } = await loadMediaAssetRoute();
    clearMediaAssetsForTests();
    const response = await POST(
      new NextRequest("http://localhost:3000/api/media/assets", {
        method: "POST",
        body: JSON.stringify({
          assets: [productionAsset]
        })
      })
    );

    expect(response.status).toBe(201);
    expect(consumeUsageForLimit).toHaveBeenCalledWith({
      workspaceId: "workspace_usage_1",
      key: "mediaTransformsPerMonth",
      sourceId: "media_asset:media_usage_asset",
      metadata: {
        assetId: "media_usage_asset",
        provider: "imagekit",
        userId: "user_usage_1"
      },
      skip: false
    });
  });

  it("rejects external URLs before consuming media usage", async () => {
    vi.resetModules();
    vi.stubEnv("AUTH_LOCAL_PREVIEW", "");
    vi.stubEnv("PLAYWRIGHT_AUTH_LOCAL_PREVIEW", "");
    vi.stubEnv("IMAGEKIT_PUBLIC_KEY", "public_test_key");
    vi.stubEnv("IMAGEKIT_PRIVATE_KEY", "private_test_key");
    vi.stubEnv("IMAGEKIT_URL_ENDPOINT", "https://ik.imagekit.io/test-account");

    const consumeUsageForLimit = vi.fn(async () => null);
    const externalAsset = {
      ...sampleAsset,
      workspaceId: "workspace_usage_1",
      uploadedByUserId: "user_usage_1",
      provider: "imagekit",
      url: "https://example.com/tracker.png",
      thumbnailUrl: "https://example.com/tracker-thumb.png",
      imagekitFileId: "media_route_asset",
      folder: "/automated-content/workspace_usage_1",
      tags: ["automated-content", "workspace:workspace_usage_1"]
    };

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

    const { POST } = await loadMediaAssetRoute();
    const response = await POST(
      new NextRequest("http://localhost:3000/api/media/assets", {
        method: "POST",
        body: JSON.stringify({
          assets: [externalAsset]
        })
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("ImageKit media URL must come from the configured ImageKit endpoint.");
    expect(consumeUsageForLimit).not.toHaveBeenCalled();
  });

  it("returns a conflict when an asset id belongs to another workspace", async () => {
    vi.resetModules();
    vi.stubEnv("AUTH_LOCAL_PREVIEW", "1");
    vi.stubEnv("PLAYWRIGHT_AUTH_LOCAL_PREVIEW", "1");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    vi.stubEnv("CLERK_SECRET_KEY", "");

    class MediaAssetConflictError extends Error {
      constructor() {
        super("Media asset media_route_asset already belongs to a different workspace.");
      }
    }

    vi.doMock("@/lib/media/assets", () => ({
      assertMediaAssetProvenance: vi.fn(),
      MediaAssetConflictError,
      MediaAssetProvenanceError: class MediaAssetProvenanceError extends Error {},
      clearMediaAssetsForTests: vi.fn(),
      listMediaAssetsForWorkspace: vi.fn(),
      saveMediaAssetsForWorkspace: vi.fn(async () => {
        throw new MediaAssetConflictError();
      })
    }));

    const { POST } = await loadMediaAssetRoute();
    const response = await POST(
      new NextRequest("http://localhost:3000/api/media/assets", {
        method: "POST",
        body: JSON.stringify({
          assets: [sampleAsset]
        })
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toBe("Media asset media_route_asset already belongs to a different workspace.");
  });
});
