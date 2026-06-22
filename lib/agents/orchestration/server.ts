import "server-only";

import { getCurrentUser, type CurrentAppUser } from "@/lib/auth/current-user";
import {
  createAgentOrchestrationRepositories,
  type AgentOrchestrationRepositories
} from "@/lib/agents/orchestration/repository";
import { resolvePersonalWorkspaceForUser, type WorkspaceAccess } from "@/lib/workspaces/personal-workspace";

export type AgentOrchestrationServerContext = {
  user: CurrentAppUser;
  workspace: WorkspaceAccess;
  repositories: AgentOrchestrationRepositories;
};

export async function resolveAgentOrchestrationContext(): Promise<AgentOrchestrationServerContext | null> {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const workspace = await resolvePersonalWorkspaceForUser(user);

  return {
    user,
    workspace,
    repositories: createAgentOrchestrationRepositories({
      allowMemoryFallback: workspace.isLocalPreview
    })
  };
}
