import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { getDb, type DatabaseClient } from "@/db";
import { publishAttempts, scheduledJobs } from "@/db/schema";
import { isDatabaseConfigured } from "@/lib/env";
import { enqueueScheduledPost } from "@/lib/scheduler/enqueue";
import {
  classifyPublishFailure,
  type PublishFailureRecovery
} from "@/lib/scheduler/publish-recovery";

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

  const enqueue = await enqueueScheduledPost({
    scheduledJob: job
  });
  const now = new Date();
  const [updated] = await database
    .update(scheduledJobs)
    .set({
      status: "queued",
      enqueueStatus: "queued",
      queueJobId: enqueue.queueJobId,
      enqueueError: null,
      lockedAt: null,
      failedAt: null,
      updatedAt: now
    })
    .where(and(eq(scheduledJobs.workspaceId, workspaceId), eq(scheduledJobs.id, scheduledJobId)))
    .returning();

  return {
    scheduledJob: updated ?? job,
    enqueue,
    recovery
  };
}
