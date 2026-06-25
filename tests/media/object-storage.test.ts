import { describe, expect, it, vi } from "vitest";
import {
  createSignedSourceVideoUploadIntent,
  getObjectStorageConfig,
  ObjectStorageConfigurationError,
  ObjectStorageUploadIntentError,
  type ObjectStorageConfig
} from "@/lib/media/object-storage";

const config: ObjectStorageConfig = {
  accessKeyId: "storage-access-key",
  bucket: "automated-content-prod-video",
  maxUploadBytes: 50_000_000,
  provider: "s3",
  publicBaseUrl: "https://media.automatedcontent.dev",
  region: "us-east-1",
  secretAccessKey: "storage-secret-key"
};

describe("object storage upload intents", () => {
  it("builds signed source video upload intents with stable object keys", async () => {
    const signer = vi.fn(async () => "https://signed-upload.example.com/put");
    const intent = await createSignedSourceVideoUploadIntent({
      config,
      contentType: "video/mp4",
      fileName: "Launch Clip.MP4",
      id: "source_123",
      now: new Date("2026-06-25T12:30:00.000Z"),
      signer,
      sizeBytes: 12_000_000,
      userId: "user_123",
      workspaceId: "workspace_123"
    });

    expect(intent).toEqual({
      bucket: "automated-content-prod-video",
      expiresAt: "2026-06-25T12:45:00.000Z",
      headers: {
        "content-type": "video/mp4"
      },
      key: "workspaces/workspace_123/source-videos/2026/06/source_123.mp4",
      maxUploadBytes: 50_000_000,
      provider: "s3",
      publicUrl:
        "https://media.automatedcontent.dev/workspaces/workspace_123/source-videos/2026/06/source_123.mp4",
      uploadUrl: "https://signed-upload.example.com/put"
    });
    expect(signer).toHaveBeenCalledTimes(1);
  });

  it("rejects non-video uploads and files above the configured limit", async () => {
    await expect(
      createSignedSourceVideoUploadIntent({
        config,
        contentType: "image/png",
        fileName: "image.png",
        id: "source_123",
        signer: vi.fn(),
        sizeBytes: 100,
        userId: "user_123",
        workspaceId: "workspace_123"
      })
    ).rejects.toThrow(ObjectStorageUploadIntentError);

    await expect(
      createSignedSourceVideoUploadIntent({
        config,
        contentType: "video/mp4",
        fileName: "large.mp4",
        id: "source_124",
        signer: vi.fn(),
        sizeBytes: 60_000_000,
        userId: "user_123",
        workspaceId: "workspace_123"
      })
    ).rejects.toThrow("Source video exceeds the configured upload size limit.");
  });

  it("requires complete object storage configuration", () => {
    expect(() =>
      getObjectStorageConfig({
        OBJECT_STORAGE_ACCESS_KEY_ID: "storage-access-key",
        OBJECT_STORAGE_BUCKET: undefined,
        OBJECT_STORAGE_ENDPOINT: undefined,
        OBJECT_STORAGE_PROVIDER: "s3",
        OBJECT_STORAGE_PUBLIC_BASE_URL: "https://media.automatedcontent.dev",
        OBJECT_STORAGE_REGION: "us-east-1",
        OBJECT_STORAGE_SECRET_ACCESS_KEY: "storage-secret-key",
        OBJECT_STORAGE_SIGNED_UPLOAD_MAX_BYTES: 50_000_000
      })
    ).toThrow(ObjectStorageConfigurationError);
  });
});
