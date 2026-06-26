import "server-only";

import { Queue, type JobsOptions } from "bullmq";
import type { ScheduledJob } from "@/db/schema";
import { env } from "@/lib/env";
import {
  dispatchTriggerTask,
  isTriggerRuntimeConfigured,
  type TriggerDispatchClient,
  type TriggerRuntimeEnv
} from "@/lib/jobs/trigger";
import type { ProviderKey } from "@/lib/providers/types";

export const PUBLISH_QUEUE_NAME = "social-publishing";
export const PUBLISH_POST_JOB_NAME = "publish-post";

export type PublishPostJobData = {
  scheduledJobId: string;
  workspaceId: string;
  provider: ProviderKey;
};

export type EnqueueScheduledPostResult = {
  backend?: "bullmq" | "trigger.dev";
  queueJobId: string;
  delayMs: number;
};

export type BullMqQueueLike = {
  add: (
    name: typeof PUBLISH_POST_JOB_NAME,
    data: PublishPostJobData,
    options: JobsOptions
  ) => Promise<{ id?: string | number }>;
};

type RedisConnectionOptions = {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  tls?: Record<string, never>;
};

export class QueueConfigurationError extends Error {
  constructor(message = "REDIS_URL is required to enqueue publishing jobs.") {
    super(message);
    this.name = "QueueConfigurationError";
  }
}

export function createRedisConnectionOptions(redisUrl = env.REDIS_URL): RedisConnectionOptions {
  if (!redisUrl) {
    throw new QueueConfigurationError();
  }

  const parsed = new URL(redisUrl);
  const db = parsed.pathname.replace("/", "");

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: db ? Number(db) : undefined,
    tls: parsed.protocol === "rediss:" ? {} : undefined
  };
}

let publishQueue: Queue<PublishPostJobData> | undefined;

export function createPublishQueue(redisUrl = env.REDIS_URL): Queue<PublishPostJobData> {
  return new Queue<PublishPostJobData>(PUBLISH_QUEUE_NAME, {
    connection: createRedisConnectionOptions(redisUrl)
  });
}

export function getPublishQueue() {
  publishQueue ??= createPublishQueue();
  return publishQueue;
}

export async function enqueueScheduledPost({
  client,
  envMap = env,
  scheduledJob,
  now = new Date(),
  queue
}: {
  scheduledJob: ScheduledJob;
  now?: Date;
  queue?: BullMqQueueLike;
  client?: TriggerDispatchClient;
  envMap?: TriggerRuntimeEnv;
}): Promise<EnqueueScheduledPostResult> {
  const delayMs = Math.max(0, scheduledJob.scheduledFor.getTime() - now.getTime());

  if (isTriggerRuntimeConfigured(envMap)) {
    const handle = await dispatchTriggerTask({
      client,
      concurrencyKey: scheduledJob.workspaceId,
      delay: delayMs > 0 ? scheduledJob.scheduledFor : undefined,
      envMap,
      idempotencyKey: scheduledJob.id,
      maxAttempts: 3,
      metadata: {
        provider: scheduledJob.provider,
        scheduledFor: scheduledJob.scheduledFor.toISOString(),
        scheduledJobId: scheduledJob.id,
        workspaceId: scheduledJob.workspaceId
      },
      payload: {
        provider: scheduledJob.provider,
        scheduledJobId: scheduledJob.id,
        workspaceId: scheduledJob.workspaceId
      },
      queue: PUBLISH_QUEUE_NAME,
      tags: [`workspace:${scheduledJob.workspaceId}`, "job:social-publish"],
      taskId: "social.publish-scheduled-post"
    });

    return {
      backend: "trigger.dev",
      queueJobId: handle.runId,
      delayMs
    };
  }

  const publishQueue = queue ?? getPublishQueue();
  const job = await publishQueue.add(
    PUBLISH_POST_JOB_NAME,
    {
      scheduledJobId: scheduledJob.id,
      workspaceId: scheduledJob.workspaceId,
      provider: scheduledJob.provider
    },
    {
      jobId: scheduledJob.id,
      delay: delayMs,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 60_000
      },
      removeOnComplete: {
        age: 7 * 24 * 60 * 60,
        count: 1000
      },
      removeOnFail: false
    }
  );

  return {
    backend: "bullmq",
    queueJobId: String(job.id ?? scheduledJob.id),
    delayMs
  };
}
