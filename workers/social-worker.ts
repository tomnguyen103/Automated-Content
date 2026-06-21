import { Worker } from "bullmq";
import { env } from "@/lib/env";
import {
  PUBLISH_QUEUE_NAME,
  createRedisConnectionOptions,
  type PublishPostJobData
} from "@/lib/scheduler/enqueue";
import {
  AGENT_MISSION_QUEUE_NAME,
  type RunAgentMissionJobData
} from "@/lib/agents/orchestration/queue";
import { publishScheduledPostJob } from "@/workers/jobs/publish-post";
import { runAgentMissionJob } from "@/workers/jobs/run-agent-mission";

export function createSocialPublishingWorker({
  redisUrl = env.REDIS_URL,
  concurrency = 5
}: {
  redisUrl?: string;
  concurrency?: number;
} = {}) {
  return new Worker<PublishPostJobData>(
    PUBLISH_QUEUE_NAME,
    async (job) => publishScheduledPostJob({ data: job.data }),
    {
      connection: createRedisConnectionOptions(redisUrl),
      concurrency
    }
  );
}

export function createAgentMissionWorker({
  redisUrl = env.REDIS_URL,
  concurrency = 2
}: {
  redisUrl?: string;
  concurrency?: number;
} = {}) {
  return new Worker<RunAgentMissionJobData>(
    AGENT_MISSION_QUEUE_NAME,
    async (job) => runAgentMissionJob({ data: job.data }),
    {
      connection: createRedisConnectionOptions(redisUrl),
      concurrency
    }
  );
}
