import { AgentsConsole } from "@/components/agents/agents-console";
import { PageShell } from "@/components/layout/page-shell";
import { SubNav } from "@/components/layout/sub-nav";
import { Badge } from "@/components/ui/badge";
import {
  AGENT_MISSION_HISTORY_LIMIT,
  AGENT_POLICY_EVENT_HISTORY_LIMIT,
  AGENT_SIMULATION_HISTORY_LIMIT,
  AGENT_TASK_RUN_HISTORY_LIMIT
} from "@/lib/agents/orchestration/repository";
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

  let [profiles, missions] = await Promise.all([
    context.repositories.profiles.list(context.workspace.id),
    context.repositories.missions.list(context.workspace.id, {
      limit: AGENT_MISSION_HISTORY_LIMIT
    })
  ]);

  if (profiles.length === 0) {
    await context.repositories.profiles.seedRoleTemplates({
      workspaceId: context.workspace.id,
      createdByUserId: context.user.id
    });
    [profiles, missions] = await Promise.all([
      context.repositories.profiles.list(context.workspace.id),
      context.repositories.missions.list(context.workspace.id, {
        limit: AGENT_MISSION_HISTORY_LIMIT
      })
    ]);
  }

  const missionRecords = await Promise.all(
    missions.map(async (mission) => {
      const [tasks, policyEvents, simulations] = await Promise.all([
        context.repositories.taskRuns.listForMission({
          workspaceId: context.workspace.id,
          missionId: mission.id,
          limit: AGENT_TASK_RUN_HISTORY_LIMIT
        }),
        context.repositories.policyEvents.listForMission({
          workspaceId: context.workspace.id,
          missionId: mission.id,
          limit: AGENT_POLICY_EVENT_HISTORY_LIMIT
        }),
        context.repositories.simulationRuns.listForMission({
          workspaceId: context.workspace.id,
          missionId: mission.id,
          limit: AGENT_SIMULATION_HISTORY_LIMIT
        })
      ]);

      return {
        mission,
        tasks,
        policyEvents,
        simulations
      };
    })
  );

  return (
    <>
      <SubNav
        items={[
          { label: "Control", href: "#control", active: true },
          { label: "Missions", href: "#missions" },
          { label: "Simulations", href: "#simulations" },
          { label: "Permissions", href: "#permissions" },
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
