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
  NEXT_PUBLIC_APP_URL: z.preprocess(
    emptyToUndefined,
    z.string().url().default("http://localhost:3000")
  ),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: optionalString,
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: optionalString,
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: optionalString,
  NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: optionalString,
  NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: optionalString,
  CLERK_SECRET_KEY: optionalString,
  CLERK_WEBHOOK_SIGNING_SECRET: optionalString,
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
  REDIS_URL: optionalUrl,
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

export type AppEnv = typeof env;
export type AppEnvKey = keyof AppEnv;

export const isLocalPreviewAuthEnabled =
  env.AUTH_LOCAL_PREVIEW === "1" || process.env.PLAYWRIGHT_AUTH_LOCAL_PREVIEW === "1";

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
