import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const usageMetric = {
  key: "mediaTransformsPerMonth",
  label: "Media transforms",
  used: 10,
  limit: 10,
  remaining: 0,
  allowed: false,
  cadence: "monthly"
} as const;

class UsageLimitExceededError extends Error {
  readonly metric: typeof usageMetric;

  constructor(metric = usageMetric) {
    super("Media transforms limit reached for the current plan.");
    this.name = "UsageLimitExceededError";
    this.metric = metric;
  }
}

class ObjectStorageConfigurationError extends Error {}
class ObjectStorageUploadIntentError extends Error {}

const storageConfig = {
  accessKeyId: "storage_access_key",
  bucket: "automated-content-prod-video",
  maxUploadBytes: 50_000_000,
  provider: "s3",
  publicBaseUrl: "https://media.automatedcontent.dev",
  region: "us-east-1",
  secretAccessKey: "storage_secret_key"
} as const;

async function loadSourceUploadIntentRoute() {
  const { POST } = await import("@/app/api/media/source-upload-intents/route");

  return { POST };
}

function mockProductionContext({
  consumeUsageForLimit = vi.fn(async () => null),
  getObjectStorageConfig = vi.fn(() => storageConfig),
  createSignedSourceVideoUploadIntent = vi.fn(async () => ({
    bucket: "automated-content-prod-video",
    expiresAt: "2026-06-25T12:45:00.000Z",
    headers: {
      "content-type": "video/mp4",
      "x-amz-meta-uploadedbyuserid": "user_upload_1",
      "x-amz-meta-workspaceid": "workspace_upload_1"
    },
    key: "workspaces/workspace_upload_1/source-videos/2026/06/source_upload_1.mp4",
    maxUploadBytes: 50_000_000,
    provider: "s3",
    publicUrl:
      "https://media.automatedcontent.dev/workspaces/workspace_upload_1/source-videos/2026/06/source_upload_1.mp4",
    uploadUrl: "https://signed-upload.example.com/put"
  }))
}: {
  consumeUsageForLimit?: ReturnType<typeof vi.fn>;
  getObjectStorageConfig?: ReturnType<typeof vi.fn>;
  createSignedSourceVideoUploadIntent?: ReturnType<typeof vi.fn>;
} = {}) {
  vi.doMock("@/lib/auth/current-user", () => ({
    getCurrentUser: vi.fn(async () => ({
      id: "user_upload_1",
      email: "upload@example.com",
      name: "Upload User",
      imageUrl: null,
      initials: "UU",
      isLocalPreview: false
    }))
  }));
  vi.doMock("@/lib/workspaces/personal-workspace", () => ({
    resolvePersonalWorkspaceForUser: vi.fn(async () => ({
      id: "workspace_upload_1",
      role: "owner",
      isLocalPreview: false
    }))
  }));
  vi.doMock("@/lib/billing/usage", () => ({
    UsageLimitExceededError,
    consumeUsageForLimit
  }));
  vi.doMock("@/lib/media/object-storage", () => ({
    ObjectStorageConfigurationError,
    ObjectStorageUploadIntentError,
    createSignedSourceVideoUploadIntent,
    getObjectStorageConfig
  }));

  return {
    consumeUsageForLimit,
    getObjectStorageConfig,
    createSignedSourceVideoUploadIntent
  };
}

function sourceUploadIntentRequest(
  overrides: Partial<{
    contentType: string;
    fileName: string;
    sizeBytes: number;
  }> = {}
) {
  return new NextRequest("http://localhost:3000/api/media/source-upload-intents", {
    method: "POST",
    body: JSON.stringify({
      contentType: "video/mp4",
      fileName: "Launch Clip.mp4",
      sizeBytes: 12_000_000,
      ...overrides
    })
  });
}

describe("source upload intents API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("AUTH_LOCAL_PREVIEW", "");
    vi.stubEnv("PLAYWRIGHT_AUTH_LOCAL_PREVIEW", "");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    vi.stubEnv("CLERK_SECRET_KEY", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("@/lib/auth/current-user");
    vi.doUnmock("@/lib/billing/usage");
    vi.doUnmock("@/lib/media/object-storage");
    vi.doUnmock("@/lib/workspaces/personal-workspace");
    vi.resetModules();
  });

  it("records media usage before creating production source upload intents", async () => {
    const { consumeUsageForLimit, createSignedSourceVideoUploadIntent } = mockProductionContext();
    const { POST } = await loadSourceUploadIntentRoute();

    const response = await POST(sourceUploadIntentRequest());
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.intent.uploadUrl).toBe("https://signed-upload.example.com/put");
    expect(consumeUsageForLimit).toHaveBeenCalledWith({
      workspaceId: "workspace_upload_1",
      key: "mediaTransformsPerMonth",
      sourceId: expect.stringMatching(/^source_upload_intent:source_/),
      metadata: {
        contentType: "video/mp4",
        fileName: "Launch Clip.mp4",
        sizeBytes: 12_000_000,
        userId: "user_upload_1"
      },
      skip: false
    });
    expect(createSignedSourceVideoUploadIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace_upload_1",
        userId: "user_upload_1",
        fileName: "Launch Clip.mp4",
        contentType: "video/mp4",
        sizeBytes: 12_000_000,
        id: expect.stringMatching(/^source_/),
        config: storageConfig
      })
    );
    const usageCalls = consumeUsageForLimit.mock.calls as Array<[{ sourceId?: string }]>;
    const intentCalls = createSignedSourceVideoUploadIntent.mock.calls as Array<[{ id?: string }]>;
    expect(usageCalls[0]?.[0].sourceId).toBe(`source_upload_intent:${intentCalls[0]?.[0].id}`);
  });

  it("returns 429 before signing source upload intents when media usage is exhausted", async () => {
    const consumeUsageForLimit = vi.fn(async () => {
      throw new UsageLimitExceededError();
    });
    const createSignedSourceVideoUploadIntent = vi.fn();
    mockProductionContext({
      consumeUsageForLimit,
      createSignedSourceVideoUploadIntent
    });
    const { POST } = await loadSourceUploadIntentRoute();

    const response = await POST(sourceUploadIntentRequest());
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload).toEqual({
      error: "Media transforms limit reached for the current plan.",
      usage: usageMetric
    });
    expect(createSignedSourceVideoUploadIntent).not.toHaveBeenCalled();
  });

  it("rejects oversized source upload intents before consuming media usage", async () => {
    const consumeUsageForLimit = vi.fn(async () => null);
    const createSignedSourceVideoUploadIntent = vi.fn();
    mockProductionContext({
      consumeUsageForLimit,
      getObjectStorageConfig: vi.fn(() => ({
        ...storageConfig,
        maxUploadBytes: 1_000
      })),
      createSignedSourceVideoUploadIntent
    });
    const { POST } = await loadSourceUploadIntentRoute();

    const response = await POST(sourceUploadIntentRequest({ sizeBytes: 12_000_000 }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Source video exceeds the configured upload size limit.");
    expect(consumeUsageForLimit).not.toHaveBeenCalled();
    expect(createSignedSourceVideoUploadIntent).not.toHaveBeenCalled();
  });
});
