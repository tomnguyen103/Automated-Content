import "server-only";

import { PutObjectCommand, type PutObjectCommandInput, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";

export type ObjectStorageProvider = "s3" | "r2";

export type ObjectStorageConfig = {
  accessKeyId: string;
  bucket: string;
  endpoint?: string;
  maxUploadBytes: number;
  provider: ObjectStorageProvider;
  publicBaseUrl: string;
  region: string;
  secretAccessKey: string;
};

export type SourceVideoUploadIntent = {
  bucket: string;
  expiresAt: string;
  headers: Record<string, string>;
  key: string;
  maxUploadBytes: number;
  provider: ObjectStorageProvider;
  publicUrl: string;
  uploadUrl: string;
};

type ObjectStorageEnv = Pick<
  typeof env,
  | "OBJECT_STORAGE_ACCESS_KEY_ID"
  | "OBJECT_STORAGE_BUCKET"
  | "OBJECT_STORAGE_ENDPOINT"
  | "OBJECT_STORAGE_PROVIDER"
  | "OBJECT_STORAGE_PUBLIC_BASE_URL"
  | "OBJECT_STORAGE_REGION"
  | "OBJECT_STORAGE_SECRET_ACCESS_KEY"
  | "OBJECT_STORAGE_SIGNED_UPLOAD_MAX_BYTES"
>;

export class ObjectStorageConfigurationError extends Error {
  constructor(message = "Object storage is not configured.") {
    super(message);
    this.name = "ObjectStorageConfigurationError";
  }
}

export class ObjectStorageUploadIntentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ObjectStorageUploadIntentError";
  }
}

function required(value: string | undefined, key: string) {
  if (!value) {
    throw new ObjectStorageConfigurationError(`${key} is required for source video upload intents.`);
  }

  return value;
}

export function isObjectStorageConfigured(envMap: ObjectStorageEnv = env) {
  return Boolean(
    envMap.OBJECT_STORAGE_ACCESS_KEY_ID &&
      envMap.OBJECT_STORAGE_BUCKET &&
      envMap.OBJECT_STORAGE_PROVIDER &&
      envMap.OBJECT_STORAGE_PUBLIC_BASE_URL &&
      envMap.OBJECT_STORAGE_REGION &&
      envMap.OBJECT_STORAGE_SECRET_ACCESS_KEY &&
      envMap.OBJECT_STORAGE_SIGNED_UPLOAD_MAX_BYTES
  );
}

export function getObjectStorageConfig(envMap: ObjectStorageEnv = env): ObjectStorageConfig {
  const maxUploadBytes = envMap.OBJECT_STORAGE_SIGNED_UPLOAD_MAX_BYTES;

  if (!maxUploadBytes || !Number.isInteger(maxUploadBytes) || maxUploadBytes <= 0) {
    throw new ObjectStorageConfigurationError(
      "OBJECT_STORAGE_SIGNED_UPLOAD_MAX_BYTES must be a positive integer."
    );
  }

  return {
    accessKeyId: required(envMap.OBJECT_STORAGE_ACCESS_KEY_ID, "OBJECT_STORAGE_ACCESS_KEY_ID"),
    bucket: required(envMap.OBJECT_STORAGE_BUCKET, "OBJECT_STORAGE_BUCKET"),
    endpoint: envMap.OBJECT_STORAGE_ENDPOINT,
    maxUploadBytes,
    provider: envMap.OBJECT_STORAGE_PROVIDER ?? "s3",
    publicBaseUrl: required(envMap.OBJECT_STORAGE_PUBLIC_BASE_URL, "OBJECT_STORAGE_PUBLIC_BASE_URL"),
    region: required(envMap.OBJECT_STORAGE_REGION, "OBJECT_STORAGE_REGION"),
    secretAccessKey: required(envMap.OBJECT_STORAGE_SECRET_ACCESS_KEY, "OBJECT_STORAGE_SECRET_ACCESS_KEY")
  };
}

function sanitizePathSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function extensionFromFileName(fileName: string) {
  const extension = fileName.match(/\.([a-z0-9]{1,12})$/i)?.[1];
  return extension ? `.${extension.toLowerCase()}` : "";
}

export function createSourceVideoObjectKey({
  fileName,
  id,
  now = new Date(),
  workspaceId
}: {
  workspaceId: string;
  fileName: string;
  id: string;
  now?: Date;
}) {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const safeWorkspace = sanitizePathSegment(workspaceId) || "workspace";
  const safeId = sanitizePathSegment(id) || "upload";

  return [
    "workspaces",
    safeWorkspace,
    "source-videos",
    String(year),
    month,
    `${safeId}${extensionFromFileName(fileName)}`
  ].join("/");
}

function createS3Client(config: ObjectStorageConfig) {
  return new S3Client({
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    },
    endpoint: config.endpoint,
    forcePathStyle: config.provider === "r2" || Boolean(config.endpoint),
    region: config.region
  });
}

function joinPublicUrl(baseUrl: string, key: string) {
  return `${baseUrl.replace(/\/+$/, "")}/${key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
}

export async function createSignedSourceVideoUploadIntent({
  config = getObjectStorageConfig(),
  contentType,
  expiresInSeconds = 900,
  fileName,
  id,
  now = new Date(),
  signer = getSignedUrl,
  sizeBytes,
  userId,
  workspaceId
}: {
  workspaceId: string;
  userId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  id: string;
  config?: ObjectStorageConfig;
  expiresInSeconds?: number;
  now?: Date;
  signer?: (
    client: S3Client,
    command: PutObjectCommand,
    options: {
      expiresIn: number;
    }
  ) => Promise<string>;
}): Promise<SourceVideoUploadIntent> {
  if (!contentType.startsWith("video/")) {
    throw new ObjectStorageUploadIntentError("Only video uploads can use source video upload intents.");
  }

  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
    throw new ObjectStorageUploadIntentError("Source video size must be a positive integer.");
  }

  if (sizeBytes > config.maxUploadBytes) {
    throw new ObjectStorageUploadIntentError("Source video exceeds the configured upload size limit.");
  }

  const key = createSourceVideoObjectKey({
    fileName,
    id,
    now,
    workspaceId
  });
  const commandInput: PutObjectCommandInput = {
    Bucket: config.bucket,
    ContentLength: sizeBytes,
    ContentType: contentType,
    Key: key,
    Metadata: {
      uploadedByUserId: userId,
      workspaceId
    }
  };
  const uploadUrl = await signer(createS3Client(config), new PutObjectCommand(commandInput), {
    expiresIn: expiresInSeconds
  });
  const expiresAt = new Date(now.getTime() + expiresInSeconds * 1000).toISOString();

  return {
    bucket: config.bucket,
    expiresAt,
    headers: {
      "content-type": contentType
    },
    key,
    maxUploadBytes: config.maxUploadBytes,
    provider: config.provider,
    publicUrl: joinPublicUrl(config.publicBaseUrl, key),
    uploadUrl
  };
}
