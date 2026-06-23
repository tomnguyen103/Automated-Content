import process from "node:process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { Worker } from "bullmq";
import { env } from "@/lib/env";
import type { PublishPostJobData } from "@/lib/scheduler/enqueue";
import type { RunAgentMissionJobData } from "@/lib/agents/orchestration/queue";
import type * as PublishQueueModule from "@/lib/scheduler/enqueue";
import type * as PublishPostJobModule from "@/workers/jobs/publish-post";
import type * as RunAgentMissionJobModule from "@/workers/jobs/run-agent-mission";

type SocialWorker = Worker<PublishPostJobData> | Worker<RunAgentMissionJobData>;
type WorkerLogger = Pick<typeof console, "error" | "log">;
type WorkerModules = {
  publishPostJob: typeof PublishPostJobModule;
  publishQueue: typeof PublishQueueModule;
  runAgentMissionJob: typeof RunAgentMissionJobModule;
};

const PUBLISH_QUEUE_NAME = "social-publishing";
const AGENT_MISSION_QUEUE_NAME = "agent-missions";
const workerRequire = createRequire(import.meta.url);

function installServerOnlyShim() {
  const serverOnlyPath = workerRequire.resolve("server-only");

  if (!workerRequire.cache[serverOnlyPath]) {
    workerRequire.cache[serverOnlyPath] = {
      children: [],
      exports: {},
      filename: serverOnlyPath,
      id: serverOnlyPath,
      isPreloading: false,
      loaded: true,
      path: "",
      paths: []
    } as unknown as NodeJS.Module;
  }
}

function loadWorkerModules(): WorkerModules {
  installServerOnlyShim();

  return {
    publishPostJob: workerRequire("@/workers/jobs/publish-post") as typeof PublishPostJobModule,
    publishQueue: workerRequire("@/lib/scheduler/enqueue") as typeof PublishQueueModule,
    runAgentMissionJob: workerRequire("@/workers/jobs/run-agent-mission") as typeof RunAgentMissionJobModule
  };
}

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
  const {
    publishPostJob: { publishScheduledPostJob },
    publishQueue: { createRedisConnectionOptions }
  } = loadWorkerModules();

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
  const {
    publishQueue: { createRedisConnectionOptions },
    runAgentMissionJob: { runAgentMissionJob }
  } = loadWorkerModules();

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
  const workers: SocialWorker[] = [];

  try {
    workers.push(createPublishingWorker({
      concurrency: publishingConcurrency,
      redisUrl
    }));
    workers.push(createMissionWorker({
      concurrency: agentMissionConcurrency,
      redisUrl
    }));
  } catch (error) {
    void Promise.all(workers.map((worker) => worker.close().catch(() => undefined)));
    throw error;
  }

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
