import { Worker } from "bullmq";
import { env } from "@/lib/env";
import {
  PUBLISH_QUEUE_NAME,
  createRedisConnectionOptions,
  type PublishPostJobData
} from "@/lib/scheduler/enqueue";
import { publishScheduledPostJob } from "@/workers/jobs/publish-post";

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
