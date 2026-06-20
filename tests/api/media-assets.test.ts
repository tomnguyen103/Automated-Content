import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localPreviewWorkspaceId } from "@/lib/workspaces/personal-workspace";

const sampleAsset = {
  id: "media_route_asset",
  workspaceId: localPreviewWorkspaceId,
  uploadedByUserId: "local-preview-user",
  provider: "imagekit",
  name: "Route asset",
  fileName: "route-asset.png",
  url: "https://ik.imagekit.io/test/route-asset.png",
  thumbnailUrl: "https://ik.imagekit.io/test/route-asset-thumb.png",
  mediaType: "image",
  mimeType: "image/png",
  width: 1200,
  height: 900,
  sizeBytes: 24000,
  imagekitFileId: "media_route_asset",
  folder: "/automated-content/test",
  tags: ["campaign"],
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
    vi.resetModules();
  });

  it("lists mock and saved media assets in local preview", async () => {
    const { GET, POST, clearMediaAssetsForTests } = await loadMediaAssetRoute();
    clearMediaAssetsForTests();

    const initialResponse = await GET();
    const initialPayload = await initialResponse.json();

    expect(initialResponse.status).toBe(200);
    expect(initialPayload.assets.length).toBeGreaterThan(0);

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
});
