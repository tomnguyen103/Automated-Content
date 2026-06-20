import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { getDb, type DatabaseClient } from "@/db";
import {
  connectedAccounts,
  platformVariants,
  publishAttempts,
  scheduledJobs,
  usageLedger
} from "@/db/schema";
import { getProviderAdapter } from "@/lib/providers/registry";
import type { PublishPostJobData } from "@/lib/scheduler/enqueue";

type PublishJobRepository = ReturnType<typeof createPublishJobRepository>;

function toJsonRecord(value: unknown) {
  return value as Record<string, unknown>;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to publish scheduled post.";
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
        .leftJoin(connectedAccounts, eq(scheduledJobs.connectedAccountId, connectedAccounts.id))
        .where(and(eq(scheduledJobs.workspaceId, data.workspaceId), eq(scheduledJobs.id, data.scheduledJobId)))
        .limit(1);

      return row ?? null;
    },
    async startAttempt(data: PublishPostJobData) {
      const now = new Date();
      const [attempt] = await db.transaction(async (tx) => {
        await tx
          .update(scheduledJobs)
          .set({
            status: "publishing",
            lockedAt: now,
            attemptCount: sql`${scheduledJobs.attemptCount} + 1`,
            updatedAt: now
          })
          .where(and(eq(scheduledJobs.workspaceId, data.workspaceId), eq(scheduledJobs.id, data.scheduledJobId)));

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

  const provider = getProviderAdapter(loaded.job.provider);
  const attempt = await repository.startAttempt(data);

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
