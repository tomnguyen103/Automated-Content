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
});
