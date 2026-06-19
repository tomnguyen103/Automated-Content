import "server-only";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { memberships, subscriptions, users, workspaces } from "@/db/schema";
import type { CurrentAppUser } from "@/lib/auth/current-user";

export const localPreviewWorkspaceId = "00000000-0000-0000-0000-000000000001";

export type WorkspaceAccess = {
  id: string;
  role: "owner" | "admin" | "member";
  isLocalPreview: boolean;
};

function createWorkspaceSlug(userId: string) {
  const safeId = userId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return `personal-${safeId || "workspace"}`;
}

export async function ensurePersonalWorkspace({
  userId,
  name,
  email,
  imageUrl
}: {
  userId: string;
  name: string;
  email: string | null;
  imageUrl: string | null;
}) {
  const db = getDb();
  const now = new Date();

  await db
    .insert(users)
    .values({
      id: userId,
      email,
      name,
      imageUrl,
      updatedAt: now,
      deletedAt: null
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        email,
        name,
        imageUrl,
        updatedAt: now,
        deletedAt: null
      }
    });

  const [workspace] = await db
    .insert(workspaces)
    .values({
      name: `${name}'s Workspace`,
      slug: createWorkspaceSlug(userId),
      ownerUserId: userId,
      personalForUserId: userId,
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: workspaces.personalForUserId,
      set: {
        name: `${name}'s Workspace`,
        updatedAt: now
      }
    })
    .returning({ id: workspaces.id });

  await db
    .insert(memberships)
    .values({
      workspaceId: workspace.id,
      userId,
      role: "owner",
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: [memberships.workspaceId, memberships.userId],
      set: {
        role: "owner",
        updatedAt: now
      }
    });

  await db
    .insert(subscriptions)
    .values({
      workspaceId: workspace.id,
      plan: "free",
      planName: "Free",
      planSlug: "free",
      status: "active",
      updatedAt: now
    })
    .onConflictDoNothing({
      target: subscriptions.workspaceId
    });

  return workspace.id;
}

export async function requireWorkspaceMembership({
  workspaceId,
  userId
}: {
  workspaceId: string;
  userId: string;
}): Promise<WorkspaceAccess | null> {
  const [membership] = await getDb()
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)))
    .limit(1);

  if (!membership) {
    return null;
  }

  return {
    id: workspaceId,
    role: membership.role,
    isLocalPreview: false
  };
}

export async function resolvePersonalWorkspaceForUser(user: CurrentAppUser): Promise<WorkspaceAccess> {
  if (user.isLocalPreview) {
    return {
      id: localPreviewWorkspaceId,
      role: "owner",
      isLocalPreview: true
    };
  }

  const workspaceId = await ensurePersonalWorkspace({
    userId: user.id,
    name: user.name,
    email: user.email,
    imageUrl: user.imageUrl
  });
  const membership = await requireWorkspaceMembership({
    workspaceId,
    userId: user.id
  });

  if (!membership) {
    throw new Error("Resolved workspace membership was not found.");
  }

  return membership;
}
