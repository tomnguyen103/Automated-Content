import process from "node:process";
import { pathToFileURL } from "node:url";
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

type SocialWorker = Worker<PublishPostJobData> | Worker<RunAgentMissionJobData>;
type WorkerLogger = Pick<typeof console, "error" | "log">;

function readPositiveIntegerEnv(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

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

export function startSocialWorkerRuntime({
  agentMissionConcurrency = readPositiveIntegerEnv(process.env.AGENT_MISSION_WORKER_CONCURRENCY, 2),
  createMissionWorker = createAgentMissionWorker,
  createPublishingWorker = createSocialPublishingWorker,
  logger = console,
  publishingConcurrency = readPositiveIntegerEnv(process.env.PUBLISH_WORKER_CONCURRENCY, 5),
  redisUrl = env.REDIS_URL
}: {
  agentMissionConcurrency?: number;
  createMissionWorker?: typeof createAgentMissionWorker;
  createPublishingWorker?: typeof createSocialPublishingWorker;
  logger?: WorkerLogger;
  publishingConcurrency?: number;
  redisUrl?: string;
} = {}) {
  const workers: SocialWorker[] = [
    createPublishingWorker({
      concurrency: publishingConcurrency,
      redisUrl
    }),
    createMissionWorker({
      concurrency: agentMissionConcurrency,
      redisUrl
    })
  ];

  logger.log(
    `Social worker runtime started for queues: ${PUBLISH_QUEUE_NAME}, ${AGENT_MISSION_QUEUE_NAME}.`
  );

  return {
    workers,
    async close() {
      await Promise.all(workers.map((worker) => worker.close()));
    }
  };
}

export function registerWorkerShutdownHandlers({
  logger = console,
  runtime
}: {
  logger?: WorkerLogger;
  runtime: ReturnType<typeof startSocialWorkerRuntime>;
}) {
  let closing = false;

  const shutdown = async (signal: NodeJS.Signals) => {
    if (closing) {
      return;
    }

    closing = true;
    logger.log(`Received ${signal}. Closing social worker runtime.`);

    try {
      await runtime.close();
      process.exit(0);
    } catch (error) {
      logger.error("Social worker runtime failed to close cleanly.", error);
      process.exit(1);
    }
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  return () => {
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);
  };
}

function isEntrypoint() {
  return Boolean(process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url);
}

if (isEntrypoint()) {
  const runtime = startSocialWorkerRuntime();
  registerWorkerShutdownHandlers({ runtime });
}
