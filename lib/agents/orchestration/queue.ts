import "server-only";

import { Queue, type JobsOptions } from "bullmq";
import { env } from "@/lib/env";
import { createRedisConnectionOptions } from "@/lib/scheduler/enqueue";

export const AGENT_MISSION_QUEUE_NAME = "agent-missions";
export const RUN_AGENT_MISSION_JOB_NAME = "run-agent-mission";

export type RunAgentMissionJobData = {
  workspaceId: string;
  missionId: string;
};

export type EnqueueAgentMissionResult = {
  queueJobId: string;
  status: "queued";
};

export type AgentMissionQueueLike = {
  add: (
    name: typeof RUN_AGENT_MISSION_JOB_NAME,
    data: RunAgentMissionJobData,
    options: JobsOptions
  ) => Promise<{ id?: string | number }>;
};

let missionQueue: Queue<RunAgentMissionJobData> | undefined;

export function createAgentMissionQueue(redisUrl = env.REDIS_URL): Queue<RunAgentMissionJobData> {
  return new Queue<RunAgentMissionJobData>(AGENT_MISSION_QUEUE_NAME, {
    connection: createRedisConnectionOptions(redisUrl)
  });
}

export function getAgentMissionQueue() {
  missionQueue ??= createAgentMissionQueue();
  return missionQueue;
}

export async function enqueueAgentMission({
  missionId,
  queue = getAgentMissionQueue(),
  workspaceId
}: {
  workspaceId: string;
  missionId: string;
  queue?: AgentMissionQueueLike;
}): Promise<EnqueueAgentMissionResult> {
  const job = await queue.add(
    RUN_AGENT_MISSION_JOB_NAME,
    {
      missionId,
      workspaceId
    },
    {
      jobId: missionId,
      attempts: 2,
      backoff: {
        type: "exponential",
        delay: 30_000
      },
      removeOnComplete: {
        age: 7 * 24 * 60 * 60,
        count: 1000
      },
      removeOnFail: {
        age: 7 * 24 * 60 * 60,
        count: 1000
      }
    }
  );

  return {
    queueJobId: String(job.id ?? missionId),
    status: "queued"
  };
}
