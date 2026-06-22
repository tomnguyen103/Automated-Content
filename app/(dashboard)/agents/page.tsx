import { AgentsConsole } from "@/components/agents/agents-console";
import { PageShell } from "@/components/layout/page-shell";
import { SubNav } from "@/components/layout/sub-nav";
import { Badge } from "@/components/ui/badge";
import { listAgentMissionAuditRecords } from "@/lib/agents/orchestration/audit";
import { AGENT_MISSION_HISTORY_LIMIT } from "@/lib/agents/orchestration/repository";
import { resolveAgentOrchestrationContext } from "@/lib/agents/orchestration/server";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const context = await resolveAgentOrchestrationContext();

  if (!context) {
    return (
      <PageShell
        title="Agents"
        description="Configure autonomous content agents, missions, permissions, and activity."
      >
        <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-5 text-sm text-[var(--color-text-muted)]">
          Authentication is required.
        </div>
      </PageShell>
    );
  }

  let profiles = await context.repositories.profiles.list(context.workspace.id);

  if (profiles.length === 0) {
    await context.repositories.profiles.seedRoleTemplates({
      workspaceId: context.workspace.id,
      createdByUserId: context.user.id
    });
    profiles = await context.repositories.profiles.list(context.workspace.id);
  }

  const missionRecords = await listAgentMissionAuditRecords({
    workspaceId: context.workspace.id,
    repositories: context.repositories,
    limit: AGENT_MISSION_HISTORY_LIMIT
  });

  return (
    <>
      <SubNav
        items={[
          { label: "Control", href: "#control", active: true },
          { label: "Missions", href: "#missions" },
          { label: "Simulations", href: "#simulations" },
          { label: "Permissions", href: "#permissions" },
          { label: "Governance", href: "#governance" },
          { label: "Activity", href: "#activity" }
        ]}
      />
      <PageShell
        title="Agents"
        description="Configure autonomous content agents, missions, permissions, and activity."
        actions={context.workspace.isLocalPreview ? <Badge tone="community">Preview workspace</Badge> : null}
      >
        <AgentsConsole
          initialState={{
            profiles,
            missions: missionRecords
          }}
        />
      </PageShell>
    </>
  );
}
