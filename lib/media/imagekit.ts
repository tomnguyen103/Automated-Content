import crypto from "node:crypto";
import { env } from "@/lib/env";
import { imageKitUploadAuthSchema, type ImageKitUploadAuth } from "@/lib/media/upload-auth";

const defaultExpirySeconds = 15 * 60;
const maxExpirySeconds = 60 * 60;

type ImageKitConfig = Pick<
  typeof env,
  "IMAGEKIT_PRIVATE_KEY" | "IMAGEKIT_PUBLIC_KEY" | "IMAGEKIT_URL_ENDPOINT"
>;

export class ImageKitConfigurationError extends Error {
  constructor(message = "ImageKit upload is not configured.") {
    super(message);
    this.name = "ImageKitConfigurationError";
  }
}

export function sanitizeImageKitPathSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function createImageKitUploadFolder(workspaceId: string) {
  return `/automated-content/${sanitizeImageKitPathSegment(workspaceId) || "workspace"}`;
}

function clampExpirySeconds(value: number | undefined) {
  const seconds = value ?? defaultExpirySeconds;

  return Math.min(Math.max(seconds, 60), maxExpirySeconds);
}

export function isImageKitConfigured(config: ImageKitConfig = env) {
  return Boolean(config.IMAGEKIT_PRIVATE_KEY && config.IMAGEKIT_PUBLIC_KEY && config.IMAGEKIT_URL_ENDPOINT);
}

export function createImageKitUploadAuth({
  allowMock = false,
  config = env,
  expiresInSeconds,
  now = () => new Date(),
  token = crypto.randomUUID(),
  userId,
  workspaceId
}: {
  workspaceId: string;
  userId: string;
  config?: ImageKitConfig;
  expiresInSeconds?: number;
  now?: () => Date;
  token?: string;
  allowMock?: boolean;
}): ImageKitUploadAuth {
  const configured = isImageKitConfigured(config);

  if (!configured && !allowMock) {
    throw new ImageKitConfigurationError();
  }

  const privateKey = configured ? config.IMAGEKIT_PRIVATE_KEY! : "local-preview-private-key";
  const publicKey = configured ? config.IMAGEKIT_PUBLIC_KEY! : "local_preview_public_key";
  const urlEndpoint = configured ? config.IMAGEKIT_URL_ENDPOINT! : "https://ik.imagekit.io/local-preview";
  const expire = Math.floor(now().getTime() / 1000) + clampExpirySeconds(expiresInSeconds);
  const signature = crypto.createHmac("sha1", privateKey).update(`${token}${expire}`).digest("hex");
  const folder = createImageKitUploadFolder(workspaceId);

  return imageKitUploadAuthSchema.parse({
    token,
    expire,
    signature,
    publicKey,
    urlEndpoint,
    folder,
    tags: ["automated-content", `workspace:${sanitizeImageKitPathSegment(workspaceId) || "workspace"}`],
    metadata: {
      workspaceId,
      uploadedByUserId: userId,
      provider: configured ? "imagekit" : "mock",
      folder
    },
    isConfigured: configured
  });
}
