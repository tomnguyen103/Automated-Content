import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadScheduleRoute() {
  const [{ POST }, { clearScheduledPostsForTests, listScheduledPostsForTests }] = await Promise.all([
    import("@/app/api/posts/[id]/schedule/route"),
    import("@/lib/scheduler/create-scheduled-post")
  ]);

  return { POST, clearScheduledPostsForTests, listScheduledPostsForTests };
}

function futureIsoDate() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}

describe("schedule post API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("AUTH_LOCAL_PREVIEW", "1");
    vi.stubEnv("PLAYWRIGHT_AUTH_LOCAL_PREVIEW", "1");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    vi.stubEnv("CLERK_SECRET_KEY", "");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("REDIS_URL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("@/db");
    vi.doUnmock("@/lib/auth/current-user");
    vi.doUnmock("@/lib/billing/usage");
    vi.doUnmock("@/lib/env");
    vi.doUnmock("@/lib/scheduler/create-scheduled-post");
    vi.doUnmock("@/lib/workspaces/personal-workspace");
    vi.resetModules();
  });

  it("returns a recoverable scheduled row when enqueue fails in local preview", async () => {
    const { POST, clearScheduledPostsForTests, listScheduledPostsForTests } = await loadScheduleRoute();
    clearScheduledPostsForTests();

    const response = await POST(
      new NextRequest("http://localhost:3000/api/posts/variant_1/schedule", {
        method: "POST",
        body: JSON.stringify({
          provider: "mock",
          scheduledFor: futureIsoDate(),
          metadata: {
            source: "api-test"
          }
        })
      }),
      {
        params: Promise.resolve({ id: "variant_1" })
      }
    );
    const payload = await response.json();
    const storedJobs = listScheduledPostsForTests();

    expect(response.status).toBe(202);
    expect(payload.enqueue.status).toBe("failed");
    expect(payload.scheduledJob.platformVariantId).toBe("variant_1");
    expect(payload.scheduledJob.enqueueStatus).toBe("failed");
    expect(storedJobs).toHaveLength(1);
    expect(storedJobs[0].enqueueStatus).toBe("failed");
  });

  it("returns a 400 when the scheduled time is in the past", async () => {
    const { POST } = await loadScheduleRoute();
    const response = await POST(
      new NextRequest("http://localhost:3000/api/posts/variant_1/schedule", {
        method: "POST",
        body: JSON.stringify({
          provider: "mock",
          scheduledFor: new Date(Date.now() - 60_000).toISOString()
        })
      }),
      {
        params: Promise.resolve({ id: "variant_1" })
      }
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Scheduled time must be in the future.");
  });

  it("returns a 400 for malformed schedule payloads", async () => {
    const { POST } = await loadScheduleRoute();
    const response = await POST(
      new NextRequest("http://localhost:3000/api/posts/variant_1/schedule", {
        method: "POST",
        body: JSON.stringify({
          provider: "unknown",
          scheduledFor: "not-a-date"
        })
      }),
      {
        params: Promise.resolve({ id: "variant_1" })
      }
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Invalid schedule request.");
  });

  it("returns a 404 when the connected account is not available in the workspace", async () => {
    vi.resetModules();

    const limit = vi.fn().mockResolvedValueOnce([{ id: "variant_1" }]).mockResolvedValueOnce([]);
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit
          }))
        }))
      }))
    };
    const createScheduledPost = vi.fn();

    vi.doMock("@/db", () => ({
      getDb: () => db
    }));
    vi.doMock("@/lib/auth/current-user", () => ({
      getCurrentUser: vi.fn(async () => ({
        id: "user_1",
        email: "user@example.com",
        name: "User One",
        imageUrl: null,
        initials: "UO",
        isLocalPreview: false
      }))
    }));
    vi.doMock("@/lib/env", () => ({
      isDatabaseConfigured: true
    }));
    vi.doMock("@/lib/scheduler/create-scheduled-post", () => ({
      createScheduledPost,
      createSchedulerRepository: vi.fn()
    }));
    vi.doMock("@/lib/workspaces/personal-workspace", () => ({
      resolvePersonalWorkspaceForUser: vi.fn(async () => ({
        id: "00000000-0000-0000-0000-000000000001",
        role: "owner",
        isLocalPreview: false
      }))
    }));

    const { POST } = await import("@/app/api/posts/[id]/schedule/route");
    const response = await POST(
      new NextRequest("http://localhost:3000/api/posts/variant_1/schedule", {
        method: "POST",
        body: JSON.stringify({
          provider: "mock",
          connectedAccountId: "22222222-2222-4222-8222-222222222222",
          scheduledFor: futureIsoDate()
        })
      }),
      {
        params: Promise.resolve({ id: "variant_1" })
      }
    );
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toBe("Connected account not found.");
    expect(createScheduledPost).not.toHaveBeenCalled();
  });

  it("enforces and records scheduled post usage for workspace-backed users", async () => {
    vi.resetModules();
    vi.stubEnv("AUTH_LOCAL_PREVIEW", "");
    vi.stubEnv("PLAYWRIGHT_AUTH_LOCAL_PREVIEW", "");

    const ensureUsageAllowed = vi.fn(async () => null);
    const recordUsageForLimit = vi.fn(async () => undefined);
    const createScheduledPost = vi.fn(async () => ({
      scheduledJob: {
        id: "scheduled_usage_1",
        workspaceId: "workspace_usage_1",
        platformVariantId: "variant_1",
        provider: "mock",
        enqueueStatus: "queued"
      },
      enqueue: { status: "queued" }
    }));

    vi.doMock("@/lib/auth/current-user", () => ({
      getCurrentUser: vi.fn(async () => ({
        id: "user_usage_1",
        email: "user@example.com",
        name: "User Usage",
        imageUrl: null,
        initials: "UU",
        isLocalPreview: false
      }))
    }));
    vi.doMock("@/lib/workspaces/personal-workspace", () => ({
      resolvePersonalWorkspaceForUser: vi.fn(async () => ({
        id: "workspace_usage_1",
        role: "owner",
        isLocalPreview: false
      }))
    }));
    vi.doMock("@/lib/env", () => ({
      isDatabaseConfigured: false
    }));
    vi.doMock("@/lib/billing/usage", () => ({
      UsageLimitExceededError: class UsageLimitExceededError extends Error {},
      ensureUsageAllowed,
      recordUsageForLimit
    }));
    vi.doMock("@/lib/scheduler/create-scheduled-post", () => ({
      createScheduledPost,
      createSchedulerRepository: vi.fn(() => ({ mocked: true }))
    }));

    const { POST } = await import("@/app/api/posts/[id]/schedule/route");
    const response = await POST(
      new NextRequest("http://localhost:3000/api/posts/variant_1/schedule", {
        method: "POST",
        body: JSON.stringify({
          provider: "mock",
          scheduledFor: futureIsoDate()
        })
      }),
      {
        params: Promise.resolve({ id: "variant_1" })
      }
    );

    expect(response.status).toBe(201);
    expect(ensureUsageAllowed).toHaveBeenCalledWith({
      workspaceId: "workspace_usage_1",
      key: "scheduledPostsPerDay",
      skip: false
    });
    expect(recordUsageForLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace_usage_1",
        key: "scheduledPostsPerDay",
        sourceId: "scheduled_usage_1",
        skip: false
      })
    );
  });

  it("does not schedule when scheduled post usage is exhausted", async () => {
    vi.resetModules();
    vi.stubEnv("AUTH_LOCAL_PREVIEW", "");
    vi.stubEnv("PLAYWRIGHT_AUTH_LOCAL_PREVIEW", "");

    const metric = {
      key: "scheduledPostsPerDay",
      label: "Scheduled posts",
      used: 1,
      limit: 1,
      remaining: 0,
      allowed: false,
      cadence: "daily"
    };
    class UsageLimitExceededError extends Error {
      readonly metric = metric;

      constructor() {
        super("Scheduled posts limit reached for the current plan.");
      }
    }
    const ensureUsageAllowed = vi.fn(async () => {
      throw new UsageLimitExceededError();
    });
    const recordUsageForLimit = vi.fn();
    const createScheduledPost = vi.fn();

    vi.doMock("@/lib/auth/current-user", () => ({
      getCurrentUser: vi.fn(async () => ({
        id: "user_usage_1",
        email: "user@example.com",
        name: "User Usage",
        imageUrl: null,
        initials: "UU",
        isLocalPreview: false
      }))
    }));
    vi.doMock("@/lib/workspaces/personal-workspace", () => ({
      resolvePersonalWorkspaceForUser: vi.fn(async () => ({
        id: "workspace_usage_1",
        role: "owner",
        isLocalPreview: false
      }))
    }));
    vi.doMock("@/lib/env", () => ({
      isDatabaseConfigured: false
    }));
    vi.doMock("@/lib/billing/usage", () => ({
      UsageLimitExceededError,
      ensureUsageAllowed,
      recordUsageForLimit
    }));
    vi.doMock("@/lib/scheduler/create-scheduled-post", () => ({
      createScheduledPost,
      createSchedulerRepository: vi.fn()
    }));

    const { POST } = await import("@/app/api/posts/[id]/schedule/route");
    const response = await POST(
      new NextRequest("http://localhost:3000/api/posts/variant_1/schedule", {
        method: "POST",
        body: JSON.stringify({
          provider: "mock",
          scheduledFor: futureIsoDate()
        })
      }),
      {
        params: Promise.resolve({ id: "variant_1" })
      }
    );
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload.error).toBe("Scheduled posts limit reached for the current plan.");
    expect(payload.usage).toEqual(metric);
    expect(createScheduledPost).not.toHaveBeenCalled();
    expect(recordUsageForLimit).not.toHaveBeenCalled();
  });
});
