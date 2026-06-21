import "server-only";

import { runAgentMission, type RunAgentMissionOptions } from "@/lib/agents/orchestration/runner";

export const missionWorkflowNodes = [
  "trigger",
  "plan",
  "assign",
  "execute",
  "evaluate",
  "commit",
  "observe",
  "schedule_next"
] as const;

export type MissionWorkflowNode = (typeof missionWorkflowNodes)[number];

export async function runMissionWorkflow(options: RunAgentMissionOptions) {
  return runAgentMission(options);
}
