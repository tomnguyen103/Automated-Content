import "server-only";

import { createAgentStorage } from "@/lib/agents/langchain/storage";
import { getCurrentUser, type CurrentAppUser } from "@/lib/auth/current-user";
import { getProviderAdapter } from "@/lib/providers/registry";
import type { ProviderAdapter } from "@/lib/providers/types";
import { createReplyRepository, type ReplyRepository } from "@/lib/replies/repository";
import { allowLocalPreviewAutoReplyUsage, enforceAutoReplyUsage, type AutoReplyUsageEnforcer } from "@/lib/replies/usage";
import { resolvePersonalWorkspaceForUser, type WorkspaceAccess } from "@/lib/workspaces/personal-workspace";

export type ReplyServerContext = {
  user: CurrentAppUser;
  workspace: WorkspaceAccess;
  repository: ReplyRepository;
  storage: ReturnType<typeof createAgentStorage>;
  usageEnforcer: AutoReplyUsageEnforcer;
  getProvider: (provider: Parameters<typeof getProviderAdapter>[0]) => ProviderAdapter;
};

function getPreviewSessionId(request: Request | undefined) {
  const value = request?.headers.get("x-reply-preview-session")?.trim();

  if (!value) {
    return null;
  }

  return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || null;
}

export async function resolveReplyServerContext(request?: Request): Promise<ReplyServerContext | null> {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const resolvedWorkspace = await resolvePersonalWorkspaceForUser(user);
  const previewSessionId = resolvedWorkspace.isLocalPreview ? getPreviewSessionId(request) : null;
  const workspace = previewSessionId
    ? {
        ...resolvedWorkspace,
        id: `${resolvedWorkspace.id}:${previewSessionId}`
      }
    : resolvedWorkspace;
  const repository = createReplyRepository({
    allowMemoryFallback: workspace.isLocalPreview
  });

  return {
    user,
    workspace,
    repository,
    storage: createAgentStorage({
      allowMemoryFallback: workspace.isLocalPreview
    }),
    usageEnforcer: workspace.isLocalPreview ? allowLocalPreviewAutoReplyUsage : enforceAutoReplyUsage,
    getProvider: getProviderAdapter
  };
}
