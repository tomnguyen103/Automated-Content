import { describe, expect, it, vi } from "vitest";
import type { ScheduledJob } from "@/db/schema";
import {
  createMemorySchedulerRepository,
  createScheduledPost,
  type CreateScheduledPostInput,
  type SchedulerRepository
} from "@/lib/scheduler/create-scheduled-post";

const scheduledFor = new Date("2026-06-21T15:00:00.000Z");
const baseInput: CreateScheduledPostInput = {
  workspaceId: "00000000-0000-0000-0000-000000000001",
  platformVariantId: "variant_1",
  provider: "mock",
  connectedAccountId: "10000000-0000-0000-0000-000000000001",
  scheduledFor,
  metadata: {
    source: "test"
  }
};

function createJob(overrides: Partial<ScheduledJob> = {}): ScheduledJob {
  const now = new Date("2026-06-20T12:00:00.000Z");

  return {
    id: "20000000-0000-0000-0000-000000000001",
    workspaceId: baseInput.workspaceId,
    platformVariantId: baseInput.platformVariantId,
    connectedAccountId: baseInput.connectedAccountId ?? null,
    provider: baseInput.provider,
    sourceId: baseInput.sourceId ?? null,
    scheduledFor,
    status: "scheduled",
    enqueueStatus: "pending",
    queueJobId: null,
    enqueueError: null,
    attemptCount: 0,
    lockedAt: null,
    publishedAt: null,
    failedAt: null,
    metadata: baseInput.metadata ?? {},
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function createFakeRepository(events: string[]): SchedulerRepository {
  const insertedJob = createJob();

  return {
    createScheduledJob: vi.fn(async () => {
      events.push("insert");
      return {
        created: true,
        scheduledJob: insertedJob
      };
    }),
    markEnqueueQueued: vi.fn(async ({ queueJobId }) => {
      events.push("mark-queued");
      return createJob({
        status: "queued",
        enqueueStatus: "queued",
        queueJobId
      });
    }),
    markEnqueueFailed: vi.fn(async ({ errorMessage }) => {
      events.push("mark-failed");
      return createJob({
        enqueueStatus: "failed",
        enqueueError: errorMessage
      });
    })
  };
}

describe("createScheduledPost", () => {
  it("commits the scheduled job before enqueueing", async () => {
    const events: string[] = [];
    const repository = createFakeRepository(events);

    const result = await createScheduledPost({
      input: baseInput,
      repository,
      enqueue: vi.fn(async ({ scheduledJob }) => {
        events.push(`enqueue:${scheduledJob.id}`);
        return {
          queueJobId: "bullmq_job_1",
          delayMs: 10_000
        };
      })
    });

    expect(events).toEqual(["insert", "enqueue:20000000-0000-0000-0000-000000000001", "mark-queued"]);
    expect(result.enqueue).toEqual({
      status: "queued",
      queueJobId: "bullmq_job_1",
      delayMs: 10_000
    });
    expect(result.scheduledJob.enqueueStatus).toBe("queued");
  });

  it("keeps the row visible when enqueue fails", async () => {
    const events: string[] = [];
    const repository = createFakeRepository(events);

    const result = await createScheduledPost({
      input: baseInput,
      repository,
      enqueue: vi.fn(async ({ scheduledJob }) => {
        events.push(`enqueue:${scheduledJob.id}`);
        throw new Error("Redis connection refused");
      })
    });

    expect(events).toEqual(["insert", "enqueue:20000000-0000-0000-0000-000000000001", "mark-failed"]);
    expect(result.enqueue).toEqual({
      status: "failed",
      error: "Redis connection refused",
      recovery: expect.objectContaining({
        category: "queue_enqueue",
        actions: ["retry", "reschedule"]
      })
    });
    expect(result.scheduledJob.status).toBe("scheduled");
    expect(result.scheduledJob.enqueueStatus).toBe("failed");
    expect(result.scheduledJob.enqueueError).toBe("Redis connection refused");
  });

  it("returns an existing queued schedule without enqueueing a duplicate source", async () => {
    const repository = createMemorySchedulerRepository();
    const enqueue = vi.fn(async ({ scheduledJob }: { scheduledJob: ScheduledJob }) => ({
      queueJobId: scheduledJob.id,
      delayMs: 10_000
    }));
    const input = {
      ...baseInput,
      sourceId: "schedule:workspace:variant_1:mock:default:2026-06-21T15:00:00.000Z"
    };

    const first = await createScheduledPost({
      input,
      repository,
      enqueue
    });
    const second = await createScheduledPost({
      input,
      repository,
      enqueue
    });

    expect(repository.list()).toHaveLength(1);
    expect(first.scheduledJob.id).toBe(second.scheduledJob.id);
    expect(second.enqueue).toMatchObject({
      status: "queued",
      queueJobId: first.scheduledJob.id
    });
    expect(enqueue).toHaveBeenCalledOnce();
  });
});
