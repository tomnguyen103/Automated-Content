import "server-only";

import { and, eq } from "drizzle-orm";
import { getDb, type DatabaseClient } from "@/db";
import { scheduledJobs, type ScheduledJob } from "@/db/schema";
import { isDatabaseConfigured } from "@/lib/env";
import type { ProviderKey } from "@/lib/providers/types";
import { enqueueScheduledPost, type EnqueueScheduledPostResult } from "@/lib/scheduler/enqueue";
import {
  classifyPublishFailure,
  type PublishFailureRecovery
} from "@/lib/scheduler/publish-recovery";

export type CreateScheduledPostInput = {
  workspaceId: string;
  platformVariantId: string;
  provider: ProviderKey;
  connectedAccountId?: string | null;
  scheduledFor: Date;
  metadata?: Record<string, unknown>;
};

export type SchedulerRepository = {
  createScheduledJob: (input: CreateScheduledPostInput) => Promise<ScheduledJob>;
  markEnqueueQueued: (input: {
    workspaceId: string;
    scheduledJobId: string;
    queueJobId: string;
  }) => Promise<ScheduledJob>;
  markEnqueueFailed: (input: {
    workspaceId: string;
    scheduledJobId: string;
    errorMessage: string;
  }) => Promise<ScheduledJob>;
};

export type CreateScheduledPostResult = {
  scheduledJob: ScheduledJob;
  enqueue:
    | {
        status: "queued";
        queueJobId: string;
        delayMs: number;
      }
    | {
        status: "failed";
        error: string;
        recovery: PublishFailureRecovery;
      };
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to enqueue publishing job.";
}

function assertUpdatedJob(job: ScheduledJob | undefined, scheduledJobId: string): ScheduledJob {
  if (!job) {
    throw new Error(`Scheduled job ${scheduledJobId} was not found.`);
  }

  return job;
}

export function createDatabaseSchedulerRepository(db: DatabaseClient = getDb()): SchedulerRepository {
  return {
    async createScheduledJob(input) {
      const now = new Date();
      const [job] = await db
        .insert(scheduledJobs)
        .values({
          workspaceId: input.workspaceId,
          platformVariantId: input.platformVariantId,
          connectedAccountId: input.connectedAccountId ?? null,
          provider: input.provider,
          scheduledFor: input.scheduledFor,
          status: "scheduled",
          enqueueStatus: "pending",
          metadata: input.metadata ?? {},
          updatedAt: now
        })
        .returning();

      return assertUpdatedJob(job, "new");
    },
    async markEnqueueQueued(input) {
      const now = new Date();
      const [job] = await db
        .update(scheduledJobs)
        .set({
          status: "queued",
          enqueueStatus: "queued",
          queueJobId: input.queueJobId,
          enqueueError: null,
          updatedAt: now
        })
        .where(and(eq(scheduledJobs.workspaceId, input.workspaceId), eq(scheduledJobs.id, input.scheduledJobId)))
        .returning();

      return assertUpdatedJob(job, input.scheduledJobId);
    },
    async markEnqueueFailed(input) {
      const now = new Date();
      const [job] = await db
        .update(scheduledJobs)
        .set({
          status: "scheduled",
          enqueueStatus: "failed",
          enqueueError: input.errorMessage,
          updatedAt: now
        })
        .where(and(eq(scheduledJobs.workspaceId, input.workspaceId), eq(scheduledJobs.id, input.scheduledJobId)))
        .returning();

      return assertUpdatedJob(job, input.scheduledJobId);
    }
  };
}

export function createMemorySchedulerRepository(): SchedulerRepository & {
  clear: () => void;
  list: () => ScheduledJob[];
} {
  const jobs = new Map<string, ScheduledJob>();

  function save(job: ScheduledJob) {
    jobs.set(job.id, job);
    return job;
  }

  function update(workspaceId: string, scheduledJobId: string, values: Partial<ScheduledJob>) {
    const job = jobs.get(scheduledJobId);

    if (!job || job.workspaceId !== workspaceId) {
      throw new Error(`Scheduled job ${scheduledJobId} was not found.`);
    }

    return save({
      ...job,
      ...values,
      updatedAt: new Date()
    });
  }

  return {
    async createScheduledJob(input) {
      const now = new Date();
      return save({
        id: crypto.randomUUID(),
        workspaceId: input.workspaceId,
        platformVariantId: input.platformVariantId,
        connectedAccountId: input.connectedAccountId ?? null,
        provider: input.provider,
        scheduledFor: input.scheduledFor,
        status: "scheduled",
        enqueueStatus: "pending",
        queueJobId: null,
        enqueueError: null,
        attemptCount: 0,
        lockedAt: null,
        publishedAt: null,
        failedAt: null,
        metadata: input.metadata ?? {},
        createdAt: now,
        updatedAt: now
      });
    },
    async markEnqueueQueued(input) {
      return update(input.workspaceId, input.scheduledJobId, {
        status: "queued",
        enqueueStatus: "queued",
        queueJobId: input.queueJobId,
        enqueueError: null
      });
    },
    async markEnqueueFailed(input) {
      return update(input.workspaceId, input.scheduledJobId, {
        status: "scheduled",
        enqueueStatus: "failed",
        enqueueError: input.errorMessage
      });
    },
    clear() {
      jobs.clear();
    },
    list() {
      return [...jobs.values()];
    }
  };
}

const sharedMemorySchedulerRepository = createMemorySchedulerRepository();

export function createSchedulerRepository({ allowMemoryFallback = false } = {}) {
  if (allowMemoryFallback) {
    return sharedMemorySchedulerRepository;
  }

  if (isDatabaseConfigured) {
    return createDatabaseSchedulerRepository();
  }

  throw new Error("DATABASE_URL is required for scheduled post persistence.");
}

export async function createScheduledPost({
  input,
  repository = createSchedulerRepository(),
  enqueue = ({ scheduledJob }: { scheduledJob: ScheduledJob }) => enqueueScheduledPost({ scheduledJob })
}: {
  input: CreateScheduledPostInput;
  repository?: SchedulerRepository;
  enqueue?: (input: { scheduledJob: ScheduledJob }) => Promise<EnqueueScheduledPostResult>;
}): Promise<CreateScheduledPostResult> {
  const scheduledJob = await repository.createScheduledJob(input);

  try {
    const enqueueResult = await enqueue({ scheduledJob });
    const updatedJob = await repository.markEnqueueQueued({
      workspaceId: scheduledJob.workspaceId,
      scheduledJobId: scheduledJob.id,
      queueJobId: enqueueResult.queueJobId
    });

    return {
      scheduledJob: updatedJob,
      enqueue: {
        status: "queued",
        queueJobId: enqueueResult.queueJobId,
        delayMs: enqueueResult.delayMs
      }
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    const recovery = classifyPublishFailure({
      errorCode: "queue_enqueue",
      errorMessage
    });
    const updatedJob = await repository.markEnqueueFailed({
      workspaceId: scheduledJob.workspaceId,
      scheduledJobId: scheduledJob.id,
      errorMessage
    });

    return {
      scheduledJob: updatedJob,
      enqueue: {
        status: "failed",
        error: errorMessage,
        recovery
      }
    };
  }
}

export function clearScheduledPostsForTests() {
  sharedMemorySchedulerRepository.clear();
}

export function listScheduledPostsForTests() {
  return sharedMemorySchedulerRepository.list();
}
