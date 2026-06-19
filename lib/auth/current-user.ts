import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import { isClerkConfigured } from "@/lib/env";

export type CurrentAppUser = {
  id: string;
  email: string | null;
  name: string;
  imageUrl: string | null;
  initials: string;
  isLocalPreview: boolean;
};

const localPreviewUser: CurrentAppUser = {
  id: "local-preview-user",
  email: "local-preview@example.com",
  name: "Local Preview",
  imageUrl: null,
  initials: "LP",
  isLocalPreview: true
};

function getInitials(name: string, email: string | null) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return email?.slice(0, 2).toUpperCase() ?? "US";
}

export async function getCurrentUser(): Promise<CurrentAppUser | null> {
  if (!isClerkConfigured) {
    return localPreviewUser;
  }

  const authState = await auth();

  if (!authState.userId) {
    return null;
  }

  const user = await currentUser();
  const primaryEmail =
    user?.emailAddresses.find((email) => email.id === user.primaryEmailAddressId)?.emailAddress ??
    user?.emailAddresses[0]?.emailAddress ??
    null;
  const name =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.username ||
    primaryEmail ||
    "Workspace user";

  return {
    id: authState.userId,
    email: primaryEmail,
    name,
    imageUrl: user?.imageUrl ?? null,
    initials: getInitials(name, primaryEmail),
    isLocalPreview: false
  };
}
