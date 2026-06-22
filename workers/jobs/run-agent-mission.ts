import "server-only";

import { runMissionWorkflow } from "@/lib/agents/graphs/mission-workflow";
import type { RunAgentMissionJobData } from "@/lib/agents/orchestration/queue";

export async function runAgentMissionJob({ data }: { data: RunAgentMissionJobData }) {
  return runMissionWorkflow({
    workspaceId: data.workspaceId,
    missionId: data.missionId
  });
}
