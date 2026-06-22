import "server-only";

import { runAgentMission, type RunAgentMissionOptions } from "@/lib/agents/orchestration/runner";
import { createAutonomousMissionTaskExecutor } from "@/lib/agents/orchestration/executors";

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

export type RunMissionWorkflowOptions = RunAgentMissionOptions & {
  allowMemoryFallback?: boolean;
};

export async function runMissionWorkflow(options: RunMissionWorkflowOptions) {
  const { allowMemoryFallback = false, executeTask, ...missionOptions } = options;

  return runAgentMission({
    ...missionOptions,
    executeTask: executeTask ?? createAutonomousMissionTaskExecutor({ allowMemoryFallback })
  });
}
