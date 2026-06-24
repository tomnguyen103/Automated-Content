import { ApprovalCommandCenter } from "@/components/approvals/approval-command-center";
import { PageShell } from "@/components/layout/page-shell";
import { SubNav } from "@/components/layout/sub-nav";
import { Badge } from "@/components/ui/badge";
import {
  getApprovalCommandCenter,
  type ApprovalCommandCenterFilters
} from "@/lib/approvals/command-center";
import { resolveAgentOrchestrationContext } from "@/lib/agents/orchestration/server";
import { ensureLocalPreviewBrandMemoryProposals } from "@/lib/brand-memory/proposals";
import { providerKeys } from "@/lib/providers/types";

export const dynamic = "force-dynamic";

type ApprovalsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const approvalTypes = [
  "content_review",
  "reply_approval",
  "brand_memory",
  "policy_escalation",
  "provider_block",
  "budget_block"
] as const;
const approvalSeverities = ["info", "warning", "blocked"] as const;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseLiteral<T extends string>(value: string | undefined, allowed: readonly T[]) {
  return value && allowed.includes(value as T) ? (value as T) : undefined;
}

function parseOptionalText(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}

function parsePositiveNumber(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseFilters(params: Record<string, string | string[] | undefined>): ApprovalCommandCenterFilters {
  return {
    type: parseLiteral(firstParam(params.type), approvalTypes),
    severity: parseLiteral(firstParam(params.severity), approvalSeverities),
    provider: parseLiteral(firstParam(params.provider), providerKeys),
    platform: parseOptionalText(firstParam(params.platform)),
    missionId: parseOptionalText(firstParam(params.missionId)),
    maxAgeHours: parsePositiveNumber(firstParam(params.maxAgeHours))
  };
}

export default async function ApprovalsPage({ searchParams }: ApprovalsPageProps) {
  const context = await resolveAgentOrchestrationContext();

  if (!context) {
    return (
      <PageShell
        title="Approvals"
        description="Review pending content, reply, memory, provider, budget, and policy decisions."
      >
        <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-5 text-sm text-[var(--color-text-muted)]">
          Authentication is required.
        </div>
      </PageShell>
    );
  }

  const params = (await searchParams) ?? {};
  const filters = parseFilters(params);

  if (context.workspace.isLocalPreview) {
    await ensureLocalPreviewBrandMemoryProposals({
      workspaceId: context.workspace.id,
      userId: context.user.id
    });
  }

  const result = await getApprovalCommandCenter({
    agentRepositories: context.repositories,
    filters,
    isLocalPreview: context.workspace.isLocalPreview,
    workspaceId: context.workspace.id
  });

  return (
    <>
      <SubNav
        items={[
          { label: "Overview", href: "#overview", active: true },
          { label: "Filters", href: "#filters" },
          { label: "Queue", href: "#queue" },
          { label: "Agents", href: "/agents" },
          { label: "Replies", href: "/auto-replies#approvals" },
          { label: "Brand Memory", href: "/brand-memory#proposals" }
        ]}
      />
      <PageShell
        title="Approvals"
        description="Review pending content, reply, memory, provider, budget, and policy decisions."
        actions={<Badge tone={context.workspace.isLocalPreview ? "community" : "primary"}>{context.workspace.isLocalPreview ? "Preview workspace" : "Workspace scoped"}</Badge>}
      >
        <ApprovalCommandCenter filters={filters} result={result} />
      </PageShell>
    </>
  );
}
