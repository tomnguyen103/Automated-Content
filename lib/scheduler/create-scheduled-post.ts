import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { getDb, type DatabaseClient } from "@/db";
import { scheduledJobs, type ScheduledJob } from "@/db/schema";
import {
  consumeUsageForLimitInTransaction,
  type ConsumeUsageForLimitInput
} from "@/lib/billing/usage";
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
  sourceId?: string;
  scheduledFor: Date;
  metadata?: Record<string, unknown>;
};

type ScheduledJobCreation = {
  created: boolean;
  scheduledJob: ScheduledJob;
};

type CreateScheduledJobOptions = {
  usageReservation?: ConsumeUsageForLimitInput;
};

export type SchedulerRepository = {
  createScheduledJob: (
    input: CreateScheduledPostInput,
    options?: CreateScheduledJobOptions
  ) => Promise<ScheduledJobCreation>;
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

type SchedulerDatabaseExecutor = Pick<DatabaseClient, "insert" | "select">;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to enqueue publishing job.";
}

function assertUpdatedJob(job: ScheduledJob | undefined, scheduledJobId: string): ScheduledJob {
  if (!job) {
    throw new Error(`Scheduled job ${scheduledJobId} was not found.`);
  }

  return job;
}

async function findScheduledJobBySource({
  db,
  sourceId,
  workspaceId
}: {
  db: SchedulerDatabaseExecutor;
  sourceId: string;
  workspaceId: string;
}) {
  const [job] = await db
    .select()
    .from(scheduledJobs)
    .where(and(eq(scheduledJobs.workspaceId, workspaceId), eq(scheduledJobs.sourceId, sourceId)))
    .limit(1);

  return assertUpdatedJob(job, sourceId);
}

async function insertScheduledJobRecord(
  db: SchedulerDatabaseExecutor,
  input: CreateScheduledPostInput
): Promise<ScheduledJobCreation> {
  const now = new Date();
  const insert = db
    .insert(scheduledJobs)
    .values({
      workspaceId: input.workspaceId,
      platformVariantId: input.platformVariantId,
      connectedAccountId: input.connectedAccountId ?? null,
      provider: input.provider,
      sourceId: input.sourceId,
      scheduledFor: input.scheduledFor,
      status: "scheduled",
      enqueueStatus: "pending",
      metadata: input.metadata ?? {},
      updatedAt: now
    });

  if (input.sourceId) {
    const [job] = await insert
      .onConflictDoNothing({
        target: [scheduledJobs.workspaceId, scheduledJobs.sourceId],
        where: sql`${scheduledJobs.sourceId} is not null`
      })
      .returning();

    if (job) {
      return {
        created: true,
        scheduledJob: job
      };
    }

    return {
      created: false,
      scheduledJob: await findScheduledJobBySource({
        db,
        sourceId: input.sourceId,
        workspaceId: input.workspaceId
      })
    };
  }

  const [job] = await insert.returning();

  return {
    created: true,
    scheduledJob: assertUpdatedJob(job, "new")
  };
}

export function createDatabaseSchedulerRepository(db: DatabaseClient = getDb()): SchedulerRepository {
  return {
    async createScheduledJob(input, options) {
      const usageReservation = options?.usageReservation;

      if (usageReservation && !usageReservation.skip) {
        return db.transaction(async (tx) => {
          const creation = await insertScheduledJobRecord(tx, input);
          await consumeUsageForLimitInTransaction({
            workspaceId: usageReservation.workspaceId,
            key: usageReservation.key,
            quantity: usageReservation.quantity,
            sourceId: usageReservation.sourceId,
            metadata: usageReservation.metadata,
            now: usageReservation.now,
            skip: usageReservation.skip,
            tx
          });

          return creation;
        });
      }

      return insertScheduledJobRecord(db, input);
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
      if (input.sourceId) {
        const existing = [...jobs.values()].find(
          (job) => job.workspaceId === input.workspaceId && job.sourceId === input.sourceId
        );

        if (existing) {
          return {
            created: false,
            scheduledJob: existing
          };
        }
      }

      const now = new Date();
      const scheduledJob = save({
        id: crypto.randomUUID(),
        workspaceId: input.workspaceId,
        platformVariantId: input.platformVariantId,
        connectedAccountId: input.connectedAccountId ?? null,
        provider: input.provider,
        sourceId: input.sourceId ?? null,
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

      return {
        created: true,
        scheduledJob
      };
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
  enqueue = ({ scheduledJob }: { scheduledJob: ScheduledJob }) => enqueueScheduledPost({ scheduledJob }),
  usageReservation
}: {
  input: CreateScheduledPostInput;
  repository?: SchedulerRepository;
  enqueue?: (input: { scheduledJob: ScheduledJob }) => Promise<EnqueueScheduledPostResult>;
  usageReservation?: ConsumeUsageForLimitInput;
}): Promise<CreateScheduledPostResult> {
  if (usageReservation?.sourceId && usageReservation.sourceId !== input.sourceId) {
    throw new Error("Usage reservation sourceId must match scheduled post sourceId.");
  }

  const { scheduledJob } = await repository.createScheduledJob(input, {
    usageReservation
  });

  if (scheduledJob.enqueueStatus === "queued" && scheduledJob.queueJobId) {
    return {
      scheduledJob,
      enqueue: {
        status: "queued",
        queueJobId: scheduledJob.queueJobId,
        delayMs: Math.max(0, scheduledJob.scheduledFor.getTime() - Date.now())
      }
    };
  }

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
