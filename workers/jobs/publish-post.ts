import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, type DatabaseClient } from "@/db";
import {
  connectedAccounts,
  platformVariants,
  publishAttempts,
  scheduledJobs,
  type ScheduledJob,
  usageLedger
} from "@/db/schema";
import {
  formatProviderPlatformError,
  isProviderCompatibleWithPlatform
} from "@/lib/providers/platform-compatibility";
import { getProviderAdapter } from "@/lib/providers/registry";
import type { PublishPostJobData } from "@/lib/scheduler/enqueue";

const publishableJobStatuses = ["scheduled", "queued"] as const;

type PublishJobRepository = ReturnType<typeof createPublishJobRepository>;

function isPublishableJobStatus(status: ScheduledJob["status"]) {
  return publishableJobStatuses.some((publishableStatus) => publishableStatus === status);
}

function toJsonRecord(value: unknown) {
  return value as Record<string, unknown>;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to publish scheduled post.";
}

function isLocalPreviewJob(job: ScheduledJob) {
  return job.metadata.localPreview === true;
}

export function createPublishJobRepository(db: DatabaseClient = getDb()) {
  return {
    async loadScheduledPost(data: PublishPostJobData) {
      const [row] = await db
        .select({
          job: scheduledJobs,
          variant: platformVariants,
          account: connectedAccounts
        })
        .from(scheduledJobs)
        .innerJoin(
          platformVariants,
          and(
            eq(scheduledJobs.workspaceId, platformVariants.workspaceId),
            eq(scheduledJobs.platformVariantId, platformVariants.id)
          )
        )
        .leftJoin(
          connectedAccounts,
          and(
            eq(scheduledJobs.workspaceId, connectedAccounts.workspaceId),
            eq(scheduledJobs.connectedAccountId, connectedAccounts.id),
            eq(scheduledJobs.provider, connectedAccounts.provider)
          )
        )
        .where(and(eq(scheduledJobs.workspaceId, data.workspaceId), eq(scheduledJobs.id, data.scheduledJobId)))
        .limit(1);

      return row ?? null;
    },
    async startAttempt(data: PublishPostJobData) {
      const now = new Date();
      const [attempt] = await db.transaction(async (tx) => {
        const [job] = await tx
          .update(scheduledJobs)
          .set({
            status: "publishing",
            lockedAt: now,
            attemptCount: sql`${scheduledJobs.attemptCount} + 1`,
            updatedAt: now
          })
          .where(
            and(
              eq(scheduledJobs.workspaceId, data.workspaceId),
              eq(scheduledJobs.id, data.scheduledJobId),
              inArray(scheduledJobs.status, [...publishableJobStatuses])
            )
          )
          .returning({ id: scheduledJobs.id });

        if (!job) {
          throw new Error(`Scheduled job ${data.scheduledJobId} is not eligible for publishing.`);
        }

        return tx
          .insert(publishAttempts)
          .values({
            workspaceId: data.workspaceId,
            scheduledJobId: data.scheduledJobId,
            provider: data.provider,
            status: "publishing",
            startedAt: now,
            updatedAt: now
          })
          .returning();
      });

      if (!attempt) {
        throw new Error(`Publish attempt could not be created for ${data.scheduledJobId}.`);
      }

      return attempt;
    },
    async markSucceeded({
      workspaceId,
      scheduledJobId,
      attemptId,
      providerPostId,
      providerResponse
    }: {
      workspaceId: string;
      scheduledJobId: string;
      attemptId: string;
      providerPostId: string;
      providerResponse: Record<string, unknown>;
    }) {
      const now = new Date();

      await db.transaction(async (tx) => {
        await tx
          .update(publishAttempts)
          .set({
            status: "succeeded",
            providerPostId,
            providerResponse,
            completedAt: now,
            updatedAt: now
          })
          .where(and(eq(publishAttempts.workspaceId, workspaceId), eq(publishAttempts.id, attemptId)));

        await tx
          .update(scheduledJobs)
          .set({
            status: "published",
            publishedAt: now,
            lockedAt: null,
            failedAt: null,
            updatedAt: now
          })
          .where(and(eq(scheduledJobs.workspaceId, workspaceId), eq(scheduledJobs.id, scheduledJobId)));

        await tx.insert(usageLedger).values({
          workspaceId,
          type: "publish_attempt",
          quantity: 1,
          sourceId: scheduledJobId,
          metadata: {
            providerPostId
          }
        });
      });
    },
    async markFailed({
      workspaceId,
      scheduledJobId,
      attemptId,
      errorCode,
      errorMessage
    }: {
      workspaceId: string;
      scheduledJobId: string;
      attemptId: string;
      errorCode: string;
      errorMessage: string;
    }) {
      const now = new Date();

      await db.transaction(async (tx) => {
        await tx
          .update(publishAttempts)
          .set({
            status: "failed",
            errorCode,
            errorMessage,
            completedAt: now,
            updatedAt: now
          })
          .where(and(eq(publishAttempts.workspaceId, workspaceId), eq(publishAttempts.id, attemptId)));

        await tx
          .update(scheduledJobs)
          .set({
            status: "failed",
            lockedAt: null,
            failedAt: now,
            updatedAt: now
          })
          .where(and(eq(scheduledJobs.workspaceId, workspaceId), eq(scheduledJobs.id, scheduledJobId)));
      });
    }
  };
}

export async function publishScheduledPostJob({
  data,
  repository = createPublishJobRepository()
}: {
  data: PublishPostJobData;
  repository?: PublishJobRepository;
}) {
  const loaded = await repository.loadScheduledPost(data);

  if (!loaded) {
    throw new Error(`Scheduled job ${data.scheduledJobId} was not found.`);
  }

  if (!isPublishableJobStatus(loaded.job.status)) {
    throw new Error(`Scheduled job ${data.scheduledJobId} is not eligible for publishing.`);
  }

  if (loaded.job.provider !== data.provider) {
    throw new Error(
      `Scheduled job ${data.scheduledJobId} provider mismatch: expected ${loaded.job.provider}, received ${data.provider}.`
    );
  }

  if (loaded.job.connectedAccountId && !loaded.account) {
    throw new Error(`Connected account ${loaded.job.connectedAccountId} was not found for this workspace.`);
  }

  if (loaded.account && loaded.account.status !== "connected") {
    throw new Error(`Connected account ${loaded.account.id} is not ready for publishing.`);
  }

  if (loaded.variant.policyStatus !== "pass") {
    throw new Error(`Platform variant ${loaded.variant.id} is not approved for publishing.`);
  }

  if (
    !isProviderCompatibleWithPlatform({
      allowMock: isLocalPreviewJob(loaded.job),
      platform: loaded.variant.platform,
      provider: loaded.job.provider
    })
  ) {
    throw new Error(formatProviderPlatformError(loaded.job.provider, loaded.variant.platform));
  }

  const provider = getProviderAdapter(loaded.job.provider);
  const attempt = await repository.startAttempt({
    ...data,
    provider: loaded.job.provider
  });

  try {
    const result = await provider.publish({
      workspaceId: loaded.job.workspaceId,
      connectedAccountId: loaded.account?.id,
      providerAccountId: loaded.account?.providerAccountId,
      tokenRef: loaded.account?.tokenRef,
      scheduledJobId: loaded.job.id,
      scheduledFor: loaded.job.scheduledFor,
      content: {
        variantId: loaded.variant.id,
        title: loaded.variant.title,
        hook: loaded.variant.hook,
        body: loaded.variant.body,
        cta: loaded.variant.cta,
        hashtags: loaded.variant.hashtags,
        media: loaded.variant.media
      }
    });

    await repository.markSucceeded({
      workspaceId: loaded.job.workspaceId,
      scheduledJobId: loaded.job.id,
      attemptId: attempt.id,
      providerPostId: result.providerPostId,
      providerResponse: toJsonRecord(result.raw ?? result)
    });

    return {
      status: "published" as const,
      providerPostId: result.providerPostId
    };
  } catch (error) {
    const normalized = provider.normalizeError(error);
    await repository.markFailed({
      workspaceId: loaded.job.workspaceId,
      scheduledJobId: loaded.job.id,
      attemptId: attempt.id,
      errorCode: normalized.code,
      errorMessage: normalized.message || getErrorMessage(error)
    });

    throw error;
  }
}
