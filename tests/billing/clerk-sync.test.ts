import { beforeEach, describe, expect, it, vi } from "vitest";

type HandleClerkWebhookEvent = typeof import("@/lib/billing/clerk-sync")["handleClerkWebhookEvent"];

const mocks = vi.hoisted(() => ({
  ensurePersonalWorkspace: vi.fn(),
  insert: vi.fn(),
  onConflictDoUpdate: vi.fn(),
  values: vi.fn()
}));

vi.mock("@/db", () => ({
  getDb: vi.fn(() => ({
    insert: mocks.insert
  }))
}));

vi.mock("@/lib/workspaces/personal-workspace", () => ({
  ensurePersonalWorkspace: mocks.ensurePersonalWorkspace
}));

describe("Clerk billing sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensurePersonalWorkspace.mockResolvedValue("workspace_billing_1");
    mocks.insert.mockReturnValue({
      values: mocks.values
    });
    mocks.values.mockReturnValue({
      onConflictDoUpdate: mocks.onConflictDoUpdate
    });
    mocks.onConflictDoUpdate.mockResolvedValue(undefined);
  });

  it("syncs an active paid subscription as premium", async () => {
    const { handleClerkWebhookEvent } = await import("@/lib/billing/clerk-sync");
    const event = {
      type: "subscription.updated",
      data: {
        id: "sub_123",
        payer_id: "payer_123",
        status: "active",
        payer: {
          user_id: "user_123",
          first_name: "Ada",
          last_name: "Lovelace",
          email: "ada@example.com",
          image_url: null
        },
        items: [
          {
            id: "item_123",
            status: "active",
            period_start: 1_800_000_000,
            period_end: 1_802_592_000,
            plan: {
              name: "Premium",
              slug: "premium",
              amount: 2900,
              is_default: false
            }
          }
        ]
      }
    } as unknown as Parameters<HandleClerkWebhookEvent>[0];

    await expect(handleClerkWebhookEvent(event)).resolves.toEqual({
      action: "subscription.synced",
      workspaceId: "workspace_billing_1",
      plan: "premium"
    });
    expect(mocks.ensurePersonalWorkspace).toHaveBeenCalledWith({
      userId: "user_123",
      name: "Ada Lovelace",
      email: "ada@example.com",
      imageUrl: null
    });
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace_billing_1",
        clerkSubscriptionId: "sub_123",
        clerkSubscriptionItemId: "item_123",
        clerkPayerId: "payer_123",
        plan: "premium",
        planName: "Premium",
        planSlug: "premium",
        status: "active"
      })
    );
    expect(mocks.onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({
          plan: "premium",
          status: "active"
        })
      })
    );
  });

  it("downgrades inactive paid subscription items to free entitlements", async () => {
    const { handleClerkWebhookEvent } = await import("@/lib/billing/clerk-sync");
    const event = {
      type: "subscriptionItem.canceled",
      data: {
        id: "item_123",
        status: "canceled",
        period_start: 1_800_000_000,
        period_end: 1_802_592_000,
        payer: {
          user_id: "user_123",
          organization_id: null,
          first_name: "Ada",
          last_name: "Lovelace",
          email: "ada@example.com",
          image_url: null
        },
        plan: {
          name: "Premium",
          slug: "premium",
          amount: 2900,
          is_default: false
        }
      }
    } as unknown as Parameters<HandleClerkWebhookEvent>[0];

    await expect(handleClerkWebhookEvent(event)).resolves.toEqual({
      action: "subscription_item.synced",
      workspaceId: "workspace_billing_1",
      plan: "free"
    });
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace_billing_1",
        clerkSubscriptionItemId: "item_123",
        clerkPayerId: "user_123",
        plan: "free",
        planName: "Premium",
        planSlug: "premium",
        status: "canceled"
      })
    );
    expect(mocks.onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({
          plan: "free",
          status: "canceled"
        })
      })
    );
  });
});
