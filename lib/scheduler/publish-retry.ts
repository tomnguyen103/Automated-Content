import "server-only";

import { and, desc, eq, isNull, or } from "drizzle-orm";
import { getDb, type DatabaseClient } from "@/db";
import { publishAttempts, scheduledJobs } from "@/db/schema";
import { isDatabaseConfigured } from "@/lib/env";
import { enqueueScheduledPost } from "@/lib/scheduler/enqueue";
import {
  classifyPublishFailure,
  type PublishFailureRecovery
} from "@/lib/scheduler/publish-recovery";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to enqueue scheduled publish retry.";
}

export class PublishRetryError extends Error {
  readonly code: string;
  readonly status: number;
  readonly recovery?: PublishFailureRecovery;

  constructor({
    code,
    message,
    recovery,
    status = 409
  }: {
    code: string;
    message: string;
    recovery?: PublishFailureRecovery;
    status?: number;
  }) {
    super(message);
    this.name = "PublishRetryError";
    this.code = code;
    this.status = status;
    this.recovery = recovery;
  }
}

export async function retryScheduledPublish({
  db,
  scheduledJobId,
  workspaceId
}: {
  db?: DatabaseClient;
  scheduledJobId: string;
  workspaceId: string;
}) {
  if (!isDatabaseConfigured) {
    throw new PublishRetryError({
      code: "database_required",
      message: "Database persistence is required to retry scheduled publishes.",
      status: 503
    });
  }

  const database = db ?? getDb();
  const [job] = await database
    .select()
    .from(scheduledJobs)
    .where(and(eq(scheduledJobs.workspaceId, workspaceId), eq(scheduledJobs.id, scheduledJobId)))
    .limit(1);

  if (!job) {
    throw new PublishRetryError({
      code: "scheduled_job_not_found",
      message: "Scheduled job was not found.",
      status: 404
    });
  }

  if (job.status === "published") {
    throw new PublishRetryError({
      code: "duplicate_send_blocked",
      message: "Published jobs cannot be retried.",
      status: 409
    });
  }

  const [succeededAttempt] = await database
    .select({ id: publishAttempts.id })
    .from(publishAttempts)
    .where(
      and(
        eq(publishAttempts.workspaceId, workspaceId),
        eq(publishAttempts.scheduledJobId, scheduledJobId),
        eq(publishAttempts.status, "succeeded")
      )
    )
    .limit(1);

  if (succeededAttempt) {
    throw new PublishRetryError({
      code: "duplicate_send_blocked",
      message: "A successful publish attempt already exists for this scheduled job.",
      status: 409
    });
  }

  const [latestFailure] = await database
    .select({
      errorCode: publishAttempts.errorCode,
      errorMessage: publishAttempts.errorMessage
    })
    .from(publishAttempts)
    .where(
      and(
        eq(publishAttempts.workspaceId, workspaceId),
        eq(publishAttempts.scheduledJobId, scheduledJobId),
        eq(publishAttempts.status, "failed")
      )
    )
    .orderBy(desc(publishAttempts.completedAt), desc(publishAttempts.createdAt))
    .limit(1);
  const recovery = classifyPublishFailure({
    errorCode: job.enqueueStatus === "failed" ? "queue_enqueue" : latestFailure?.errorCode,
    errorMessage: job.enqueueStatus === "failed" ? job.enqueueError : latestFailure?.errorMessage
  });

  if (!recovery.retryable) {
    throw new PublishRetryError({
      code: "publish_retry_not_allowed",
      message: "This publish failure is not safe to retry automatically.",
      recovery,
      status: 409
    });
  }

  const now = new Date();
  const [reservedJob] = await database
    .update(scheduledJobs)
    .set({
      lockedAt: now,
      updatedAt: now
    })
    .where(
      and(
        eq(scheduledJobs.workspaceId, workspaceId),
        eq(scheduledJobs.id, scheduledJobId),
        isNull(scheduledJobs.lockedAt),
        or(
          eq(scheduledJobs.status, "failed"),
          and(eq(scheduledJobs.status, "scheduled"), eq(scheduledJobs.enqueueStatus, "failed"))
        )
      )
    )
    .returning();

  if (!reservedJob) {
    throw new PublishRetryError({
      code: "publish_retry_conflict",
      message: "Scheduled job is already being retried or is no longer eligible for retry.",
      status: 409
    });
  }

  const reservedLockedAt = reservedJob.lockedAt;

  if (!reservedLockedAt) {
    throw new PublishRetryError({
      code: "publish_retry_conflict",
      message: "Scheduled job retry reservation could not be confirmed.",
      status: 409
    });
  }

  let enqueue: Awaited<ReturnType<typeof enqueueScheduledPost>>;

  try {
    enqueue = await enqueueScheduledPost({
      scheduledJob: reservedJob
    });
  } catch (error) {
    const errorMessage = getErrorMessage(error);

    await database
      .update(scheduledJobs)
      .set({
        enqueueStatus: "failed",
        enqueueError: errorMessage,
        lockedAt: null,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(scheduledJobs.workspaceId, workspaceId),
          eq(scheduledJobs.id, scheduledJobId),
          eq(scheduledJobs.lockedAt, reservedLockedAt)
        )
      );

    throw new PublishRetryError({
      code: "queue_enqueue",
      message: errorMessage,
      recovery: classifyPublishFailure({
        errorCode: "queue_enqueue",
        errorMessage
      }),
      status: 503
    });
  }

  const [updated] = await database
    .update(scheduledJobs)
    .set({
      status: "queued",
      enqueueStatus: "queued",
      queueJobId: enqueue.queueJobId,
      enqueueError: null,
      lockedAt: null,
      failedAt: null,
      updatedAt: new Date()
    })
    .where(
      and(
        eq(scheduledJobs.workspaceId, workspaceId),
        eq(scheduledJobs.id, scheduledJobId),
        eq(scheduledJobs.lockedAt, reservedLockedAt)
      )
    )
    .returning();

  if (!updated) {
    throw new PublishRetryError({
      code: "publish_retry_conflict",
      message: "Scheduled job retry reservation was changed before enqueue state could be saved.",
      status: 409
    });
  }

  return {
    scheduledJob: updated,
    enqueue,
    recovery
  };
}
