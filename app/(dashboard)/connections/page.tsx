import { CheckCircle2, CircleAlert, ExternalLink, RadioTower, ShieldCheck } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { SubNav } from "@/components/layout/sub-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getProviderCapabilityMatrix } from "@/lib/providers/registry";

const capabilityTone = {
  true: "success",
  false: "neutral"
} as const;

function readinessLabel(provider: ReturnType<typeof getProviderCapabilityMatrix>[number]) {
  if (provider.implementationStatus === "mock") {
    return "Preview ready";
  }

  if (provider.implementationStatus === "stub") {
    return "Scaffold only";
  }

  return "Live";
}

function capabilityLabel(
  provider: ReturnType<typeof getProviderCapabilityMatrix>[number],
  supported: boolean
) {
  if (!supported) {
    return "No";
  }

  return provider.implementationStatus === "stub" ? "Planned" : "Yes";
}

export default function ConnectionsPage() {
  const providers = getProviderCapabilityMatrix();
  const socialProviders = providers.filter((provider) => provider.group === "social");
  const messagingProviders = providers.filter((provider) => provider.group === "messaging");

  return (
    <>
      <SubNav
        items={[
          { label: "Social", active: true },
          { label: "Messaging" },
          { label: "Webhooks" },
          { label: "Health" }
        ]}
      />
      <PageShell
        title="Connections"
        description="Review provider readiness, publishing support, reply coverage, and metric sync before a post enters the queue."
        actions={
          <Button variant="outline" disabled title="Health checks are not available yet">
            <RadioTower size={16} aria-hidden="true" />
            Check health
          </Button>
        }
      >
        <div className="grid gap-4 lg:grid-cols-3">
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
            <p className="text-sm text-[var(--color-text-muted)]">Mock adapter</p>
            <div className="mt-2 flex items-center gap-2">
              <CheckCircle2 size={18} className="text-[var(--color-success)]" aria-hidden="true" />
              <p className="text-base font-semibold">Ready for local publishing tests</p>
            </div>
          </section>
        </div>

        <ProviderSection title="Social providers" providers={socialProviders} />
        <ProviderSection title="Messaging providers" providers={messagingProviders} />
      </PageShell>
    </>
  );
}

function ProviderSection({
  title,
  providers
}: {
  title: string;
  providers: ReturnType<typeof getProviderCapabilityMatrix>;
}) {
  return (
    <section className="mt-6">
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
                  <Badge tone={provider.implementationStatus === "mock" ? "success" : "neutral"}>
                    {readinessLabel(provider)}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  {provider.implementationStatus === "stub"
                    ? `${provider.supportedCount} planned capabilities. 0 live capabilities in this adapter.`
                    : `${provider.liveSupportedCount} of ${provider.totalCount} live capabilities supported.`}
                </p>
              </div>
              <Button variant="outline" size="sm" disabled title="Provider connection actions are not available yet">
                <ExternalLink size={15} aria-hidden="true" />
                {provider.key === "mock" ? "Use mock" : "Configure"}
              </Button>
            </div>
            <div className="grid gap-2 p-4 sm:grid-cols-2">
              {provider.capabilities.map((capability) => (
                <div
                  key={capability.capability}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-[var(--radius-sm)] bg-[var(--color-surface)] px-3 py-2"
                  title={capability.reason}
                >
                  <span className="text-sm font-medium">{capability.label}</span>
                  <Badge tone={capabilityTone[String(capability.supported) as "true" | "false"]}>
                    {capabilityLabel(provider, capability.supported)}
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
