import { NextResponse, type NextRequest } from "next/server";
import {
  getProviderConnectionStates,
  refreshProviderConnectionHealth
} from "@/lib/providers/connections";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isProviderKey } from "@/lib/providers/registry";
import { resolvePersonalWorkspaceForUser } from "@/lib/workspaces/personal-workspace";

export const runtime = "nodejs";

type ConnectionRouteContext = {
  params: Promise<{
    provider: string;
  }>;
};

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json(
    {
      error: message,
      code
    },
    { status }
  );
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

  try {
    const workspace = await resolvePersonalWorkspaceForUser(user);
    const accountId = request.nextUrl.searchParams.get("accountId");
    const states = await getProviderConnectionStates({
      workspaceId: workspace.id,
      isLocalPreview: workspace.isLocalPreview
    });
    const state = states.find((item) => item.key === rawProvider);

    if (!state || (accountId && state.account?.id !== accountId)) {
      return jsonError("provider_not_found", "Provider was not found.", 404);
    }

    return NextResponse.json({
      health: state.health,
      account: state.account
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to read provider health.";

    return jsonError("provider_health_failed", message, 502);
  }
}

export async function POST(request: NextRequest, context: ConnectionRouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return jsonError("authentication_required", "Authentication is required.", 401);
  }

  const { provider: rawProvider } = await context.params;

  if (!isProviderKey(rawProvider)) {
    return jsonError("provider_not_found", "Provider was not found.", 404);
  }

  try {
    const workspace = await resolvePersonalWorkspaceForUser(user);
    const body = await request.json().catch(() => ({}));
    const accountId = typeof body.accountId === "string" && body.accountId.length > 0 ? body.accountId : null;
    const refreshed = await refreshProviderConnectionHealth({
      workspaceId: workspace.id,
      isLocalPreview: workspace.isLocalPreview,
      provider: rawProvider,
      accountId
    });

    if (refreshed) {
      return NextResponse.json({
        health: refreshed.health,
        account: {
          id: refreshed.account.id,
          provider: refreshed.account.provider,
          providerAccountId: refreshed.account.providerAccountId,
          displayName: refreshed.account.displayName,
          status: refreshed.account.status,
          scopes: refreshed.account.scopes,
          capabilities: refreshed.account.capabilities,
          lastValidatedAt: refreshed.account.lastValidatedAt?.toISOString() ?? null
        }
      });
    }

    const states = await getProviderConnectionStates({
      workspaceId: workspace.id,
      isLocalPreview: workspace.isLocalPreview
    });
    const state = states.find((item) => item.key === rawProvider);

    if (!state) {
      return jsonError("provider_not_found", "Provider was not found.", 404);
    }

    return NextResponse.json({
      health: state.health,
      account: state.account
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to refresh provider health.";

    return jsonError("provider_health_failed", message, 502);
  }
}
