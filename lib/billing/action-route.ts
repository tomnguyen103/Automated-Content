import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import {
  BillingActionConfigurationError,
  buildBillingActionUrl,
  type BillingActionKind
} from "@/lib/billing/actions";
import { getCurrentUser } from "@/lib/auth/current-user";
import { resolvePersonalWorkspaceForUser } from "@/lib/workspaces/personal-workspace";

function wantsJson(request: NextRequest) {
  return request.headers.get("accept")?.includes("application/json") ?? false;
}

function billingFallbackUrl(request: NextRequest, kind: BillingActionKind) {
  const url = new URL("/billing", request.url);
  url.searchParams.set("billing", "not_configured");
  url.searchParams.set("action", kind);
  return url;
}

export async function handleBillingActionRequest(request: NextRequest, kind: BillingActionKind) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      {
        error: "Authentication is required.",
        code: "authentication_required"
      },
      { status: 401 }
    );
  }

  try {
    const workspace = await resolvePersonalWorkspaceForUser(user);

    if (workspace.isLocalPreview) {
      if (wantsJson(request)) {
        return NextResponse.json(
          {
            error: "Billing actions are disabled in local preview.",
            code: "billing_action_unavailable",
            action: kind
          },
          { status: 403 }
        );
      }

      const url = new URL("/billing", request.url);
      url.searchParams.set("billing", "disabled_local_preview");
      url.searchParams.set("action", kind);
      return NextResponse.redirect(url);
    }

    const url = buildBillingActionUrl({
      kind,
      userId: user.id,
      workspaceId: workspace.id
    });

    if (wantsJson(request)) {
      return NextResponse.json({
        action: kind,
        url: url.toString()
      });
    }

    return NextResponse.redirect(url);
  } catch (error) {
    if (error instanceof BillingActionConfigurationError) {
      if (wantsJson(request)) {
        return NextResponse.json(
          {
            error: error.message,
            code: error.code,
            action: error.action
          },
          { status: 503 }
        );
      }

      return NextResponse.redirect(billingFallbackUrl(request, kind));
    }

    console.error("Unexpected billing action error", error);
    return NextResponse.json(
      {
        error: "Unable to start billing action.",
        code: "billing_action_failed"
      },
      { status: 500 }
    );
  }
}
