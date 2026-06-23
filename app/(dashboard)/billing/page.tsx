import { PlanCard } from "@/components/billing/plan-card";
import { UsageMeter } from "@/components/billing/usage-meter";
import { PageShell } from "@/components/layout/page-shell";
import { SubNav } from "@/components/layout/sub-nav";
import { Badge } from "@/components/ui/badge";
import {
  normalizeBillingPlan,
  planEntitlements,
  type BillingPlan
} from "@/lib/billing/entitlements";
import {
  getBillingActionRoute,
  isBillingActionConfigured
} from "@/lib/billing/actions";
import { buildUsageMetrics, getWorkspaceBillingState } from "@/lib/billing/usage";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isDatabaseConfigured } from "@/lib/env";
import { resolvePersonalWorkspaceForUser } from "@/lib/workspaces/personal-workspace";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const user = await getCurrentUser();
  const workspace = user ? await resolvePersonalWorkspaceForUser(user) : null;
  const fallbackPlan: BillingPlan = normalizeBillingPlan(undefined);
  const billingState =
    workspace && !workspace.isLocalPreview && isDatabaseConfigured
      ? await getWorkspaceBillingState({ workspaceId: workspace.id })
      : {
          activePlan: fallbackPlan,
          usageMetrics: buildUsageMetrics(fallbackPlan, {})
        };
  const { activePlan, usageMetrics } = billingState;
  const canUseBillingActions = Boolean(workspace && !workspace.isLocalPreview);
  const checkoutHref =
    canUseBillingActions && isBillingActionConfigured("checkout")
      ? getBillingActionRoute("checkout")
      : undefined;
  const portalHref =
    canUseBillingActions && isBillingActionConfigured("portal")
      ? getBillingActionRoute("portal")
      : undefined;
  const disabledBillingReason = workspace?.isLocalPreview
    ? "Billing actions are disabled in local preview."
    : "Configure BILLING_UPGRADE_URL and BILLING_CUSTOMER_PORTAL_URL to enable this action.";
  const billingBadge = workspace?.isLocalPreview
    ? "Local preview"
    : checkoutHref || portalHref
      ? "Billing actions configured"
      : "Billing setup needed";

  function planAction(plan: BillingPlan) {
    if (plan === activePlan && plan === "premium") {
      return {
        label: "Manage billing",
        href: portalHref,
        disabledReason: disabledBillingReason
      };
    }

    if (plan === activePlan) {
      return {
        label: "Current plan",
        disabledReason: "This plan is active."
      };
    }

    if (plan === "premium") {
      return {
        label: "Upgrade",
        href: checkoutHref,
        disabledReason: disabledBillingReason
      };
    }

    return {
      label: "Included",
      disabledReason: "Premium includes the Free plan baseline."
    };
  }

  return (
    <>
      <SubNav
        items={[
          { label: "Plan", href: "#plan", active: true },
          { label: "Usage", href: "#usage" },
          {
            label: "Invoices",
            href: portalHref,
            disabled: !portalHref,
            title: disabledBillingReason
          },
          {
            label: "Upgrade",
            href: checkoutHref,
            disabled: !checkoutHref || activePlan === "premium",
            title: activePlan === "premium" ? "Premium is active." : disabledBillingReason
          }
        ]}
      />
      <PageShell
        title="Billing"
        description="Manage plan state, usage limits, invoices, and seven-post-per-day Premium automation capacity."
        actions={<Badge tone={workspace?.isLocalPreview ? "community" : checkoutHref || portalHref ? "success" : "primary"}>{billingBadge}</Badge>}
      >
        <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
          <div id="plan" className="grid scroll-mt-20 gap-5 md:grid-cols-2 xl:grid-cols-1">
            {(Object.keys(planEntitlements) as BillingPlan[]).map((plan) => (
              <PlanCard
                key={plan}
                plan={plan}
                entitlements={planEntitlements[plan]}
                active={plan === activePlan}
                action={planAction(plan)}
              />
            ))}
          </div>

          <section id="usage" className="scroll-mt-20 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white p-5">
            <div className="flex flex-col gap-3 border-b border-[var(--color-border)] pb-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Usage state</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-muted)]">
                  The same entitlement helpers power API checks, workers, and this dashboard view.
                </p>
              </div>
              <Badge tone="premium">
                Premium limit: {planEntitlements.premium.limits.scheduledPostsPerDay} posts/day
              </Badge>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {usageMetrics.map((metric) => (
                <UsageMeter key={metric.key} metric={metric} />
              ))}
            </div>
          </section>
        </div>
      </PageShell>
    </>
  );
}
