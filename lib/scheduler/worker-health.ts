import "server-only";

import { Queue, type JobType } from "bullmq";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { agentMissions, publishAttempts } from "@/db/schema";
import { env, isDatabaseConfigured } from "@/lib/env";
import {
  AGENT_MISSION_QUEUE_NAME,
  RUN_AGENT_MISSION_JOB_NAME,
  type RunAgentMissionJobData
} from "@/lib/agents/orchestration/queue";
import {
  PUBLISH_POST_JOB_NAME,
  PUBLISH_QUEUE_NAME,
  createRedisConnectionOptions,
  type PublishPostJobData
} from "@/lib/scheduler/enqueue";

export type WorkerQueueKind = "publishing" | "agent_missions";

export type WorkerQueueStatus =
  | "healthy"
  | "preview"
  | "queue_not_configured"
  | "redis_unavailable"
  | "worker_not_running"
  | "jobs_failed"
  | "jobs_waiting";

export type WorkerQueueCounts = {
  waiting: number;
  delayed: number;
  active: number;
  completed: number;
  failed: number;
  paused: number;
  stalled: number;
};

export type WorkerQueueHealth = {
  kind: WorkerQueueKind;
  queueName: string;
  jobName: string;
  configured: boolean;
  redisReachable: boolean;
  workerExpected: boolean;
  workerRunning: boolean | null;
  status: WorkerQueueStatus;
  counts: WorkerQueueCounts;
  lastSuccessfulJobAt: string | null;
  lastFailedJobAt: string | null;
  blockingReason?: string;
  recommendedAction: string;
};

export type WorkerRuntimeReadiness = {
  generatedAt: string;
  queues: WorkerQueueHealth[];
  summary: {
    configured: number;
    healthy: number;
    blocked: number;
    retryableFailures: number;
  };
};

type QueueLike = {
  close?: () => Promise<unknown>;
  getJobCounts: (...types: JobType[]) => Promise<Record<string, number>>;
  getWorkers?: () => Promise<unknown[]>;
};

const emptyCounts: WorkerQueueCounts = {
  waiting: 0,
  delayed: 0,
  active: 0,
  completed: 0,
  failed: 0,
  paused: 0,
  stalled: 0
};

function withTimeout<T>(promise: Promise<T>, timeoutMs = 3000): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timeout = setTimeout(() => reject(new Error("Queue health check timed out.")), timeoutMs);
    })
  ]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}

function getStatusFromCounts({
  counts,
  workerRunning
}: {
  counts: WorkerQueueCounts;
  workerRunning: boolean | null;
}): WorkerQueueStatus {
  if (workerRunning === false) {
    return "worker_not_running";
  }

  if (counts.failed > 0 || counts.stalled > 0) {
    return "jobs_failed";
  }

  if (counts.waiting > 0 || counts.delayed > 0) {
    return "jobs_waiting";
  }

  return "healthy";
}

function getRecommendedAction(status: WorkerQueueStatus) {
  if (status === "preview") {
    return "Local preview runs without Redis. Use inline execution for development.";
  }

  if (status === "queue_not_configured") {
    return "Set REDIS_URL and start the worker process before relying on queued publishing.";
  }

  if (status === "redis_unavailable") {
    return "Check Redis connectivity, credentials, firewall rules, and worker environment variables.";
  }

  if (status === "worker_not_running") {
    return "Start the social worker process and verify it has the same REDIS_URL as the app.";
  }

  if (status === "jobs_failed") {
    return "Inspect failed jobs and retry only queue enqueue or provider transient failures.";
  }

  if (status === "jobs_waiting") {
    return "Confirm workers are processing jobs and queue delay windows are expected.";
  }

  return "No action needed.";
}

function createPublishingQueue() {
  return new Queue<PublishPostJobData>(PUBLISH_QUEUE_NAME, {
    connection: createRedisConnectionOptions()
  });
}

function createMissionQueue() {
  return new Queue<RunAgentMissionJobData>(AGENT_MISSION_QUEUE_NAME, {
    connection: createRedisConnectionOptions()
  });
}

async function inspectQueue({
  createQueue,
  jobName,
  kind,
  lastFailedJobAt,
  lastSuccessfulJobAt,
  queueName
}: {
  createQueue: () => QueueLike;
  jobName: string;
  kind: WorkerQueueKind;
  lastFailedJobAt: string | null;
  lastSuccessfulJobAt: string | null;
  queueName: string;
}): Promise<WorkerQueueHealth> {
  if (!env.REDIS_URL) {
    return {
      kind,
      queueName,
      jobName,
      configured: false,
      redisReachable: false,
      workerExpected: false,
      workerRunning: null,
      status: "queue_not_configured",
      counts: emptyCounts,
      lastSuccessfulJobAt,
      lastFailedJobAt,
      blockingReason: "REDIS_URL is not configured.",
      recommendedAction: getRecommendedAction("queue_not_configured")
    };
  }

  const queue = createQueue();

  try {
    const [rawCounts, workers] = await Promise.all([
      withTimeout(queue.getJobCounts("waiting", "delayed", "active", "completed", "failed", "paused")),
      queue.getWorkers ? withTimeout(queue.getWorkers()) : Promise.resolve(null)
    ]);
    const counts = {
      ...emptyCounts,
      waiting: rawCounts.waiting ?? 0,
      delayed: rawCounts.delayed ?? 0,
      active: rawCounts.active ?? 0,
      completed: rawCounts.completed ?? 0,
      failed: rawCounts.failed ?? 0,
      paused: rawCounts.paused ?? 0
    };
    const workerRunning = workers ? workers.length > 0 : null;
    const status = getStatusFromCounts({ counts, workerRunning });

    return {
      kind,
      queueName,
      jobName,
      configured: true,
      redisReachable: true,
      workerExpected: true,
      workerRunning,
      status,
      counts,
      lastSuccessfulJobAt,
      lastFailedJobAt,
      blockingReason:
        status === "healthy" || status === "jobs_waiting"
          ? undefined
          : status === "worker_not_running"
            ? "No active worker is registered for this queue."
            : "Queue has failed or stalled jobs.",
      recommendedAction: getRecommendedAction(status)
    };
  } catch (error) {
    return {
      kind,
      queueName,
      jobName,
      configured: true,
      redisReachable: false,
      workerExpected: true,
      workerRunning: null,
      status: "redis_unavailable",
      counts: emptyCounts,
      lastSuccessfulJobAt,
      lastFailedJobAt,
      blockingReason: error instanceof Error ? error.message : "Redis is unavailable.",
      recommendedAction: getRecommendedAction("redis_unavailable")
    };
  } finally {
    try {
      await queue.close?.();
    } catch {
      // Keep readiness reporting best-effort even when Redis cleanup fails.
    }
  }
}

async function getPublishTimestamps(workspaceId: string | null | undefined) {
  if (!isDatabaseConfigured || !workspaceId) {
    return {
      lastSuccessfulJobAt: null,
      lastFailedJobAt: null
    };
  }

  const db = getDb();
  const [success] = await db
    .select({ completedAt: publishAttempts.completedAt })
    .from(publishAttempts)
    .where(and(eq(publishAttempts.workspaceId, workspaceId), eq(publishAttempts.status, "succeeded")))
    .orderBy(desc(publishAttempts.completedAt), desc(publishAttempts.createdAt))
    .limit(1);
  const [failure] = await db
    .select({ completedAt: publishAttempts.completedAt })
    .from(publishAttempts)
    .where(and(eq(publishAttempts.workspaceId, workspaceId), eq(publishAttempts.status, "failed")))
    .orderBy(desc(publishAttempts.completedAt), desc(publishAttempts.createdAt))
    .limit(1);

  return {
    lastSuccessfulJobAt: success?.completedAt?.toISOString() ?? null,
    lastFailedJobAt: failure?.completedAt?.toISOString() ?? null
  };
}

async function getMissionTimestamps(workspaceId: string | null | undefined) {
  if (!isDatabaseConfigured || !workspaceId) {
    return {
      lastSuccessfulJobAt: null,
      lastFailedJobAt: null
    };
  }

  const db = getDb();
  const [success] = await db
    .select({ completedAt: agentMissions.completedAt })
    .from(agentMissions)
    .where(and(eq(agentMissions.workspaceId, workspaceId), eq(agentMissions.status, "succeeded")))
    .orderBy(desc(agentMissions.completedAt), desc(agentMissions.createdAt))
    .limit(1);
  const [failure] = await db
    .select({ completedAt: agentMissions.completedAt })
    .from(agentMissions)
    .where(and(eq(agentMissions.workspaceId, workspaceId), eq(agentMissions.status, "failed")))
    .orderBy(desc(agentMissions.completedAt), desc(agentMissions.createdAt))
    .limit(1);

  return {
    lastSuccessfulJobAt: success?.completedAt?.toISOString() ?? null,
    lastFailedJobAt: failure?.completedAt?.toISOString() ?? null
  };
}

function createPreviewQueueHealth(kind: WorkerQueueKind, queueName: string, jobName: string): WorkerQueueHealth {
  return {
    kind,
    queueName,
    jobName,
    configured: false,
    redisReachable: false,
    workerExpected: false,
    workerRunning: null,
    status: "preview",
    counts: emptyCounts,
    lastSuccessfulJobAt: null,
    lastFailedJobAt: null,
    recommendedAction: getRecommendedAction("preview")
  };
}

export async function getWorkerRuntimeReadiness({
  isLocalPreview = false,
  workspaceId
}: {
  isLocalPreview?: boolean;
  workspaceId: string | null | undefined;
}): Promise<WorkerRuntimeReadiness> {
  const generatedAt = new Date().toISOString();

  if (isLocalPreview) {
    const queues = [
      createPreviewQueueHealth("publishing", PUBLISH_QUEUE_NAME, PUBLISH_POST_JOB_NAME),
      createPreviewQueueHealth("agent_missions", AGENT_MISSION_QUEUE_NAME, RUN_AGENT_MISSION_JOB_NAME)
    ];

    return {
      generatedAt,
      queues,
      summary: {
        configured: 0,
        healthy: 0,
        blocked: 0,
        retryableFailures: 0
      }
    };
  }

  const [publishTimestamps, missionTimestamps] = await Promise.all([
    getPublishTimestamps(workspaceId),
    getMissionTimestamps(workspaceId)
  ]);
  const queues = await Promise.all([
    inspectQueue({
      kind: "publishing",
      queueName: PUBLISH_QUEUE_NAME,
      jobName: PUBLISH_POST_JOB_NAME,
      createQueue: createPublishingQueue,
      ...publishTimestamps
    }),
    inspectQueue({
      kind: "agent_missions",
      queueName: AGENT_MISSION_QUEUE_NAME,
      jobName: RUN_AGENT_MISSION_JOB_NAME,
      createQueue: createMissionQueue,
      ...missionTimestamps
    })
  ]);

  return {
    generatedAt,
    queues,
    summary: {
      configured: queues.filter((queue) => queue.configured).length,
      healthy: queues.filter((queue) => queue.status === "healthy").length,
      blocked: queues.filter((queue) =>
        ["queue_not_configured", "redis_unavailable", "worker_not_running", "jobs_failed"].includes(queue.status)
      ).length,
      retryableFailures: queues.reduce((total, queue) => total + queue.counts.failed + queue.counts.stalled, 0)
    }
  };
}
