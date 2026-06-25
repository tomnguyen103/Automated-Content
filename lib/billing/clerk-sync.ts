import "server-only";

import type {
  BillingSubscriptionItemWebhookEvent,
  BillingSubscriptionWebhookEvent,
  UserWebhookEvent,
  WebhookEvent
} from "@clerk/nextjs/webhooks";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { subscriptions, users } from "@/db/schema";
import type { BillingPlan } from "@/lib/billing/entitlements";
import {
  isBillingStatusEntitled,
  normalizeBillingSubscriptionStatus,
  type BillingSubscriptionStatus
} from "@/lib/billing/subscription-state";
import { ensurePersonalWorkspace } from "@/lib/workspaces/personal-workspace";

type ClerkUserData = Extract<UserWebhookEvent, { type: "user.created" | "user.updated" }>["data"];
type BillingSubscriptionData = BillingSubscriptionWebhookEvent["data"];
type BillingSubscriptionItemData = BillingSubscriptionItemWebhookEvent["data"];
type BillingItem = BillingSubscriptionData["items"][number] | BillingSubscriptionItemData;

function toDate(value: number | null | undefined) {
  if (!value) {
    return null;
  }

  return new Date(value < 10_000_000_000 ? value * 1000 : value);
}

function getPrimaryEmail(user: ClerkUserData) {
  return (
    user.email_addresses.find((email) => email.id === user.primary_email_address_id)?.email_address ??
    user.email_addresses[0]?.email_address ??
    null
  );
}

function getUserName(
  user: Pick<ClerkUserData, "first_name" | "last_name" | "username">,
  email: string | null
) {
  return [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || email || "Workspace owner";
}

function inferPlan(
  item: BillingItem | null | undefined,
  status: BillingSubscriptionStatus
): BillingPlan {
  if (!isBillingStatusEntitled(status) || !isBillingStatusEntitled(item?.status)) {
    return "free";
  }

  const plan = item?.plan;
  const planName = `${plan?.slug ?? ""} ${plan?.name ?? ""}`.toLowerCase();

  if (planName.includes("premium")) {
    return "premium";
  }

  if (plan && !plan.is_default && Number(plan.amount ?? 0) > 0) {
    return "premium";
  }

  return "free";
}

function pickBillingItem(items: BillingSubscriptionData["items"]) {
  return (
    items.find((item) => item.status === "active" && item.plan?.is_default === false) ??
    items.find((item) => item.status === "active") ??
    items[0] ??
    null
  );
}

export async function syncClerkUser(user: ClerkUserData) {
  const email = getPrimaryEmail(user);
  const name = getUserName(user, email);

  await ensurePersonalWorkspace({
    userId: user.id,
    name,
    email,
    imageUrl: user.image_url ?? null
  });

  return { action: "user.synced", userId: user.id };
}

export async function markClerkUserDeleted(userId: string | undefined) {
  if (!userId) {
    return { action: "user.delete_skipped" };
  }

  await getDb().update(users).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, userId));

  return { action: "user.deleted", userId };
}

export async function syncClerkSubscription(subscription: BillingSubscriptionData) {
  const userId = subscription.payer.user_id;

  if (!userId) {
    return { action: "subscription.skipped", reason: "No user payer on billing subscription" };
  }

  const name = getUserName(
    {
      first_name: subscription.payer.first_name ?? null,
      last_name: subscription.payer.last_name ?? null,
      username: null
    },
    subscription.payer.email
  );
  const workspaceId = await ensurePersonalWorkspace({
    userId,
    name,
    email: subscription.payer.email,
    imageUrl: subscription.payer.image_url ?? null
  });
  const item = pickBillingItem(subscription.items);
  const status = normalizeBillingSubscriptionStatus(subscription.status);
  const plan = inferPlan(item, status);
  const now = new Date();

  await getDb()
    .insert(subscriptions)
    .values({
      workspaceId,
      clerkSubscriptionId: subscription.id,
      clerkSubscriptionItemId: item?.id,
      clerkPayerId: subscription.payer_id,
      plan,
      planName: item?.plan?.name ?? (plan === "premium" ? "Premium" : "Free"),
      planSlug: item?.plan?.slug ?? plan,
      status,
      currentPeriodStart: toDate(item?.period_start),
      currentPeriodEnd: toDate(item?.period_end),
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: subscriptions.workspaceId,
      set: {
        clerkSubscriptionId: subscription.id,
        clerkSubscriptionItemId: item?.id,
        clerkPayerId: subscription.payer_id,
        plan,
        planName: item?.plan?.name ?? (plan === "premium" ? "Premium" : "Free"),
        planSlug: item?.plan?.slug ?? plan,
        status,
        currentPeriodStart: toDate(item?.period_start),
        currentPeriodEnd: toDate(item?.period_end),
        updatedAt: now
      }
    });

  return { action: "subscription.synced", workspaceId, plan };
}

export async function syncClerkSubscriptionItem(item: BillingSubscriptionItemData) {
  const payer = item.payer;
  const userId = payer?.user_id;

  if (!userId) {
    return { action: "subscription_item.skipped", reason: "No user payer on billing item" };
  }

  const name = getUserName(
    {
      first_name: payer.first_name ?? null,
      last_name: payer.last_name ?? null,
      username: null
    },
    payer.email
  );
  const workspaceId = await ensurePersonalWorkspace({
    userId,
    name,
    email: payer.email,
    imageUrl: payer.image_url ?? null
  });
  const status = normalizeBillingSubscriptionStatus(item.status);
  const plan = inferPlan(item, status);
  const clerkPayerId = payer.user_id ?? payer.organization_id ?? null;
  const now = new Date();

  await getDb()
    .insert(subscriptions)
    .values({
      workspaceId,
      clerkSubscriptionItemId: item.id,
      clerkPayerId,
      plan,
      planName: item.plan?.name ?? (plan === "premium" ? "Premium" : "Free"),
      planSlug: item.plan?.slug ?? plan,
      status,
      currentPeriodStart: toDate(item.period_start),
      currentPeriodEnd: toDate(item.period_end),
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: subscriptions.workspaceId,
      set: {
        clerkSubscriptionItemId: item.id,
        clerkPayerId,
        plan,
        planName: item.plan?.name ?? (plan === "premium" ? "Premium" : "Free"),
        planSlug: item.plan?.slug ?? plan,
        status,
        currentPeriodStart: toDate(item.period_start),
        currentPeriodEnd: toDate(item.period_end),
        updatedAt: now
      }
    });

  return { action: "subscription_item.synced", workspaceId, plan };
}

export async function handleClerkWebhookEvent(event: WebhookEvent) {
  switch (event.type) {
    case "user.created":
    case "user.updated":
      return syncClerkUser(event.data);
    case "user.deleted":
      return markClerkUserDeleted(event.data.id);
    case "subscription.created":
    case "subscription.updated":
    case "subscription.active":
    case "subscription.pastDue":
      return syncClerkSubscription(event.data);
    case "subscriptionItem.created":
    case "subscriptionItem.updated":
    case "subscriptionItem.active":
    case "subscriptionItem.canceled":
    case "subscriptionItem.upcoming":
    case "subscriptionItem.ended":
    case "subscriptionItem.abandoned":
    case "subscriptionItem.incomplete":
    case "subscriptionItem.pastDue":
    case "subscriptionItem.freeTrialEnding":
      return syncClerkSubscriptionItem(event.data);
    default:
      return { action: "ignored", type: event.type };
  }
}
