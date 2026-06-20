import { describe, expect, it, vi } from "vitest";
import type { ConnectedAccount, PlatformVariantRow, ScheduledJob } from "@/db/schema";
import { publishScheduledPostJob } from "@/workers/jobs/publish-post";

type PublishRepository = NonNullable<Parameters<typeof publishScheduledPostJob>[0]["repository"]>;

const workspaceId = "00000000-0000-0000-0000-000000000001";
const scheduledJobId = "10000000-0000-0000-0000-000000000001";
const connectedAccountId = "20000000-0000-0000-0000-000000000001";

function createScheduledJob(overrides: Partial<ScheduledJob> = {}): ScheduledJob {
  const now = new Date("2026-06-20T12:00:00.000Z");

  return {
    id: scheduledJobId,
    workspaceId,
    platformVariantId: "variant_1",
    connectedAccountId: null,
    provider: "mock",
    scheduledFor: new Date("2026-06-21T12:00:00.000Z"),
    status: "queued",
    enqueueStatus: "queued",
    queueJobId: "bullmq_job_1",
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

function createVariant(): PlatformVariantRow {
  const now = new Date("2026-06-20T12:00:00.000Z");

  return {
    id: "variant_1",
    workspaceId,
    draftId: "draft_1",
    platform: "linkedin",
    title: "Launch post",
    hook: "Hook",
    body: "Body",
    cta: "CTA",
    hashtags: [],
    media: [],
    mediaPrompt: null,
    characterCount: 10,
    policyStatus: "pass",
    policyWarnings: [],
    createdAt: now,
    updatedAt: now
  };
}

function createAccount(overrides: Partial<ConnectedAccount> = {}): ConnectedAccount {
  const now = new Date("2026-06-20T12:00:00.000Z");

  return {
    id: connectedAccountId,
    workspaceId,
    provider: "mock",
    providerAccountId: "mock_account",
    displayName: "Mock account",
    status: "connected",
    tokenRef: "vault_mock_token",
    scopes: [],
    capabilities: [],
    lastValidatedAt: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    disconnectedAt: null,
    ...overrides
  };
}

function createRepository({
  job,
  account = createAccount()
}: {
  job: ScheduledJob;
  account?: ConnectedAccount | null;
}) {
  const startAttempt = vi.fn();
  const repository: PublishRepository = {
    loadScheduledPost: vi.fn(async () => ({
      job,
      variant: createVariant(),
      account
    })),
    startAttempt,
    markSucceeded: vi.fn(),
    markFailed: vi.fn()
  };

  return { repository, startAttempt };
}

describe("publishScheduledPostJob", () => {
  it("does not publish terminal scheduled jobs", async () => {
    const { repository, startAttempt } = createRepository({
      job: createScheduledJob({
        status: "published",
        publishedAt: new Date("2026-06-20T13:00:00.000Z")
      })
    });

    await expect(
      publishScheduledPostJob({
        data: {
          scheduledJobId,
          workspaceId,
          provider: "mock"
        },
        repository
      })
    ).rejects.toThrow("not eligible for publishing");
    expect(startAttempt).not.toHaveBeenCalled();
  });

  it("does not publish when the connected account cannot be resolved in the workspace", async () => {
    const { repository, startAttempt } = createRepository({
      job: createScheduledJob({
        connectedAccountId
      }),
      account: null
    });

    await expect(
      publishScheduledPostJob({
        data: {
          scheduledJobId,
          workspaceId,
          provider: "mock"
        },
        repository
      })
    ).rejects.toThrow("was not found for this workspace");
    expect(startAttempt).not.toHaveBeenCalled();
  });

  it("does not publish when queued provider data diverges from the persisted job", async () => {
    const { repository, startAttempt } = createRepository({
      job: createScheduledJob({
        provider: "linkedin"
      })
    });

    await expect(
      publishScheduledPostJob({
        data: {
          scheduledJobId,
          workspaceId,
          provider: "mock"
        },
        repository
      })
    ).rejects.toThrow("provider mismatch");
    expect(startAttempt).not.toHaveBeenCalled();
  });

  it("does not publish through disconnected accounts", async () => {
    const { repository, startAttempt } = createRepository({
      job: createScheduledJob({
        connectedAccountId
      }),
      account: createAccount({
        status: "disconnected"
      })
    });

    await expect(
      publishScheduledPostJob({
        data: {
          scheduledJobId,
          workspaceId,
          provider: "mock"
        },
        repository
      })
    ).rejects.toThrow("is not ready for publishing");
    expect(startAttempt).not.toHaveBeenCalled();
  });
});
