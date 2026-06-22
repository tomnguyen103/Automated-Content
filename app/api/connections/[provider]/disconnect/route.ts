import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { disconnectProviderAccount } from "@/lib/providers/connections";
import { isProviderKey } from "@/lib/providers/registry";
import { resolvePersonalWorkspaceForUser } from "@/lib/workspaces/personal-workspace";

export const runtime = "nodejs";

const disconnectRequestSchema = z.object({
  accountId: z.string().min(1)
});

type ConnectionRouteContext = {
  params: Promise<{
    provider: string;
  }>;
};

function jsonError(code: string, message: string, status: number, issues?: unknown) {
  return NextResponse.json(
    {
      error: message,
      code,
      ...(issues ? { issues } : {})
    },
    { status }
  );
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

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError("invalid_json", "Invalid JSON payload.", 400);
  }

  try {
    const input = disconnectRequestSchema.parse(body);
    const workspace = await resolvePersonalWorkspaceForUser(user);
    const account = await disconnectProviderAccount({
      workspaceId: workspace.id,
      isLocalPreview: workspace.isLocalPreview,
      provider: rawProvider,
      accountId: input.accountId
    });

    if (!account) {
      return jsonError("connected_account_not_found", "Connected account was not found.", 404);
    }

    return NextResponse.json({
      account: {
        id: account.id,
        provider: account.provider,
        providerAccountId: account.providerAccountId,
        displayName: account.displayName,
        status: account.status,
        disconnectedAt: account.disconnectedAt?.toISOString() ?? null
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError("invalid_disconnect_request", "Invalid disconnect request.", 400, error.issues);
    }

    console.error("Unexpected provider disconnect error", error);
    return jsonError("provider_disconnect_failed", "Unable to disconnect provider account.", 500);
  }
}
