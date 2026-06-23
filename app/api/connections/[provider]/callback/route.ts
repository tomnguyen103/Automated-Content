import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  persistProviderConnection
} from "@/lib/providers/connections";
import {
  UsageLimitExceededError
} from "@/lib/billing/usage";
import { withProviderConnectionCapacity } from "@/lib/providers/connection-capacity";
import {
  getLinkedInRedirectUri,
  linkedinProvider
} from "@/lib/providers/linkedin";
import { isProviderKey } from "@/lib/providers/registry";
import type { ProviderKey, ProviderConnectionResult } from "@/lib/providers/types";
import { resolvePersonalWorkspaceForUser } from "@/lib/workspaces/personal-workspace";

export const runtime = "nodejs";

type ConnectionRouteContext = {
  params: Promise<{
    provider: string;
  }>;
};

function wantsJson(request: NextRequest) {
  return request.headers.get("accept")?.includes("application/json") ?? false;
}

function oauthStateCookieName(provider: ProviderKey) {
  return `provider_oauth_state_${provider}`;
}

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json(
    {
      error: message,
      code
    },
    { status }
  );
}

function safeConnectionResult(result: ProviderConnectionResult) {
  return {
    provider: result.provider,
    providerAccountId: result.providerAccountId,
    displayName: result.displayName,
    status: result.status,
    scopes: result.scopes,
    capabilities: Object.values(result.capabilities)
      .filter((capability) => capability.supported)
      .map((capability) => capability.capability),
    metadata: result.metadata ?? {}
  };
}

function redirectToConnections(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/connections", request.url);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return NextResponse.redirect(url);
}

function clearOauthStateCookie(response: NextResponse, provider: ProviderKey) {
  response.cookies.delete(oauthStateCookieName(provider));
  return response;
}

export async function GET(request: NextRequest, context: ConnectionRouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return jsonError("authentication_required", "Authentication is required.", 401);
  }

  const { provider: rawProvider } = await context.params;

  if (!isProviderKey(rawProvider)) {
    return jsonError("provider_not_found", "Provider was not found.", 404);
  }

  if (rawProvider !== "linkedin") {
    return jsonError("provider_callback_unsupported", "This provider does not support OAuth callbacks.", 409);
  }

  const code = request.nextUrl.searchParams.get("code");
  const returnedState = request.nextUrl.searchParams.get("state");
  const providerError = request.nextUrl.searchParams.get("error");
  const providerErrorDescription = request.nextUrl.searchParams.get("error_description");
  const expectedState = request.cookies.get(oauthStateCookieName(rawProvider))?.value;

  if (providerError) {
    const message = providerErrorDescription ?? providerError;

    const response = wantsJson(request)
      ? jsonError(providerError, message, 400)
      : redirectToConnections(request, {
          error: providerError,
          provider: rawProvider
        });

    return clearOauthStateCookie(response, rawProvider);
  }

  if (!code) {
    const response = wantsJson(request)
      ? jsonError("authorization_code_missing", "LinkedIn authorization code is missing.", 400)
      : redirectToConnections(request, {
          error: "authorization_code_missing",
          provider: rawProvider
        });

    return clearOauthStateCookie(response, rawProvider);
  }

  if (!returnedState || !expectedState || returnedState !== expectedState) {
    const response = wantsJson(request)
      ? jsonError("oauth_state_mismatch", "LinkedIn OAuth state did not match.", 401)
      : redirectToConnections(request, {
          error: "oauth_state_mismatch",
          provider: rawProvider
        });

    return clearOauthStateCookie(response, rawProvider);
  }

  try {
    const workspace = await resolvePersonalWorkspaceForUser(user);
    const result = await linkedinProvider.connect({
      workspaceId: workspace.id,
      authorizationCode: code,
      redirectUri: getLinkedInRedirectUri()
    });
    await withProviderConnectionCapacity({
      provider: rawProvider,
      workspaceId: workspace.id,
      isLocalPreview: workspace.isLocalPreview
    }, async () => {
      await persistProviderConnection({
        workspaceId: workspace.id,
        result
      });
    });

    if (wantsJson(request)) {
      const response = NextResponse.json(
        {
          connection: safeConnectionResult(result)
        },
        { status: 201 }
      );
      response.cookies.delete(oauthStateCookieName(rawProvider));
      return response;
    }

    const response = redirectToConnections(request, {
      connected: rawProvider
    });
    response.cookies.delete(oauthStateCookieName(rawProvider));
    return response;
  } catch (error) {
    if (error instanceof UsageLimitExceededError) {
      const response = wantsJson(request)
        ? NextResponse.json(
            {
              error: error.message,
              code: "provider_connection_limit_reached",
              usage: error.metric
            },
            { status: 429 }
          )
        : redirectToConnections(request, {
            error: "provider_connection_limit_reached",
            provider: rawProvider,
            upgrade: "1"
          });

      return clearOauthStateCookie(response, rawProvider);
    }

    const message = error instanceof Error ? error.message : "Unable to complete provider connection.";
    const response = wantsJson(request)
      ? jsonError("provider_callback_failed", message, 502)
      : redirectToConnections(request, {
          error: "provider_callback_failed",
          provider: rawProvider
        });

    return clearOauthStateCookie(response, rawProvider);
  }
}
