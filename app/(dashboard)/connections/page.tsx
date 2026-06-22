import { CheckCircle2, CircleAlert, RadioTower, ShieldCheck } from "lucide-react";
import { ProviderActions } from "@/components/connections/provider-actions";
import { PageShell } from "@/components/layout/page-shell";
import { SubNav } from "@/components/layout/sub-nav";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getProviderConnectionStates,
  type ProviderConnectionState
} from "@/lib/providers/connections";
import { resolvePersonalWorkspaceForUser } from "@/lib/workspaces/personal-workspace";

const capabilityTone = {
  true: "success",
  false: "neutral"
} as const;

export const dynamic = "force-dynamic";

function readinessLabel(provider: ProviderConnectionState) {
  if (provider.health.status === "ready" && provider.implementationStatus === "mock") {
    return "Preview ready";
  }

  if (provider.health.status === "ready") {
    return "Ready";
  }

  if (provider.health.status === "configuration_required") {
    return "Configure";
  }

  return "Blocked";
}

function readinessTone(provider: ProviderConnectionState) {
  if (provider.health.status === "ready") {
    return provider.health.warnings.length > 0 ? "primary" : "success";
  }

  return provider.health.status === "configuration_required" ? "premium" : "neutral";
}

function capabilityLabel(
  provider: ProviderConnectionState,
  capability: ProviderConnectionState["capabilities"][number]
) {
  if (!capability.supported) {
    return "No";
  }

  if (provider.implementationStatus === "stub") {
    return "Planned";
  }

  return capability.accountSupported ? "Ready" : "Supported";
}

export default async function ConnectionsPage() {
  const user = await getCurrentUser();
  const workspace = user ? await resolvePersonalWorkspaceForUser(user) : null;
  const providers = await getProviderConnectionStates({
    workspaceId: workspace?.id,
    isLocalPreview: workspace?.isLocalPreview
  });
  const socialProviders = providers.filter((provider) => provider.group === "social");
  const messagingProviders = providers.filter((provider) => provider.group === "messaging");
  const readyProviders = providers.filter((provider) => provider.health.status === "ready").length;
  const blockedProviders = providers.filter((provider) => provider.health.status !== "ready").length;

  return (
    <>
      <SubNav
        items={[
          { label: "Social", href: "#social", active: true },
          { label: "Messaging", href: "#messaging" },
          { label: "Health", href: "#health" }
        ]}
      />
      <PageShell
        title="Connections"
        description="Review provider readiness, publishing support, reply coverage, and metric sync before a post enters the queue."
        actions={
          <a
            href="/api/connections/mock/connect"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white px-4 text-sm font-medium text-[var(--color-text)] transition hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface)] active:translate-y-px"
          >
            <RadioTower size={16} aria-hidden="true" />
            Connect mock
          </a>
        }
      >
        <div id="health" className="grid scroll-mt-16 gap-4 lg:grid-cols-3">
          <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-rose-50 text-[var(--color-primary)]">
                <ShieldCheck size={18} aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-sm font-semibold">Provider coverage</h2>
                <p className="text-sm text-[var(--color-text-muted)]">Publishing, replies, and metrics are visible per provider.</p>
              </div>
            </div>
          </section>
          <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-5">
            <p className="text-sm text-[var(--color-text-muted)]">Providers</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight">{providers.length}</p>
          </section>
          <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-5">
            <p className="text-sm text-[var(--color-text-muted)]">Readiness</p>
            <div className="mt-2 flex items-center gap-2">
              <CheckCircle2 size={18} className="text-[var(--color-success)]" aria-hidden="true" />
              <p className="text-base font-semibold">
                {readyProviders} ready, {blockedProviders} blocked
              </p>
            </div>
          </section>
        </div>

        <ProviderSection id="social" title="Social providers" providers={socialProviders} />
        <ProviderSection id="messaging" title="Messaging providers" providers={messagingProviders} />
      </PageShell>
    </>
  );
}

function ProviderSection({
  id,
  title,
  providers
}: {
  id: string;
  title: string;
  providers: ProviderConnectionState[];
}) {
  return (
    <section id={id} className="mt-6 scroll-mt-16">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        <Badge tone="neutral">{providers.length} adapters</Badge>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {providers.map((provider) => (
          <article
            key={provider.key}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white"
          >
            <div className="flex flex-col gap-4 border-b border-[var(--color-border)] p-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold">{provider.displayName}</h3>
                  <Badge tone={readinessTone(provider)}>
                    {readinessLabel(provider)}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  {provider.health.blockingReason ??
                    (provider.health.warnings[0] ??
                      `${provider.capabilities.filter((capability) => capability.supported).length} of ${provider.capabilities.length} capabilities supported.`)}
                </p>
                <p className="mt-2 font-mono text-xs text-[var(--color-text-muted)]">
                  Checked {new Date(provider.health.lastChecked).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                </p>
              </div>
              <ProviderActions
                accountId={provider.account?.id}
                connect={provider.actions.connect}
                disconnect={provider.actions.disconnect}
                providerKey={provider.key}
                refreshHealth={provider.actions.refreshHealth}
              />
            </div>
            <div className="grid gap-3 border-b border-[var(--color-border)] px-5 py-4 text-sm sm:grid-cols-3">
              <div>
                <p className="text-[var(--color-text-muted)]">Configuration</p>
                <p className="mt-1 font-medium">{provider.configured ? "Configured" : "Required"}</p>
              </div>
              <div>
                <p className="text-[var(--color-text-muted)]">Required scopes</p>
                <p className="mt-1 font-medium">
                  {provider.health.requiredScopes.length > 0 ? provider.health.requiredScopes.join(", ") : "None"}
                </p>
              </div>
              <div>
                <p className="text-[var(--color-text-muted)]">Account</p>
                <p className="mt-1 font-medium">{provider.account?.displayName ?? "Not selected"}</p>
              </div>
            </div>
            {provider.account ? (
              <div className="grid gap-3 border-b border-[var(--color-border)] px-5 py-4 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-[var(--color-text-muted)]">Provider ID</p>
                  <p className="mt-1 truncate font-mono text-xs">{provider.account.providerAccountId}</p>
                </div>
                <div>
                  <p className="text-[var(--color-text-muted)]">Status</p>
                  <p className="mt-1 font-medium">{provider.account.status}</p>
                </div>
                <div>
                  <p className="text-[var(--color-text-muted)]">Scopes</p>
                  <p className="mt-1 truncate">{provider.account.scopes.join(", ") || "None"}</p>
                </div>
                <div>
                  <p className="text-[var(--color-text-muted)]">Last validated</p>
                  <p className="mt-1">
                    {provider.account.lastValidatedAt
                      ? new Date(provider.account.lastValidatedAt).toLocaleString([], {
                          dateStyle: "medium",
                          timeStyle: "short"
                        })
                      : "Not checked"}
                  </p>
                </div>
              </div>
            ) : null}
            <div className="grid gap-2 p-4 sm:grid-cols-2">
              {provider.capabilities.map((capability) => (
                <div
                  key={capability.capability}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-[var(--radius-sm)] bg-[var(--color-surface)] px-3 py-2"
                  title={capability.reason}
                >
                  <span className="text-sm font-medium">{capability.label}</span>
                  <Badge tone={capabilityTone[String(capability.supported) as "true" | "false"]}>
                    {capabilityLabel(provider, capability)}
                  </Badge>
                </div>
              ))}
            </div>
            {provider.implementationStatus === "stub" ? (
              <div className="flex items-start gap-2 border-t border-[var(--color-border)] px-5 py-4 text-sm text-[var(--color-text-muted)]">
                <CircleAlert size={16} className="mt-0.5 shrink-0 text-[var(--color-warning)]" aria-hidden="true" />
                This adapter is scaffold-only. Add the provider implementation and credentials before live publishing can run.
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
