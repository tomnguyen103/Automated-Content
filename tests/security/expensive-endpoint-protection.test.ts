import { beforeEach, describe, expect, it } from "vitest";
import {
  assertExpensiveEndpointAllowed,
  clearExpensiveEndpointProtectionForTests,
  ExpensiveEndpointRateLimitError,
  getExpensiveEndpointBucketCountForTests
} from "@/lib/security/expensive-endpoint-protection";

describe("expensive endpoint protection", () => {
  beforeEach(() => {
    clearExpensiveEndpointProtectionForTests();
  });

  it("limits expensive endpoint requests per route, workspace, and user", () => {
    const now = new Date("2026-06-25T12:00:00.000Z");

    assertExpensiveEndpointAllowed({
      route: "media.jobs.create",
      userId: "user_1",
      workspaceId: "workspace_1",
      limit: 2,
      windowMs: 60_000,
      now
    });
    assertExpensiveEndpointAllowed({
      route: "media.jobs.create",
      userId: "user_1",
      workspaceId: "workspace_1",
      limit: 2,
      windowMs: 60_000,
      now
    });

    expect(() =>
      assertExpensiveEndpointAllowed({
        route: "media.jobs.create",
        userId: "user_1",
        workspaceId: "workspace_1",
        limit: 2,
        windowMs: 60_000,
        now
      })
    ).toThrow(ExpensiveEndpointRateLimitError);
  });

  it("skips local-preview requests and reopens after the window resets", () => {
    assertExpensiveEndpointAllowed({
      route: "media.source-upload-intents.create",
      userId: "user_1",
      workspaceId: "workspace_1",
      limit: 1,
      skip: true
    });
    assertExpensiveEndpointAllowed({
      route: "media.source-upload-intents.create",
      userId: "user_1",
      workspaceId: "workspace_1",
      limit: 1,
      now: new Date("2026-06-25T12:00:00.000Z")
    });
    assertExpensiveEndpointAllowed({
      route: "media.source-upload-intents.create",
      userId: "user_1",
      workspaceId: "workspace_1",
      limit: 1,
      windowMs: 60_000,
      now: new Date("2026-06-25T12:01:01.000Z")
    });
  });

  it("sweeps stale buckets that are not revisited", () => {
    const firstRequestAt = new Date("2026-06-25T12:00:00.000Z");
    const laterRequestAt = new Date("2026-06-25T12:02:00.000Z");

    assertExpensiveEndpointAllowed({
      route: "media.jobs.create",
      userId: "one-off-user",
      workspaceId: "workspace_1",
      limit: 1,
      windowMs: 60_000,
      now: firstRequestAt
    });
    assertExpensiveEndpointAllowed({
      route: "media.jobs.create",
      userId: "different-user",
      workspaceId: "workspace_1",
      limit: 1,
      windowMs: 60_000,
      now: laterRequestAt
    });

    expect(getExpensiveEndpointBucketCountForTests()).toBe(1);

    assertExpensiveEndpointAllowed({
      route: "media.jobs.create",
      userId: "one-off-user",
      workspaceId: "workspace_1",
      limit: 1,
      windowMs: 60_000,
      now: laterRequestAt
    });
  });
});
