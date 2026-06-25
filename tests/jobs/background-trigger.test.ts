import { describe, expect, it, vi } from "vitest";
import type { ScheduledJob } from "@/db/schema";
import { enqueueAgentMission } from "@/lib/agents/orchestration/queue";
import { enqueueScheduledPost } from "@/lib/scheduler/enqueue";

function createScheduledJob(overrides: Partial<ScheduledJob> = {}): ScheduledJob {
  const now = new Date("2026-06-25T12:00:00.000Z");

  return {
    id: "scheduled_job_1",
    workspaceId: "workspace_background_1",
    platformVariantId: "variant_1",
    connectedAccountId: null,
    provider: "mock",
    sourceId: null,
    scheduledFor: new Date("2026-06-25T12:10:00.000Z"),
    status: "scheduled",
    enqueueStatus: "pending",
    queueJobId: null,
    enqueueError: null,
    attemptCount: 0,
    lockedAt: null,
    publishedAt: null,
    failedAt: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

describe("Trigger-backed background jobs", () => {
  it("dispatches scheduled publishing through Trigger with delay and idempotency", async () => {
    const trigger = vi.fn(async () => ({
      id: "run_publish_1"
    }));
    const scheduledJob = createScheduledJob();

    const result = await enqueueScheduledPost({
      client: { trigger },
      envMap: {
        TRIGGER_SECRET_KEY: "tr_prod_123"
      },
      now: new Date("2026-06-25T12:00:00.000Z"),
      scheduledJob
    });

    expect(result).toEqual({
      backend: "trigger.dev",
      delayMs: 600_000,
      queueJobId: "run_publish_1"
    });
    expect(trigger).toHaveBeenCalledWith(
      "social.publish-scheduled-post",
      {
        provider: "mock",
        scheduledJobId: "scheduled_job_1",
        workspaceId: "workspace_background_1"
      },
      expect.objectContaining({
        concurrencyKey: "workspace_background_1",
        delay: new Date("2026-06-25T12:10:00.000Z"),
        idempotencyKey: "scheduled_job_1",
        maxAttempts: 3,
        queue: "social-publishing",
        tags: ["workspace:workspace_background_1", "job:social-publish"]
      })
    );
  });

  it("dispatches agent missions through Trigger without requiring Redis", async () => {
    const trigger = vi.fn(async () => ({
      id: "run_mission_1"
    }));

    const result = await enqueueAgentMission({
      client: { trigger },
      envMap: {
        TRIGGER_SECRET_KEY: "tr_prod_123"
      },
      missionId: "mission_1",
      workspaceId: "workspace_background_1"
    });

    expect(result).toEqual({
      backend: "trigger.dev",
      queueJobId: "run_mission_1",
      status: "queued"
    });
    expect(trigger).toHaveBeenCalledWith(
      "agents.run-mission",
      {
        missionId: "mission_1",
        workspaceId: "workspace_background_1"
      },
      expect.objectContaining({
        concurrencyKey: "workspace_background_1",
        idempotencyKey: "mission_1",
        maxAttempts: 2,
        queue: "agent-missions",
        tags: ["workspace:workspace_background_1", "job:agent-mission"]
      })
    );
  });
});
