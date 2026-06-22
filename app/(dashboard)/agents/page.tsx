import { AgentsConsole } from "@/components/agents/agents-console";
import { PageShell } from "@/components/layout/page-shell";
import { SubNav } from "@/components/layout/sub-nav";
import { Badge } from "@/components/ui/badge";
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

  await context.repositories.profiles.seedRoleTemplates({
    workspaceId: context.workspace.id,
    createdByUserId: context.user.id
  });

  const [profiles, missions] = await Promise.all([
    context.repositories.profiles.list(context.workspace.id),
    context.repositories.missions.list(context.workspace.id)
  ]);
  const missionRecords = await Promise.all(
    missions.map(async (mission) => ({
      mission,
      tasks: await context.repositories.taskRuns.listForMission({
        workspaceId: context.workspace.id,
        missionId: mission.id
      }),
      policyEvents: await context.repositories.policyEvents.listForMission({
        workspaceId: context.workspace.id,
        missionId: mission.id
      })
    }))
  );

  return (
    <>
      <SubNav
        items={[
          { label: "Control", active: true },
          { label: "Missions" },
          { label: "Permissions" },
          { label: "Activity" }
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
