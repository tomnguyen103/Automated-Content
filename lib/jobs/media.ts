import "server-only";

import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { mediaGenerationJobs, type MediaGenerationJobRow } from "@/db/schema";
import { isDatabaseConfigured } from "@/lib/env";
import {
  mediaGenerationJobKindSchema,
  mediaGenerationJobStatusSchema,
  type MediaGenerationJobKind,
  type MediaGenerationJobRecord,
  type MediaGenerationJobStatus
} from "@/lib/jobs/types";

const memoryJobsByWorkspace = new Map<string, MediaGenerationJobRecord[]>();

export type CreateMediaGenerationJobResult = {
  job: MediaGenerationJobRecord;
  created: boolean;
};

export class MediaGenerationJobNotFoundError extends Error {
  constructor(message = "Media generation job was not found.") {
    super(message);
    this.name = "MediaGenerationJobNotFoundError";
  }
}

export class MediaGenerationJobStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaGenerationJobStateError";
  }
}

function optionalIso(value: Date | null) {
  return value ? value.toISOString() : undefined;
}

export function mediaGenerationJobRowToRecord(row: MediaGenerationJobRow): MediaGenerationJobRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    createdByUserId: row.createdByUserId,
    jobKind: mediaGenerationJobKindSchema.parse(row.jobKind),
    status: mediaGenerationJobStatusSchema.parse(row.status),
    idempotencyKey: row.idempotencyKey ?? undefined,
    sourceAssetId: row.sourceAssetId ?? undefined,
    triggerTaskId: row.triggerTaskId ?? undefined,
    triggerRunId: row.triggerRunId ?? undefined,
    providerTaskId: row.providerTaskId ?? undefined,
    progress: row.progress,
    input: row.input,
    output: row.output,
    cost: row.cost,
    audit: row.audit,
    error: row.error ?? undefined,
    queuedAt: row.queuedAt.toISOString(),
    startedAt: optionalIso(row.startedAt),
    completedAt: optionalIso(row.completedAt),
    canceledAt: optionalIso(row.canceledAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function nowIso(now: Date) {
  return now.toISOString();
}

function getMemoryJobs(workspaceId: string) {
  return memoryJobsByWorkspace.get(workspaceId) ?? [];
}

function setMemoryJob(job: MediaGenerationJobRecord) {
  const existing = getMemoryJobs(job.workspaceId).filter((candidate) => candidate.id !== job.id);
  memoryJobsByWorkspace.set(job.workspaceId, [job, ...existing]);
  return job;
}

function normalizeIdempotencyKey(idempotencyKey: string | undefined) {
  const normalized = idempotencyKey?.trim();
  return normalized ? normalized : undefined;
}

function createMemoryJob({
  allowMemoryFallback,
  createdByUserId,
  idempotencyKey,
  input,
  jobKind,
  now,
  sourceAssetId,
  workspaceId
}: {
  allowMemoryFallback?: boolean;
  createdByUserId: string;
  idempotencyKey?: string;
  input: Record<string, unknown>;
  jobKind: MediaGenerationJobKind;
  now: Date;
  sourceAssetId?: string;
  workspaceId: string;
}): CreateMediaGenerationJobResult {
  if (!allowMemoryFallback && isDatabaseConfigured) {
    throw new Error("Memory media generation jobs are only available without a configured database.");
  }

  const normalizedIdempotencyKey = normalizeIdempotencyKey(idempotencyKey);

  if (normalizedIdempotencyKey) {
    const existing = getMemoryJobs(workspaceId).find((job) => job.idempotencyKey === normalizedIdempotencyKey);

    if (existing) {
      return {
        job: existing,
        created: false
      };
    }
  }

  const isoNow = nowIso(now);
  return {
    job: setMemoryJob({
      id: `media_job_${randomUUID()}`,
      workspaceId,
      createdByUserId,
      jobKind,
      status: "queued",
      idempotencyKey: normalizedIdempotencyKey,
      sourceAssetId,
      progress: 0,
      input,
      output: {},
      cost: {},
      audit: {},
      queuedAt: isoNow,
      createdAt: isoNow,
      updatedAt: isoNow
    }),
    created: true
  };
}

export async function createMediaGenerationJobForWorkspace({
  allowMemoryFallback = false,
  createdByUserId,
  idempotencyKey,
  input,
  jobKind,
  now = new Date(),
  sourceAssetId,
  workspaceId
}: {
  workspaceId: string;
  createdByUserId: string;
  jobKind: MediaGenerationJobKind;
  input: Record<string, unknown>;
  sourceAssetId?: string;
  idempotencyKey?: string;
  allowMemoryFallback?: boolean;
  now?: Date;
}): Promise<CreateMediaGenerationJobResult> {
  if (allowMemoryFallback || !isDatabaseConfigured) {
    return createMemoryJob({
      allowMemoryFallback,
      createdByUserId,
      idempotencyKey,
      input,
      jobKind,
      now,
      sourceAssetId,
      workspaceId
    });
  }

  const db = getDb();
  const normalizedIdempotencyKey = normalizeIdempotencyKey(idempotencyKey);

  const values = {
    id: `media_job_${randomUUID()}`,
    workspaceId,
    createdByUserId,
    jobKind,
    idempotencyKey: normalizedIdempotencyKey,
    sourceAssetId,
    input,
    queuedAt: now,
    updatedAt: now
  };

  if (!normalizedIdempotencyKey) {
    const [row] = await db.insert(mediaGenerationJobs).values(values).returning();

    return {
      job: mediaGenerationJobRowToRecord(row),
      created: true
    };
  }

  const [row] = await db
    .insert(mediaGenerationJobs)
    .values(values)
    .onConflictDoNothing({
      target: [mediaGenerationJobs.workspaceId, mediaGenerationJobs.idempotencyKey],
      where: sql`${mediaGenerationJobs.idempotencyKey} is not null`
    })
    .returning();

  if (row) {
    return {
      job: mediaGenerationJobRowToRecord(row),
      created: true
    };
  }

  const [existing] = await db
    .select()
    .from(mediaGenerationJobs)
    .where(
      and(
        eq(mediaGenerationJobs.workspaceId, workspaceId),
        eq(mediaGenerationJobs.idempotencyKey, normalizedIdempotencyKey)
      )
    )
    .limit(1);

  if (!existing) {
    throw new Error("Media generation job idempotency conflict could not be resolved.");
  }

  return {
    job: mediaGenerationJobRowToRecord(existing),
    created: false
  };
}

export async function listMediaGenerationJobsForWorkspace({
  allowMemoryFallback = false,
  limit = 50,
  workspaceId
}: {
  workspaceId: string;
  allowMemoryFallback?: boolean;
  limit?: number;
}) {
  if (allowMemoryFallback || !isDatabaseConfigured) {
    return getMemoryJobs(workspaceId).slice(0, Math.max(1, Math.min(100, Math.floor(limit))));
  }

  const rows = await getDb()
    .select()
    .from(mediaGenerationJobs)
    .where(eq(mediaGenerationJobs.workspaceId, workspaceId))
    .orderBy(desc(mediaGenerationJobs.createdAt))
    .limit(Math.max(1, Math.min(100, Math.floor(limit))));

  return rows.map(mediaGenerationJobRowToRecord);
}

export async function getMediaGenerationJobForWorkspace({
  allowMemoryFallback = false,
  jobId,
  workspaceId
}: {
  workspaceId: string;
  jobId: string;
  allowMemoryFallback?: boolean;
}) {
  if (allowMemoryFallback || !isDatabaseConfigured) {
    return getMemoryJobs(workspaceId).find((job) => job.id === jobId) ?? null;
  }

  const [row] = await getDb()
    .select()
    .from(mediaGenerationJobs)
    .where(and(eq(mediaGenerationJobs.workspaceId, workspaceId), eq(mediaGenerationJobs.id, jobId)))
    .limit(1);

  return row ? mediaGenerationJobRowToRecord(row) : null;
}

export async function attachMediaGenerationJobRun({
  allowMemoryFallback = false,
  jobId,
  now = new Date(),
  triggerRunId,
  triggerTaskId,
  workspaceId
}: {
  workspaceId: string;
  jobId: string;
  triggerTaskId: string;
  triggerRunId: string;
  allowMemoryFallback?: boolean;
  now?: Date;
}) {
  if (allowMemoryFallback || !isDatabaseConfigured) {
    const job = await getMediaGenerationJobForWorkspace({ allowMemoryFallback, jobId, workspaceId });

    if (!job) {
      throw new MediaGenerationJobNotFoundError();
    }

    return setMemoryJob({
      ...job,
      triggerRunId,
      triggerTaskId,
      audit: {
        ...job.audit,
        enqueuedAt: nowIso(now)
      },
      updatedAt: nowIso(now)
    });
  }

  const [row] = await getDb()
    .update(mediaGenerationJobs)
    .set({
      triggerRunId,
      triggerTaskId,
      audit: sql`${mediaGenerationJobs.audit} || ${JSON.stringify({ enqueuedAt: nowIso(now) })}::jsonb`,
      updatedAt: now
    })
    .where(and(eq(mediaGenerationJobs.workspaceId, workspaceId), eq(mediaGenerationJobs.id, jobId)))
    .returning();

  if (!row) {
    throw new MediaGenerationJobNotFoundError();
  }

  return mediaGenerationJobRowToRecord(row);
}

export async function setMediaGenerationJobStatus({
  allowMemoryFallback = false,
  error,
  jobId,
  now = new Date(),
  output,
  progress,
  status,
  workspaceId
}: {
  workspaceId: string;
  jobId: string;
  status: MediaGenerationJobStatus;
  progress?: number;
  output?: Record<string, unknown>;
  error?: string | null;
  allowMemoryFallback?: boolean;
  now?: Date;
}) {
  const nextProgress =
    progress ?? (status === "succeeded" ? 100 : status === "queued" || status === "canceled" ? 0 : undefined);
  const shouldResetLifecycle = status === "queued";

  if (allowMemoryFallback || !isDatabaseConfigured) {
    const job = await getMediaGenerationJobForWorkspace({ allowMemoryFallback, jobId, workspaceId });

    if (!job) {
      throw new MediaGenerationJobNotFoundError();
    }

    return setMemoryJob({
      ...job,
      status,
      progress: nextProgress ?? job.progress,
      output: output ?? job.output,
      error: error === null ? undefined : error ?? job.error,
      startedAt: shouldResetLifecycle ? undefined : status === "running" ? nowIso(now) : job.startedAt,
      completedAt:
        shouldResetLifecycle ? undefined : status === "succeeded" || status === "failed" ? nowIso(now) : job.completedAt,
      canceledAt: shouldResetLifecycle ? undefined : status === "canceled" ? nowIso(now) : job.canceledAt,
      updatedAt: nowIso(now)
    });
  }

  const [row] = await getDb()
    .update(mediaGenerationJobs)
    .set({
      status,
      progress: nextProgress,
      output,
      error,
      startedAt: shouldResetLifecycle ? null : status === "running" ? now : undefined,
      completedAt: shouldResetLifecycle ? null : status === "succeeded" || status === "failed" ? now : undefined,
      canceledAt: shouldResetLifecycle ? null : status === "canceled" ? now : undefined,
      updatedAt: now
    })
    .where(and(eq(mediaGenerationJobs.workspaceId, workspaceId), eq(mediaGenerationJobs.id, jobId)))
    .returning();

  if (!row) {
    throw new MediaGenerationJobNotFoundError();
  }

  return mediaGenerationJobRowToRecord(row);
}

export async function cancelMediaGenerationJob({
  allowMemoryFallback = false,
  jobId,
  workspaceId
}: {
  workspaceId: string;
  jobId: string;
  allowMemoryFallback?: boolean;
}) {
  const job = await getMediaGenerationJobForWorkspace({ allowMemoryFallback, jobId, workspaceId });

  if (!job) {
    throw new MediaGenerationJobNotFoundError();
  }

  if (job.status === "succeeded" || job.status === "failed") {
    throw new MediaGenerationJobStateError("Completed media generation jobs cannot be canceled.");
  }

  return setMediaGenerationJobStatus({
    allowMemoryFallback,
    jobId,
    status: "canceled",
    workspaceId
  });
}

export async function retryMediaGenerationJob({
  allowMemoryFallback = false,
  jobId,
  workspaceId
}: {
  workspaceId: string;
  jobId: string;
  allowMemoryFallback?: boolean;
}) {
  const job = await getMediaGenerationJobForWorkspace({ allowMemoryFallback, jobId, workspaceId });

  if (!job) {
    throw new MediaGenerationJobNotFoundError();
  }

  if (job.status !== "failed" && job.status !== "canceled") {
    throw new MediaGenerationJobStateError("Only failed or canceled media generation jobs can be retried.");
  }

  return setMediaGenerationJobStatus({
    allowMemoryFallback,
    error: null,
    jobId,
    status: "queued",
    workspaceId
  });
}

export function clearMediaGenerationJobsForTests() {
  memoryJobsByWorkspace.clear();
}
