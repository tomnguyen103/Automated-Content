import "server-only";

import { Queue, type JobsOptions } from "bullmq";
import { env } from "@/lib/env";
import {
  dispatchTriggerTask,
  isTriggerRuntimeConfigured,
  type TriggerDispatchClient,
  type TriggerRuntimeEnv
} from "@/lib/jobs/trigger";
import { createRedisConnectionOptions } from "@/lib/scheduler/enqueue";

export const AGENT_MISSION_QUEUE_NAME = "agent-missions";
export const RUN_AGENT_MISSION_JOB_NAME = "run-agent-mission";

export type RunAgentMissionJobData = {
  workspaceId: string;
  missionId: string;
};

export type EnqueueAgentMissionResult = {
  backend?: "bullmq" | "trigger.dev";
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
  client,
  envMap = env,
  missionId,
  queue,
  workspaceId
}: {
  workspaceId: string;
  missionId: string;
  queue?: AgentMissionQueueLike;
  client?: TriggerDispatchClient;
  envMap?: TriggerRuntimeEnv;
}): Promise<EnqueueAgentMissionResult> {
  if (isTriggerRuntimeConfigured(envMap)) {
    const handle = await dispatchTriggerTask({
      client,
      concurrencyKey: workspaceId,
      envMap,
      idempotencyKey: missionId,
      maxAttempts: 2,
      metadata: {
        missionId,
        workspaceId
      },
      payload: {
        missionId,
        workspaceId
      },
      queue: AGENT_MISSION_QUEUE_NAME,
      tags: [`workspace:${workspaceId}`, "job:agent-mission"],
      taskId: "agents.run-mission"
    });

    return {
      backend: "trigger.dev",
      queueJobId: handle.runId,
      status: "queued"
    };
  }

  const missionQueue = queue ?? getAgentMissionQueue();
  const job = await missionQueue.add(
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
    backend: "bullmq",
    queueJobId: String(job.id ?? missionId),
    status: "queued"
  };
}
