import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
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

const profileScopes = ["openid", "profile"] as const;
const defaultLinkedInScopes = [...profileScopes, "w_member_social"] as const;
const publishScopes = ["w_member_social"] as const;
const refreshSkewMs = 5 * 60 * 1000;
const linkedInFetchTimeoutMs = 15_000;
const maxLinkedInImageBytes = 10 * 1024 * 1024;
const allowedLinkedInImageTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const defaultImageKitHostname = "ik.imagekit.io";

export const linkedinCapabilities = defineProviderCapabilities({
  supported: ["text_post", "image_post", "scheduled_publish", "immediate_publish"],
  unsupportedReasons: {
    video_post: "LinkedIn video publishing is not enabled in this adapter.",
    carousel: "LinkedIn carousel publishing is not enabled in this adapter.",
    comment_ingest: "LinkedIn comment ingest is disabled until approved API access and scopes are configured.",
    comment_reply: "LinkedIn comment replies are disabled until approved API access and scopes are configured.",
    metrics_sync: "LinkedIn metrics sync is disabled until approved API access and scopes are configured."
  }
});

type LinkedInConfig = {
  apiBaseUrl: string;
  apiVersion: string;
  clientId: string;
  clientSecret: string;
  oauthBaseUrl: string;
  redirectUri: string;
  scopes: string[];
};

type LinkedInTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

type LinkedInProfileResponse = {
  sub?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  locale?: string;
  email?: string;
};

type LinkedInImageUploadResponse = {
  value?: {
    image?: string;
    uploadUrl?: string;
    uploadUrlExpiresAt?: number;
  };
};

function splitScopes(value: string | undefined, fallback: readonly string[] = defaultLinkedInScopes): string[] {
  const scopes = value
    ?.split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);

  return scopes && scopes.length > 0 ? scopes : [...fallback];
}

export function getLinkedInRedirectUri() {
  return env.LINKEDIN_REDIRECT_URI ?? `${appUrl}/api/connections/linkedin/callback`;
}

export function isLinkedInConfigured() {
  return Boolean(env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET);
}

function getLinkedInConfig(): LinkedInConfig {
  if (!env.LINKEDIN_CLIENT_ID || !env.LINKEDIN_CLIENT_SECRET) {
    throw new ProviderConfigurationError(
      "linkedin",
      "LinkedIn OAuth credentials are not configured. Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET."
    );
  }

  return {
    apiBaseUrl: env.LINKEDIN_API_BASE_URL ?? "https://api.linkedin.com",
    apiVersion: env.LINKEDIN_API_VERSION ?? "202606",
    clientId: env.LINKEDIN_CLIENT_ID,
    clientSecret: env.LINKEDIN_CLIENT_SECRET,
    oauthBaseUrl: env.LINKEDIN_OAUTH_BASE_URL ?? "https://www.linkedin.com/oauth/v2",
    redirectUri: getLinkedInRedirectUri(),
    scopes: splitScopes(env.LINKEDIN_SCOPES)
  };
}

export function buildLinkedInAuthorizationUrl({
  redirectUri,
  state
}: {
  redirectUri?: string;
  state: string;
}) {
  const config = getLinkedInConfig();
  const authorizationUrl = new URL(`${config.oauthBaseUrl}/authorization`);

  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("client_id", config.clientId);
  authorizationUrl.searchParams.set("redirect_uri", redirectUri ?? config.redirectUri);
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("scope", config.scopes.join(" "));

  return authorizationUrl;
}

function hasPublishScope(scopes: string[]) {
  return publishScopes.some((scope) => scopes.includes(scope));
}

function hasRequiredConnectionScopes(scopes: string[]) {
  return profileScopes.every((scope) => scopes.includes(scope)) && hasPublishScope(scopes);
}

function capabilitiesForScopes(scopes: string[], reason = "Reconnect LinkedIn with the required publishing scopes.") {
  if (hasPublishScope(scopes)) {
    return linkedinCapabilities;
  }

  return {
    ...linkedinCapabilities,
    text_post: { ...linkedinCapabilities.text_post, supported: false, reason },
    image_post: { ...linkedinCapabilities.image_post, supported: false, reason },
    scheduled_publish: { ...linkedinCapabilities.scheduled_publish, supported: false, reason },
    immediate_publish: { ...linkedinCapabilities.immediate_publish, supported: false, reason }
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
    const description = record.error_description ?? record.message ?? record.error;

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

async function fetchWithTimeout(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1] = {},
  timeoutMs = linkedInFetchTimeoutMs
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
          ? "LinkedIn provider request timed out."
          : "LinkedIn provider request failed.",
      provider: "linkedin",
      retryable: true,
      cause: error
    });
  } finally {
    clearTimeout(timeout);
  }
}

function isPrivateIpAddress(address: string) {
  const normalized = address.toLowerCase();
  const mappedIpv4 = normalized.startsWith("::ffff:") ? normalized.slice("::ffff:".length) : normalized;
  const version = isIP(mappedIpv4);

  if (version === 4) {
    const [first = 0, second = 0] = mappedIpv4.split(".").map((part) => Number(part));

    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && (second === 0 || second === 168)) ||
      (first === 198 && (second === 18 || second === 19)) ||
      first >= 224
    );
  }

  if (version === 6) {
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      /^fe[89ab]/.test(normalized)
    );
  }

  return false;
}

function isImageKitHostname(hostname: string) {
  return hostname === defaultImageKitHostname || hostname.endsWith(".imagekit.io");
}

function isTrustedLinkedInImageSource(parsed: URL) {
  const hostname = parsed.hostname.toLowerCase();

  if (isImageKitHostname(hostname)) {
    return true;
  }

  if (!env.IMAGEKIT_URL_ENDPOINT) {
    return false;
  }

  try {
    return parsed.origin === new URL(env.IMAGEKIT_URL_ENDPOINT).origin;
  } catch {
    return false;
  }
}

async function validatePublicImageSourceUrl(sourceUrl: string) {
  let parsed: URL;

  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw new ProviderError({
      code: "content_invalid",
      message: "LinkedIn image source URL is invalid.",
      provider: "linkedin",
      retryable: false
    });
  }

  if (parsed.protocol !== "https:") {
    throw new ProviderError({
      code: "content_invalid",
      message: "LinkedIn image source URL must use HTTPS.",
      provider: "linkedin",
      retryable: false
    });
  }

  if (parsed.username || parsed.password) {
    throw new ProviderError({
      code: "content_invalid",
      message: "LinkedIn image source URL must not include credentials.",
      provider: "linkedin",
      retryable: false
    });
  }

  const hostname = parsed.hostname.toLowerCase();

  if (!isTrustedLinkedInImageSource(parsed)) {
    throw new ProviderError({
      code: "content_invalid",
      message: "LinkedIn image publishing only fetches trusted media asset URLs or existing LinkedIn image URNs.",
      provider: "linkedin",
      retryable: false
    });
  }

  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new ProviderError({
      code: "content_invalid",
      message: "LinkedIn image source URL must not target localhost.",
      provider: "linkedin",
      retryable: false
    });
  }

  let addresses: string[];

  try {
    addresses = isIP(hostname)
      ? [hostname]
      : (await lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);
  } catch (error) {
    throw new ProviderError({
      code: "content_invalid",
      message: "LinkedIn image source URL could not be resolved.",
      provider: "linkedin",
      retryable: false,
      cause: error
    });
  }

  if (addresses.length === 0 || addresses.some(isPrivateIpAddress)) {
    throw new ProviderError({
      code: "content_invalid",
      message: "LinkedIn image source URL must resolve to a public address.",
      provider: "linkedin",
      retryable: false
    });
  }

  return parsed.toString();
}

function getValidatedImageContentType(response: Response) {
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();

  if (!contentType || !allowedLinkedInImageTypes.has(contentType)) {
    throw new ProviderError({
      code: "content_invalid",
      message: "LinkedIn image source must return a supported image content type.",
      provider: "linkedin",
      retryable: false
    });
  }

  return contentType;
}

async function readImageBodyWithLimit(response: Response) {
  const declaredSize = Number(response.headers.get("content-length"));

  if (Number.isFinite(declaredSize) && declaredSize > maxLinkedInImageBytes) {
    throw new ProviderError({
      code: "content_invalid",
      message: "LinkedIn image source exceeds the maximum supported size.",
      provider: "linkedin",
      retryable: false
    });
  }

  const reader = response.body?.getReader();

  if (!reader) {
    const buffer = await response.arrayBuffer();

    if (buffer.byteLength > maxLinkedInImageBytes) {
      throw new ProviderError({
        code: "content_invalid",
        message: "LinkedIn image source exceeds the maximum supported size.",
        provider: "linkedin",
        retryable: false
      });
    }

    return buffer;
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  for (;;) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    if (!value) {
      continue;
    }

    totalBytes += value.byteLength;

    if (totalBytes > maxLinkedInImageBytes) {
      throw new ProviderError({
        code: "content_invalid",
        message: "LinkedIn image source exceeds the maximum supported size.",
        provider: "linkedin",
        retryable: false
      });
    }

    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes.buffer;
}

function createLinkedInApiError({
  payload,
  response
}: {
  payload: unknown;
  response: Response;
}) {
  const message = getErrorMessage(payload, `LinkedIn API request failed with HTTP ${response.status}.`);

  if (response.status === 401 || response.status === 403) {
    return new ProviderError({
      code: "token_scope",
      message,
      provider: "linkedin",
      retryable: false,
      cause: payload
    });
  }

  if (response.status === 408 || response.status === 409 || response.status === 425 || response.status === 429 || response.status >= 500) {
    return new ProviderError({
      code: "provider_transient",
      message,
      provider: "linkedin",
      retryable: true,
      cause: payload
    });
  }

  if (response.status === 400 || response.status === 422) {
    return new ProviderError({
      code: "content_invalid",
      message,
      provider: "linkedin",
      retryable: false,
      cause: payload
    });
  }

  return new ProviderError({
    code: "provider_permanent",
    message,
    provider: "linkedin",
    retryable: false,
    cause: payload
  });
}

function toTokenSet(payload: LinkedInTokenResponse, fallbackScopes: string[]): ProviderTokenSet {
  if (!payload.access_token) {
    throw new ProviderError({
      code: "provider_token_exchange_failed",
      message: "LinkedIn did not return an access token.",
      provider: "linkedin",
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
    scopes,
    raw: {
      refreshTokenExpiresAt: payload.refresh_token_expires_in
        ? new Date(Date.now() + payload.refresh_token_expires_in * 1000).toISOString()
        : undefined
    }
  };
}

async function exchangeAuthorizationCode({
  code,
  redirectUri
}: {
  code: string;
  redirectUri: string;
}) {
  const config = getLinkedInConfig();
  const response = await fetchWithTimeout(`${config.oauthBaseUrl}/accessToken`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri
    })
  });
  const payload = (await parseJsonResponse(response)) as LinkedInTokenResponse;

  if (!response.ok) {
    throw createLinkedInApiError({ payload, response });
  }

  return toTokenSet(payload, config.scopes);
}

async function refreshLinkedInToken(tokens: ProviderTokenSet) {
  if (!tokens.refreshToken) {
    throw new ProviderError({
      code: "provider_reauthorization_required",
      message: "LinkedIn did not provide a programmatic refresh token. Reconnect the provider before publishing.",
      provider: "linkedin",
      retryable: false
    });
  }

  const config = getLinkedInConfig();
  const response = await fetchWithTimeout(`${config.oauthBaseUrl}/accessToken`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret
    })
  });
  const payload = (await parseJsonResponse(response)) as LinkedInTokenResponse;

  if (!response.ok) {
    throw createLinkedInApiError({ payload, response });
  }

  const refreshed = toTokenSet(payload, tokens.scopes ?? [...defaultLinkedInScopes]);

  return {
    ...refreshed,
    refreshToken: refreshed.refreshToken ?? tokens.refreshToken,
    raw: {
      ...tokens.raw,
      ...refreshed.raw
    }
  };
}

async function fetchLinkedInProfile(accessToken: string) {
  const config = getLinkedInConfig();
  const response = await fetchWithTimeout(`${config.apiBaseUrl}/v2/userinfo`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  const payload = (await parseJsonResponse(response)) as LinkedInProfileResponse;

  if (!response.ok) {
    throw createLinkedInApiError({ payload, response });
  }

  if (!payload.sub) {
    throw new ProviderError({
      code: "provider_profile_missing",
      message: "LinkedIn userinfo did not include a subject identifier.",
      provider: "linkedin",
      retryable: false,
      cause: payload
    });
  }

  return payload;
}

function getDisplayName(profile: LinkedInProfileResponse) {
  const composedName = [profile.given_name, profile.family_name].filter(Boolean).join(" ");

  return profile.name ?? (composedName || "LinkedIn member");
}

function getAuthorUrn(tokens: ProviderTokenSet, providerAccountId?: string) {
  const rawProfile = tokens.raw?.profile;

  if (rawProfile && typeof rawProfile === "object") {
    const authorUrn = (rawProfile as Record<string, unknown>).authorUrn;

    if (typeof authorUrn === "string" && authorUrn.startsWith("urn:li:")) {
      return authorUrn;
    }
  }

  if (providerAccountId) {
    return providerAccountId.startsWith("urn:li:")
      ? providerAccountId
      : `urn:li:person:${providerAccountId}`;
  }

  throw new ProviderError({
    code: "provider_account_missing",
    message: "LinkedIn author URN is missing. Reconnect the provider account.",
    provider: "linkedin",
    retryable: false
  });
}

function formatCommentary(content: ProviderPublishContent) {
  return [content.hook, content.body, content.cta, content.hashtags.join(" ")]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n\n");
}

function getStringField(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

function getExistingImageUrn(media: Record<string, unknown>) {
  const value = getStringField(media, [
    "linkedinImageUrn",
    "linkedinMediaUrn",
    "linkedinAssetUrn",
    "imageUrn",
    "assetUrn",
    "urn"
  ]);

  return value?.startsWith("urn:li:image:") ? value : undefined;
}

async function uploadImageForLinkedIn({
  accessToken,
  authorUrn,
  media
}: {
  accessToken: string;
  authorUrn: string;
  media: Record<string, unknown>;
}) {
  const existingUrn = getExistingImageUrn(media);

  if (existingUrn) {
    return existingUrn;
  }

  const sourceUrl = getStringField(media, ["sourceUrl", "url", "secureUrl"]);

  if (!sourceUrl) {
    throw new ProviderError({
      code: "content_invalid",
      message: "LinkedIn image publishing requires an image source URL or an existing LinkedIn image URN.",
      provider: "linkedin",
      retryable: false
    });
  }

  const safeSourceUrl = await validatePublicImageSourceUrl(sourceUrl);
  const config = getLinkedInConfig();
  const initializeResponse = await fetchWithTimeout(`${config.apiBaseUrl}/rest/images?action=initializeUpload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Linkedin-Version": config.apiVersion,
      "X-Restli-Protocol-Version": "2.0.0"
    },
    body: JSON.stringify({
      initializeUploadRequest: {
        owner: authorUrn
      }
    })
  });
  const initializePayload = (await parseJsonResponse(initializeResponse)) as LinkedInImageUploadResponse;

  if (!initializeResponse.ok) {
    throw createLinkedInApiError({ payload: initializePayload, response: initializeResponse });
  }

  const uploadUrl = initializePayload.value?.uploadUrl;
  const imageUrn = initializePayload.value?.image;

  if (!uploadUrl || !imageUrn) {
    throw new ProviderError({
      code: "provider_upload_failed",
      message: "LinkedIn did not return an image upload URL.",
      provider: "linkedin",
      retryable: true,
      cause: initializePayload
    });
  }

  const imageResponse = await fetchWithTimeout(safeSourceUrl, {
    redirect: "error"
  });

  if (!imageResponse.ok) {
    throw new ProviderError({
      code: "content_invalid",
      message: `LinkedIn image source returned HTTP ${imageResponse.status}.`,
      provider: "linkedin",
      retryable: false
    });
  }

  const contentType = getValidatedImageContentType(imageResponse);
  const imageBody = await readImageBodyWithLimit(imageResponse);
  const uploadResponse = await fetchWithTimeout(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType
    },
    body: imageBody
  });

  if (!uploadResponse.ok) {
    const payload = await parseJsonResponse(uploadResponse);
    throw createLinkedInApiError({ payload, response: uploadResponse });
  }

  return imageUrn;
}

async function buildLinkedInMediaContent({
  accessToken,
  authorUrn,
  content
}: {
  accessToken: string;
  authorUrn: string;
  content: ProviderPublishContent;
}) {
  if (content.media.length === 0) {
    return undefined;
  }

  if (content.media.length > 1) {
    throw new ProviderCapabilityError(
      "linkedin",
      "carousel",
      "LinkedIn multi-image carousel publishing is not enabled in this adapter."
    );
  }

  const media = content.media[0];
  const imageUrn = await uploadImageForLinkedIn({
    accessToken,
    authorUrn,
    media
  });

  return {
    media: {
      id: imageUrn,
      altText: getStringField(media, ["altText", "description", "name"]) ?? content.title
    }
  };
}

function getLinkedInPostUrl(providerPostId: string) {
  if (providerPostId.startsWith("urn:li:ugcPost:") || providerPostId.startsWith("urn:li:share:")) {
    return `https://www.linkedin.com/feed/update/${providerPostId}/`;
  }

  return undefined;
}

async function getFreshTokens(context: {
  providerAccountId?: string;
  tokenRef?: string | null;
  workspaceId: string;
}) {
  if (!context.tokenRef) {
    throw new ProviderError({
      code: "provider_token_missing",
      message: "LinkedIn token reference is missing. Reconnect the provider account.",
      provider: "linkedin",
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
      message: "LinkedIn access token is missing from the token vault.",
      provider: "linkedin",
      retryable: false
    });
  }

  if (tokens.expiresAt && tokens.expiresAt.getTime() - Date.now() <= refreshSkewMs) {
    const refreshed = await refreshLinkedInToken(tokens);
    await updateProviderTokens({
      tokenRef: context.tokenRef,
      workspaceId: context.workspaceId,
      provider: "linkedin",
      providerAccountId: context.providerAccountId ?? getAuthorUrn(tokens),
      tokens: refreshed
    });

    return refreshed;
  }

  return tokens;
}

export const linkedinProvider: ProviderAdapter = {
  key: "linkedin",
  displayName: "LinkedIn",
  group: "social",
  implementationStatus: "live",
  website: "https://learn.microsoft.com/linkedin",
  capabilities: linkedinCapabilities,
  async connect(input: ProviderConnectionInput): Promise<ProviderConnectionResult> {
    const authorizationCode = input.authorizationCode?.trim();

    if (!authorizationCode && !input.tokens?.accessToken) {
      throw new ProviderConfigurationError(
        "linkedin",
        "LinkedIn authorization code or token payload is required to connect an account."
      );
    }

    const tokens = input.tokens?.accessToken
      ? input.tokens
      : await exchangeAuthorizationCode({
          code: authorizationCode as string,
          redirectUri: input.redirectUri ?? getLinkedInRedirectUri()
        });

    if (!tokens.accessToken) {
      throw new ProviderError({
        code: "provider_token_missing",
        message: "LinkedIn access token is missing.",
        provider: "linkedin",
        retryable: false
      });
    }

    const profile = input.metadata?.profile && typeof input.metadata.profile === "object"
      ? (input.metadata.profile as LinkedInProfileResponse)
      : await fetchLinkedInProfile(tokens.accessToken);
    const providerAccountId = input.providerAccountId ?? profile.sub;

    if (!providerAccountId) {
      throw new ProviderError({
        code: "provider_profile_missing",
        message: "LinkedIn account id is missing.",
        provider: "linkedin",
        retryable: false
      });
    }

    const scopes = input.scopes ?? tokens.scopes ?? splitScopes(undefined);
    const capabilities = capabilitiesForScopes(scopes);
    const authorUrn = providerAccountId.startsWith("urn:li:")
      ? providerAccountId
      : `urn:li:person:${providerAccountId}`;
    const tokenResult = await storeProviderTokens({
      workspaceId: input.workspaceId,
      provider: "linkedin",
      providerAccountId,
      tokens: {
        ...tokens,
        scopes,
        raw: {
          ...tokens.raw,
          profile: {
            authorUrn,
            email: profile.email,
            locale: profile.locale,
            name: getDisplayName(profile),
            picture: profile.picture,
            sub: providerAccountId
          }
        }
      }
    });

    return {
      provider: "linkedin",
      providerAccountId,
      displayName: input.displayName ?? getDisplayName(profile),
      status: hasRequiredConnectionScopes(scopes) ? "connected" : "requires_configuration",
      tokenRef: tokenResult.tokenRef,
      scopes,
      capabilities,
      metadata: {
        accountType: "member",
        authorUrn,
        locale: profile.locale,
        picture: profile.picture,
        tokenExpiresAt: tokenResult.expiresAt?.toISOString(),
        missingScopes: hasRequiredConnectionScopes(scopes)
          ? []
          : [
              ...profileScopes.filter((scope) => !scopes.includes(scope)),
              ...(hasPublishScope(scopes) ? [] : ["w_member_social"])
            ]
      }
    };
  },
  async refreshToken(context) {
    if (!context.tokenRef) {
      throw new ProviderError({
        code: "provider_token_missing",
        message: "LinkedIn token reference is missing. Reconnect the provider account.",
        provider: "linkedin",
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
        message: "LinkedIn token vault entry was not found.",
        provider: "linkedin",
        retryable: false
      });
    }

    const refreshed = await refreshLinkedInToken(tokens);
    const tokenResult = await updateProviderTokens({
      tokenRef: context.tokenRef,
      workspaceId: context.workspaceId,
      provider: "linkedin",
      providerAccountId: context.providerAccountId ?? getAuthorUrn(tokens),
      tokens: refreshed
    });
    const scopes = refreshed.scopes ?? tokens.scopes ?? [];
    const capabilities = capabilitiesForScopes(scopes);

    return {
      provider: "linkedin",
      providerAccountId: context.providerAccountId ?? getAuthorUrn(refreshed),
      displayName: "LinkedIn account",
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
      return linkedinCapabilities;
    }

    const tokens = await getProviderTokens({
      tokenRef: context.tokenRef,
      workspaceId: context.workspaceId
    });

    if (!tokens) {
      return capabilitiesForScopes([], "LinkedIn token vault entry was not found.");
    }

    return capabilitiesForScopes(tokens.scopes ?? []);
  },
  async publish(input: ProviderPublishInput): Promise<ProviderPublishResult> {
    const tokens = await getFreshTokens(input);
    const accessToken = tokens.accessToken as string;
    const authorUrn = getAuthorUrn(tokens, input.providerAccountId);
    const commentary = formatCommentary(input.content);

    if (!commentary) {
      throw new ProviderError({
        code: "content_invalid",
        message: "LinkedIn post content cannot be empty.",
        provider: "linkedin",
        retryable: false
      });
    }

    const config = getLinkedInConfig();
    const mediaContent = await buildLinkedInMediaContent({
      accessToken,
      authorUrn,
      content: input.content
    });
    const response = await fetchWithTimeout(`${config.apiBaseUrl}/rest/posts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Linkedin-Version": config.apiVersion,
        "X-Restli-Protocol-Version": "2.0.0"
      },
      body: JSON.stringify({
        author: authorUrn,
        commentary,
        visibility: "PUBLIC",
        distribution: {
          feedDistribution: "MAIN_FEED",
          targetEntities: [],
          thirdPartyDistributionChannels: []
        },
        ...(mediaContent ? { content: mediaContent } : {}),
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false
      })
    });
    const payload = await parseJsonResponse(response);

    if (!response.ok) {
      throw createLinkedInApiError({ payload, response });
    }

    const providerPostId =
      response.headers.get("x-restli-id") ??
      (payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).id === "string"
        ? ((payload as Record<string, unknown>).id as string)
        : undefined);

    if (!providerPostId) {
      throw new ProviderError({
        code: "provider_response_invalid",
        message: "LinkedIn did not return a post id.",
        provider: "linkedin",
        retryable: true,
        cause: payload
      });
    }

    return {
      provider: "linkedin",
      providerPostId,
      status: "published",
      publishedAt: new Date(),
      url: getLinkedInPostUrl(providerPostId),
      raw: {
        author: authorUrn,
        mediaCount: input.content.media.length,
        providerPostId,
        scheduledJobId: input.scheduledJobId ?? null
      }
    };
  },
  async replyToComment() {
    throw new ProviderCapabilityError(
      "linkedin",
      "comment_reply",
      linkedinCapabilities.comment_reply.reason
    );
  },
  async fetchMetrics() {
    throw new ProviderCapabilityError(
      "linkedin",
      "metrics_sync",
      linkedinCapabilities.metrics_sync.reason
    );
  },
  normalizeError(error) {
    return normalizeProviderError("linkedin", error);
  }
};

export function getLinkedInSupportedCapabilitiesForScopes(scopes: string[]) {
  return getSupportedCapabilityKeys(capabilitiesForScopes(scopes));
}
