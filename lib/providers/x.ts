import "server-only";

import crypto from "node:crypto";
import { appUrl, env } from "@/lib/env";
import { defineProviderCapabilities } from "@/lib/providers/capabilities";
import {
  ProviderCapabilityError,
  ProviderConfigurationError,
  ProviderError,
  normalizeProviderError
} from "@/lib/providers/errors";
import {
  getProviderTokens,
  storeProviderTokens,
  updateProviderTokens
} from "@/lib/providers/token-vault";
import type {
  ProviderAdapter,
  ProviderCapabilityMap,
  ProviderConnectionInput,
  ProviderConnectionResult,
  ProviderPublishContent,
  ProviderPublishInput,
  ProviderPublishResult,
  ProviderTokenSet
} from "@/lib/providers/types";

const defaultXScopes = ["tweet.read", "tweet.write", "users.read", "offline.access"] as const;
const requiredConnectionScopes = ["tweet.read", "tweet.write", "users.read"] as const;
const publishScopes = ["tweet.write"] as const;
const refreshSkewMs = 5 * 60 * 1000;
const xFetchTimeoutMs = 15_000;
const maxPostCharacters = 280;

export const xCapabilities = defineProviderCapabilities({
  supported: ["text_post", "scheduled_publish", "immediate_publish"],
  unsupportedReasons: {
    image_post: "X media upload is not enabled in this text-post adapter.",
    video_post: "X video publishing is not enabled in this adapter.",
    carousel: "X does not expose carousel publishing in this contract.",
    comment_ingest: "Reply ingestion requires a separate filtered stream worker.",
    comment_reply: "Reply automation is held for the comment-agent phase.",
    metrics_sync: "X metrics sync is not enabled until analytics API access is configured."
  }
});

type XConfig = {
  apiBaseUrl: string;
  authorizationUrl: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scopes: string[];
};

type XTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type XProfileResponse = {
  data?: {
    id?: string;
    name?: string;
    username?: string;
    profile_image_url?: string;
  };
  errors?: unknown[];
};

type XPostResponse = {
  data?: {
    id?: string;
    text?: string;
  };
  errors?: unknown[];
};

function splitScopes(value: string | undefined, fallback: readonly string[] = defaultXScopes): string[] {
  const scopes = value
    ?.split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);

  return scopes && scopes.length > 0 ? scopes : [...fallback];
}

export function getXRedirectUri() {
  return env.X_REDIRECT_URI ?? `${appUrl}/api/connections/x/callback`;
}

export function isXConfigured() {
  return Boolean(env.X_CLIENT_ID);
}

function getXConfig(): XConfig {
  if (!env.X_CLIENT_ID) {
    throw new ProviderConfigurationError("x", "X OAuth client id is not configured. Set X_CLIENT_ID.");
  }

  return {
    apiBaseUrl: env.X_API_BASE_URL ?? "https://api.x.com",
    authorizationUrl: env.X_OAUTH_AUTHORIZE_URL ?? "https://x.com/i/oauth2/authorize",
    clientId: env.X_CLIENT_ID,
    clientSecret: env.X_CLIENT_SECRET,
    redirectUri: getXRedirectUri(),
    scopes: splitScopes(env.X_SCOPES)
  };
}

export function createXCodeVerifier() {
  return crypto.randomBytes(32).toString("base64url");
}

export function createXCodeChallenge(codeVerifier: string) {
  return crypto.createHash("sha256").update(codeVerifier).digest("base64url");
}

export function buildXAuthorizationUrl({
  codeChallenge,
  redirectUri,
  state
}: {
  codeChallenge: string;
  redirectUri?: string;
  state: string;
}) {
  const config = getXConfig();
  const authorizationUrl = new URL(config.authorizationUrl);

  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("client_id", config.clientId);
  authorizationUrl.searchParams.set("redirect_uri", redirectUri ?? config.redirectUri);
  authorizationUrl.searchParams.set("scope", config.scopes.join(" "));
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("code_challenge", codeChallenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");

  return authorizationUrl;
}

function hasPublishScope(scopes: string[]) {
  return publishScopes.some((scope) => scopes.includes(scope));
}

function hasRequiredConnectionScopes(scopes: string[]) {
  return requiredConnectionScopes.every((scope) => scopes.includes(scope));
}

function capabilitiesForScopes(scopes: string[], reason = "Reconnect X with tweet.write scope.") {
  if (hasPublishScope(scopes)) {
    return xCapabilities;
  }

  return {
    ...xCapabilities,
    text_post: { ...xCapabilities.text_post, supported: false, reason },
    scheduled_publish: { ...xCapabilities.scheduled_publish, supported: false, reason },
    immediate_publish: { ...xCapabilities.immediate_publish, supported: false, reason }
  } satisfies ProviderCapabilityMap;
}

function getSupportedCapabilityKeys(capabilities: ProviderCapabilityMap) {
  return Object.values(capabilities)
    .filter((capability) => capability.supported)
    .map((capability) => capability.capability);
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const errors = Array.isArray(record.errors) ? record.errors : undefined;
    const firstError = errors?.find((error): error is Record<string, unknown> => Boolean(error && typeof error === "object"));
    const description =
      firstError?.detail ??
      firstError?.title ??
      record.error_description ??
      record.detail ??
      record.title ??
      record.message ??
      record.error;

    if (typeof description === "string" && description.trim().length > 0) {
      return description;
    }
  }

  return fallback;
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function createXApiError({
  fallback,
  payload,
  response
}: {
  fallback: string;
  payload: unknown;
  response: Response;
}) {
  return new ProviderError({
    code: response.status === 401 || response.status === 403 ? "provider_reauthorization_required" : "provider_api_error",
    message: getErrorMessage(payload, fallback),
    provider: "x",
    retryable: response.status === 429 || response.status >= 500,
    cause: payload
  });
}

async function fetchWithTimeout(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1] = {},
  timeoutMs = xFetchTimeoutMs
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    throw new ProviderError({
      code: "provider_transient",
      message:
        error instanceof Error && error.name === "AbortError"
          ? "X provider request timed out."
          : "X provider request failed.",
      provider: "x",
      retryable: true,
      cause: error
    });
  } finally {
    clearTimeout(timeout);
  }
}

function authorizationHeaders(config: XConfig): Record<string, string> {
  if (!config.clientSecret) {
    return {};
  }

  const encoded = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");

  return {
    Authorization: `Basic ${encoded}`
  };
}

function tokenRequestBody(
  config: XConfig,
  entries: Record<string, string>
) {
  const body = new URLSearchParams(entries);

  if (!config.clientSecret) {
    body.set("client_id", config.clientId);
  }

  return body;
}

function toTokenSet(payload: XTokenResponse, fallbackScopes: string[]): ProviderTokenSet {
  if (!payload.access_token) {
    throw new ProviderError({
      code: "provider_token_exchange_failed",
      message: "X did not return an access token.",
      provider: "x",
      retryable: false,
      cause: payload
    });
  }

  const scopes = splitScopes(payload.scope, fallbackScopes);
  const expiresAt = payload.expires_in
    ? new Date(Date.now() + payload.expires_in * 1000)
    : undefined;

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt,
    scopes
  };
}

function codeVerifierFromMetadata(input: ProviderConnectionInput) {
  const value = input.metadata?.codeVerifier;

  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

async function exchangeAuthorizationCode({
  code,
  codeVerifier,
  redirectUri
}: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}) {
  const config = getXConfig();
  const response = await fetchWithTimeout(`${config.apiBaseUrl}/2/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...authorizationHeaders(config)
    },
    body: tokenRequestBody(config, {
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code_verifier: codeVerifier
    })
  });
  const payload = (await parseJsonResponse(response)) as XTokenResponse;

  if (!response.ok) {
    throw createXApiError({
      fallback: "X token exchange failed.",
      payload,
      response
    });
  }

  return toTokenSet(payload, config.scopes);
}

async function refreshXToken(tokens: ProviderTokenSet) {
  if (!tokens.refreshToken) {
    throw new ProviderError({
      code: "provider_reauthorization_required",
      message: "X did not provide a refresh token. Reconnect the provider before publishing.",
      provider: "x",
      retryable: false
    });
  }

  const config = getXConfig();
  const response = await fetchWithTimeout(`${config.apiBaseUrl}/2/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...authorizationHeaders(config)
    },
    body: tokenRequestBody(config, {
      refresh_token: tokens.refreshToken,
      grant_type: "refresh_token"
    })
  });
  const payload = (await parseJsonResponse(response)) as XTokenResponse;

  if (!response.ok) {
    throw createXApiError({
      fallback: "X token refresh failed.",
      payload,
      response
    });
  }

  const refreshed = toTokenSet(payload, tokens.scopes ?? [...defaultXScopes]);

  return {
    ...refreshed,
    refreshToken: refreshed.refreshToken ?? tokens.refreshToken
  };
}

async function fetchXProfile(accessToken: string) {
  const config = getXConfig();
  const response = await fetchWithTimeout(`${config.apiBaseUrl}/2/users/me?user.fields=profile_image_url,username`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  const payload = (await parseJsonResponse(response)) as XProfileResponse;

  if (!response.ok) {
    throw createXApiError({
      fallback: "X profile lookup failed.",
      payload,
      response
    });
  }

  if (!payload.data?.id) {
    throw new ProviderError({
      code: "provider_profile_missing",
      message: "X user profile did not include an id.",
      provider: "x",
      retryable: false,
      cause: payload
    });
  }

  return payload.data;
}

function getDisplayName(profile: NonNullable<XProfileResponse["data"]>) {
  return profile.username ? `@${profile.username}` : (profile.name ?? "X account");
}

function formatPostText(content: ProviderPublishContent) {
  return [content.hook, content.body, content.cta, content.hashtags.join(" ")]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n\n");
}

async function getFreshTokens(context: ProviderPublishInput) {
  if (!context.tokenRef) {
    throw new ProviderError({
      code: "provider_token_missing",
      message: "X token reference is missing. Reconnect the provider account.",
      provider: "x",
      retryable: false
    });
  }

  const tokens = await getProviderTokens({
    tokenRef: context.tokenRef,
    workspaceId: context.workspaceId
  });

  if (!tokens?.accessToken) {
    throw new ProviderError({
      code: "provider_token_missing",
      message: "X token vault entry was not found.",
      provider: "x",
      retryable: false
    });
  }

  if (tokens.expiresAt && tokens.expiresAt.getTime() - Date.now() <= refreshSkewMs) {
    const refreshed = await refreshXToken(tokens);
    await updateProviderTokens({
      tokenRef: context.tokenRef,
      workspaceId: context.workspaceId,
      provider: "x",
      providerAccountId: context.providerAccountId ?? "x-account",
      tokens: refreshed
    });

    return refreshed;
  }

  return tokens;
}

export const xProvider: ProviderAdapter = {
  key: "x",
  displayName: "X",
  group: "social",
  implementationStatus: "live",
  website: "https://docs.x.com/x-api",
  capabilities: xCapabilities,
  async connect(input: ProviderConnectionInput): Promise<ProviderConnectionResult> {
    const authorizationCode = input.authorizationCode?.trim();
    const codeVerifier = codeVerifierFromMetadata(input);

    if (!authorizationCode && !input.tokens?.accessToken) {
      throw new ProviderConfigurationError(
        "x",
        "X authorization code or token payload is required to connect an account."
      );
    }

    if (authorizationCode && !codeVerifier) {
      throw new ProviderConfigurationError("x", "X OAuth code verifier is missing. Restart the connection flow.");
    }

    const tokens = input.tokens?.accessToken
      ? input.tokens
      : await exchangeAuthorizationCode({
          code: authorizationCode as string,
          codeVerifier: codeVerifier as string,
          redirectUri: input.redirectUri ?? getXRedirectUri()
        });

    if (!tokens.accessToken) {
      throw new ProviderError({
        code: "provider_token_missing",
        message: "X access token is missing.",
        provider: "x",
        retryable: false
      });
    }

    const profile = input.metadata?.profile && typeof input.metadata.profile === "object"
      ? (input.metadata.profile as NonNullable<XProfileResponse["data"]>)
      : await fetchXProfile(tokens.accessToken);
    const providerAccountId = input.providerAccountId ?? profile.id;

    if (!providerAccountId) {
      throw new ProviderError({
        code: "provider_profile_missing",
        message: "X account id is missing.",
        provider: "x",
        retryable: false
      });
    }

    const scopes = input.scopes ?? tokens.scopes ?? splitScopes(undefined);
    const capabilities = capabilitiesForScopes(scopes);
    const tokenResult = await storeProviderTokens({
      workspaceId: input.workspaceId,
      provider: "x",
      providerAccountId,
      tokens: {
        ...tokens,
        scopes,
        raw: {
          ...tokens.raw,
          profile: {
            id: providerAccountId,
            name: profile.name,
            username: profile.username,
            profileImageUrl: profile.profile_image_url
          }
        }
      }
    });

    return {
      provider: "x",
      providerAccountId,
      displayName: input.displayName ?? getDisplayName(profile),
      status: hasRequiredConnectionScopes(scopes) ? "connected" : "requires_configuration",
      tokenRef: tokenResult.tokenRef,
      scopes,
      capabilities,
      metadata: {
        accountType: "user",
        picture: profile.profile_image_url,
        tokenExpiresAt: tokenResult.expiresAt?.toISOString(),
        username: profile.username,
        missingScopes: requiredConnectionScopes.filter((scope) => !scopes.includes(scope))
      }
    };
  },
  async refreshToken(context) {
    if (!context.tokenRef) {
      throw new ProviderError({
        code: "provider_token_missing",
        message: "X token reference is missing. Reconnect the provider account.",
        provider: "x",
        retryable: false
      });
    }

    const tokens = await getProviderTokens({
      tokenRef: context.tokenRef,
      workspaceId: context.workspaceId
    });

    if (!tokens) {
      throw new ProviderError({
        code: "provider_token_missing",
        message: "X token vault entry was not found.",
        provider: "x",
        retryable: false
      });
    }

    const refreshed = await refreshXToken(tokens);
    const tokenResult = await updateProviderTokens({
      tokenRef: context.tokenRef,
      workspaceId: context.workspaceId,
      provider: "x",
      providerAccountId: context.providerAccountId ?? "x-account",
      tokens: refreshed
    });
    const scopes = refreshed.scopes ?? tokens.scopes ?? [];
    const capabilities = capabilitiesForScopes(scopes);

    return {
      provider: "x",
      providerAccountId: context.providerAccountId ?? "x-account",
      displayName: "X account",
      status: hasRequiredConnectionScopes(scopes) ? "connected" : "requires_configuration",
      tokenRef: tokenResult.tokenRef,
      scopes,
      capabilities,
      metadata: {
        tokenExpiresAt: tokenResult.expiresAt?.toISOString()
      }
    };
  },
  async validateCapabilities(context) {
    if (!context?.tokenRef) {
      return xCapabilities;
    }

    const tokens = await getProviderTokens({
      tokenRef: context.tokenRef,
      workspaceId: context.workspaceId
    });

    if (!tokens) {
      return capabilitiesForScopes([], "X token vault entry was not found.");
    }

    return capabilitiesForScopes(tokens.scopes ?? []);
  },
  async publish(input: ProviderPublishInput): Promise<ProviderPublishResult> {
    if (input.content.media.length > 0) {
      throw new ProviderCapabilityError("x", "image_post", xCapabilities.image_post.reason);
    }

    const text = formatPostText(input.content);

    if (!text) {
      throw new ProviderError({
        code: "content_invalid",
        message: "X post content cannot be empty.",
        provider: "x",
        retryable: false
      });
    }

    if ([...text].length > maxPostCharacters) {
      throw new ProviderError({
        code: "content_invalid",
        message: `X post content must be ${maxPostCharacters} characters or fewer for this adapter.`,
        provider: "x",
        retryable: false
      });
    }

    const tokens = await getFreshTokens(input);
    const config = getXConfig();
    const response = await fetchWithTimeout(`${config.apiBaseUrl}/2/tweets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text
      })
    });
    const payload = (await parseJsonResponse(response)) as XPostResponse;

    if (!response.ok) {
      throw createXApiError({
        fallback: "X post creation failed.",
        payload,
        response
      });
    }

    const providerPostId = payload.data?.id;

    if (!providerPostId) {
      throw new ProviderError({
        code: "provider_response_invalid",
        message: "X did not return a post id.",
        provider: "x",
        retryable: true,
        cause: payload
      });
    }

    return {
      provider: "x",
      providerPostId,
      status: "published",
      publishedAt: new Date(),
      url: `https://x.com/i/web/status/${providerPostId}`,
      raw: {
        providerPostId,
        scheduledJobId: input.scheduledJobId ?? null,
        textLength: [...text].length
      }
    };
  },
  async replyToComment() {
    throw new ProviderCapabilityError("x", "comment_reply", xCapabilities.comment_reply.reason);
  },
  async fetchMetrics() {
    throw new ProviderCapabilityError("x", "metrics_sync", xCapabilities.metrics_sync.reason);
  },
  normalizeError(error) {
    return normalizeProviderError("x", error);
  }
};

export function getXSupportedCapabilitiesForScopes(scopes: string[]) {
  return getSupportedCapabilityKeys(capabilitiesForScopes(scopes));
}
