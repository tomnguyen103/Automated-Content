import { z } from "zod";

const emptyToUndefined = (value: unknown) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const optionalUrl = z.preprocess(emptyToUndefined, z.string().url().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: optionalString,
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: optionalString,
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: optionalString,
  NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: optionalString,
  NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: optionalString,
  CLERK_SECRET_KEY: optionalString,
  CLERK_WEBHOOK_SIGNING_SECRET: optionalString,
  BILLING_UPGRADE_URL: optionalUrl,
  BILLING_CUSTOMER_PORTAL_URL: optionalUrl,
  AUTH_LOCAL_PREVIEW: optionalString,
  DATABASE_URL: optionalUrl,
  AI_PROVIDER: z.enum(["openai", "gemini"]).default("openai"),
  OPENAI_API_KEY: optionalString,
  GEMINI_API_KEY: optionalString,
  LANGSMITH_API_KEY: optionalString,
  LANGSMITH_PROJECT: optionalString.default("automated-content-agent"),
  IMAGEKIT_PUBLIC_KEY: optionalString,
  IMAGEKIT_PRIVATE_KEY: optionalString,
  IMAGEKIT_URL_ENDPOINT: optionalUrl,
  TRIGGER_PROJECT_REF: optionalString,
  TRIGGER_SECRET_KEY: optionalString,
  TRIGGER_PREVIEW_BRANCH: optionalString,
  TRIGGER_API_URL: optionalUrl,
  TRIGGER_VERSION: optionalString,
  OBJECT_STORAGE_PROVIDER: z.enum(["s3", "r2"]).optional(),
  OBJECT_STORAGE_BUCKET: optionalString,
  OBJECT_STORAGE_REGION: optionalString,
  OBJECT_STORAGE_ENDPOINT: optionalUrl,
  OBJECT_STORAGE_PUBLIC_BASE_URL: optionalUrl,
  OBJECT_STORAGE_ACCESS_KEY_ID: optionalString,
  OBJECT_STORAGE_SECRET_ACCESS_KEY: optionalString,
  OBJECT_STORAGE_SIGNED_UPLOAD_MAX_BYTES: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().optional()
  ),
  DEEPGRAM_API_KEY: optionalString,
  LUMA_API_KEY: optionalString,
  REMOTION_RENDERER_MODE: optionalString,
  ARCJET_KEY: optionalString,
  ARCJET_MODE: z.enum(["detect", "protect"]).optional(),
  SENTRY_ENABLED: optionalString,
  SENTRY_DSN: optionalUrl,
  PROVIDER_TOKEN_ENCRYPTION_KEY: optionalString,
  LINKEDIN_CLIENT_ID: optionalString,
  LINKEDIN_CLIENT_SECRET: optionalString,
  LINKEDIN_REDIRECT_URI: optionalUrl,
  LINKEDIN_SCOPES: optionalString,
  LINKEDIN_API_VERSION: optionalString,
  LINKEDIN_API_BASE_URL: optionalUrl,
  LINKEDIN_OAUTH_BASE_URL: optionalUrl,
  X_API_BASE_URL: optionalUrl,
  X_CLIENT_ID: optionalString,
  X_CLIENT_SECRET: optionalString,
  X_OAUTH_AUTHORIZE_URL: optionalUrl,
  X_REDIRECT_URI: optionalUrl,
  X_SCOPES: optionalString,
  REDIS_URL: optionalUrl,
  N8N_WEBHOOK_URL: optionalUrl,
  N8N_WEBHOOK_SECRET: optionalString
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const formatted = parsedEnv.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");

  throw new Error(`Invalid environment configuration: ${formatted}`);
}

export const env = parsedEnv.data;

if (env.NODE_ENV === "production" && !env.NEXT_PUBLIC_APP_URL) {
  throw new Error("NEXT_PUBLIC_APP_URL is required in production.");
}

export const appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
export type AppEnv = typeof env;
export type AppEnvKey = keyof AppEnv;

function isLocalAppUrl(value: string) {
  try {
    const hostname = new URL(value).hostname;

    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

const playwrightPreviewFlag =
  process.env.PLAYWRIGHT_AUTH_LOCAL_PREVIEW === "1" && isLocalAppUrl(appUrl);

export const isLocalPreviewAuthEnabled =
  (env.NODE_ENV !== "production" && env.AUTH_LOCAL_PREVIEW === "1") || playwrightPreviewFlag;

export const isClerkConfigured = Boolean(
  !isLocalPreviewAuthEnabled && env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && env.CLERK_SECRET_KEY
);

export const isClerkClientConfigured = Boolean(
  !isLocalPreviewAuthEnabled && env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
);

export const isDatabaseConfigured = Boolean(env.DATABASE_URL);

export function requireEnv<K extends AppEnvKey>(key: K): NonNullable<AppEnv[K]> {
  const value = env[key];

  if (!value) {
    throw new Error(`${key} is required for this runtime path.`);
  }

  return value as NonNullable<AppEnv[K]>;
}

export function requireDatabaseUrl() {
  return requireEnv("DATABASE_URL");
}
