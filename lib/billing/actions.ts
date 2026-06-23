import "server-only";

import { appUrl, env } from "@/lib/env";

export type BillingActionKind = "checkout" | "portal";

export class BillingActionConfigurationError extends Error {
  readonly action: BillingActionKind;
  readonly code = "billing_action_not_configured";

  constructor(action: BillingActionKind) {
    super(
      action === "checkout"
        ? "Billing upgrade is not configured."
        : "Billing customer portal is not configured."
    );
    this.name = "BillingActionConfigurationError";
    this.action = action;
  }
}

function billingActionUrlFor(kind: BillingActionKind) {
  return kind === "checkout" ? env.BILLING_UPGRADE_URL : env.BILLING_CUSTOMER_PORTAL_URL;
}

export function isBillingActionConfigured(kind: BillingActionKind) {
  return Boolean(billingActionUrlFor(kind));
}

export function getBillingActionRoute(kind: BillingActionKind) {
  return kind === "checkout" ? "/api/billing/checkout" : "/api/billing/portal";
}

export function buildBillingActionUrl({
  kind,
  userId,
  workspaceId
}: {
  kind: BillingActionKind;
  userId: string;
  workspaceId: string;
}) {
  const rawUrl = billingActionUrlFor(kind);

  if (!rawUrl) {
    throw new BillingActionConfigurationError(kind);
  }

  const url = new URL(rawUrl);
  const returnUrl = new URL("/billing", appUrl).toString();

  if (!url.searchParams.has("workspace_id")) {
    url.searchParams.set("workspace_id", workspaceId);
  }

  if (!url.searchParams.has("user_id")) {
    url.searchParams.set("user_id", userId);
  }

  if (kind === "checkout" && !url.searchParams.has("client_reference_id")) {
    url.searchParams.set("client_reference_id", workspaceId);
  }

  if (!url.searchParams.has("return_url")) {
    url.searchParams.set("return_url", returnUrl);
  }

  return url;
}
