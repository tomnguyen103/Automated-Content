import { BrandMemoryWorkbench } from "@/components/brand-memory/brand-memory-workbench";
import { PageShell } from "@/components/layout/page-shell";
import { SubNav } from "@/components/layout/sub-nav";
import { Badge } from "@/components/ui/badge";
import {
  brandMemoryProposalScopeSchema,
  brandMemoryProposalStatusSchema,
  type BrandMemoryProposalScope,
  type BrandMemoryProposalStatus
} from "@/lib/brand-memory/schemas";
import {
  createBrandMemoryProposalRepository,
  ensureLocalPreviewBrandMemoryProposals
} from "@/lib/brand-memory/proposals";
import { buildBrandMemoryCurationSummary } from "@/lib/brand-memory/curator";
import { socialPlatformSchema } from "@/lib/agents/schemas/platform-variant";
import { getCurrentUser } from "@/lib/auth/current-user";
import { resolvePersonalWorkspaceForUser } from "@/lib/workspaces/personal-workspace";

export const dynamic = "force-dynamic";

type BrandMemoryPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseConfidence(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
    return undefined;
  }

  return parsed;
}

function parseStatus(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const result = brandMemoryProposalStatusSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

function parseScope(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const result = brandMemoryProposalScopeSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

function parsePlatform(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const result = socialPlatformSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

function parseFilters(params: Record<string, string | string[] | undefined>) {
  const filters = {
    status: parseStatus(firstParam(params.status)) as BrandMemoryProposalStatus | undefined,
    scope: parseScope(firstParam(params.scope)) as BrandMemoryProposalScope | undefined,
    platform: parsePlatform(firstParam(params.platform)),
    minConfidence: parseConfidence(firstParam(params.minConfidence)),
    maxConfidence: parseConfidence(firstParam(params.maxConfidence))
  };

  return {
    filters,
    error:
      filters.minConfidence !== undefined &&
      filters.maxConfidence !== undefined &&
      filters.minConfidence > filters.maxConfidence
        ? "Minimum confidence cannot exceed maximum confidence."
        : null
  };
}

export default async function BrandMemoryPage({ searchParams }: BrandMemoryPageProps) {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <PageShell
        title="Brand Memory"
        description="Review proposed voice rules before they become active brand guidance."
      >
        <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-5 text-sm text-[var(--color-text-muted)]">
          Authentication is required.
        </div>
      </PageShell>
    );
  }

  const workspace = await resolvePersonalWorkspaceForUser(user);
  const params = (await searchParams) ?? {};
  const { error: filterError, filters } = parseFilters(params);
  const repository = createBrandMemoryProposalRepository({
    allowMemoryFallback: workspace.isLocalPreview,
    preferMemoryFallback: workspace.isLocalPreview
  });

  if (workspace.isLocalPreview) {
    await ensureLocalPreviewBrandMemoryProposals({
      workspaceId: workspace.id,
      userId: user.id
    });
  }

  const [proposals, curationProposals] = filterError
    ? [[], []]
    : await Promise.all([
        repository.list({
          workspaceId: workspace.id,
          ...filters,
          limit: 50
        }),
        repository.list({
          workspaceId: workspace.id,
          limit: 100
        })
      ]);
  const curation = buildBrandMemoryCurationSummary(curationProposals);

  return (
    <>
      <SubNav
        items={[
          { label: "Proposals", href: "#proposals", active: true },
          { label: "Evidence", href: "#evidence" },
          { label: "Billing", href: "/billing" }
        ]}
      />
      <PageShell
        title="Brand Memory"
        description="Review proposed voice rules before they become active brand guidance."
        actions={<Badge tone={workspace.isLocalPreview ? "community" : "primary"}>{workspace.isLocalPreview ? "Preview workspace" : "Workspace scoped"}</Badge>}
      >
        <div id="proposals" className="scroll-mt-16">
          {filterError ? (
            <div className="rounded-[var(--radius-md)] border border-red-200 bg-red-50 p-5 text-sm text-red-700">
              {filterError}
            </div>
          ) : (
            <BrandMemoryWorkbench initialCuration={curation} initialFilters={filters} initialProposals={proposals} />
          )}
        </div>
      </PageShell>
    </>
  );
}
