import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  ensureLocalPreviewMockConnection,
  getProviderConnectionStates,
  persistProviderConnection
} from "@/lib/providers/connections";
import {
  buildLinkedInAuthorizationUrl,
  getLinkedInRedirectUri
} from "@/lib/providers/linkedin";
import {
  buildXAuthorizationUrl,
  createXCodeChallenge,
  createXCodeVerifier,
  getXRedirectUri
} from "@/lib/providers/x";
import {
  UsageLimitExceededError
} from "@/lib/billing/usage";
import { withProviderConnectionCapacity } from "@/lib/providers/connection-capacity";
import { getProviderAdapter, isProviderKey } from "@/lib/providers/registry";
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

function oauthCodeVerifierCookieName(provider: ProviderKey) {
  return `provider_oauth_code_verifier_${provider}`;
}

function createOauthState() {
  return crypto.randomBytes(24).toString("base64url");
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

export async function GET(request: NextRequest, context: ConnectionRouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return jsonError("authentication_required", "Authentication is required.", 401);
  }

  const { provider: rawProvider } = await context.params;

  if (!isProviderKey(rawProvider)) {
    return jsonError("provider_not_found", "Provider was not found.", 404);
  }

  const provider = rawProvider;
  const adapter = getProviderAdapter(provider);
  const workspace = await resolvePersonalWorkspaceForUser(user);

  try {
    if (provider === "mock") {
      if (workspace.isLocalPreview) {
        const row = await ensureLocalPreviewMockConnection(workspace.id);

        if (wantsJson(request)) {
          return NextResponse.json(
            {
              connection: {
                provider: row.provider,
                providerAccountId: row.providerAccountId,
                displayName: row.displayName,
                status: row.status,
                scopes: row.scopes,
                capabilities: row.capabilities,
                metadata: row.metadata ?? {}
              }
            },
            { status: 201 }
          );
        }

        return redirectToConnections(request, {
          connected: provider
        });
      }

      const result = await adapter.connect({
        workspaceId: workspace.id,
        providerAccountId: `mock_${workspace.id}`,
        displayName: "Local preview account"
      });
      await withProviderConnectionCapacity({
        provider,
        workspaceId: workspace.id,
        isLocalPreview: workspace.isLocalPreview
      }, async () => {
        await persistProviderConnection({
          workspaceId: workspace.id,
          result
        });
      });

      if (wantsJson(request)) {
        return NextResponse.json(
          {
            connection: safeConnectionResult(result)
          },
          { status: 201 }
        );
      }

      return redirectToConnections(request, {
        connected: provider
      });
    }

    if (adapter.implementationStatus === "stub") {
      return jsonError(
        "provider_scaffold_only",
        `${adapter.displayName} is scaffold-only. Configure a live adapter before connecting.`,
        409
      );
    }

    const existingStates = await withProviderConnectionCapacity({
      provider,
      workspaceId: workspace.id,
      isLocalPreview: workspace.isLocalPreview
    }, async (states) => states);
    const state = createOauthState();
    const codeVerifier = provider === "x" ? createXCodeVerifier() : null;
    const authorizationUrl =
      provider === "linkedin"
        ? buildLinkedInAuthorizationUrl({
            state,
            redirectUri: getLinkedInRedirectUri()
          })
        : provider === "x"
          ? buildXAuthorizationUrl({
              state,
              codeChallenge: createXCodeChallenge(codeVerifier as string),
              redirectUri: getXRedirectUri()
            })
          : null;

    if (!authorizationUrl) {
      return jsonError(
        "provider_connect_unsupported",
        `${adapter.displayName} does not support OAuth connections yet.`,
        409
      );
    }

    if (wantsJson(request)) {
      const states =
        existingStates ??
        (await getProviderConnectionStates({
          workspaceId: workspace.id,
          isLocalPreview: workspace.isLocalPreview
        }));

      const response = NextResponse.json({
        authorizationUrl: authorizationUrl.toString(),
        provider: states.find((stateItem) => stateItem.key === provider)
      });
      response.cookies.set(oauthStateCookieName(provider), state, {
        httpOnly: true,
        maxAge: 30 * 60,
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production"
      });
      if (codeVerifier) {
        response.cookies.set(oauthCodeVerifierCookieName(provider), codeVerifier, {
          httpOnly: true,
          maxAge: 30 * 60,
          path: "/",
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production"
        });
      }

      return response;
    }

    const response = NextResponse.redirect(authorizationUrl);
    response.cookies.set(oauthStateCookieName(provider), state, {
      httpOnly: true,
      maxAge: 30 * 60,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    });
    if (codeVerifier) {
      response.cookies.set(oauthCodeVerifierCookieName(provider), codeVerifier, {
        httpOnly: true,
        maxAge: 30 * 60,
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production"
      });
    }

    return response;
  } catch (error) {
    if (error instanceof UsageLimitExceededError) {
      if (wantsJson(request)) {
        return NextResponse.json(
          {
            error: error.message,
            code: "provider_connection_limit_reached",
            usage: error.metric
          },
          { status: 429 }
        );
      }

      return redirectToConnections(request, {
        error: "provider_connection_limit_reached",
        provider,
        upgrade: "1"
      });
    }

    const message = error instanceof Error ? error.message : "Unable to start provider connection.";

    if (wantsJson(request)) {
      return jsonError("provider_connect_failed", message, 503);
    }

    return redirectToConnections(request, {
      error: "provider_connect_failed",
      provider
    });
  }
}
