import { task } from "@trigger.dev/sdk";

export const deploymentSmoke = task({
  id: "deployment.smoke",
  maxDuration: 60,
  run: async (payload: { requestedAt?: string; workspaceId?: string } = {}) => ({
    ok: true,
    requestedAt: payload.requestedAt ?? null,
    workspaceId: payload.workspaceId ?? null,
    completedAt: new Date().toISOString()
  })
});
