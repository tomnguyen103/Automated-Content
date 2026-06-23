import "server-only";

import {
  ensureUsageAllowed,
  withUsageLimitLock
} from "@/lib/billing/usage";
import {
  getProviderConnectionStates,
  type ProviderConnectionState
} from "@/lib/providers/connections";
import type { ProviderKey } from "@/lib/providers/types";

export async function withProviderConnectionCapacity<T>({
  isLocalPreview,
  provider,
  workspaceId
}: {
  provider: ProviderKey;
  workspaceId: string;
  isLocalPreview: boolean;
}, callback: (states: ProviderConnectionState[] | null) => Promise<T>) {
  if (isLocalPreview) {
    return callback(null);
  }

  return withUsageLimitLock(
    {
      workspaceId,
      key: "providerConnections"
    },
    async () => {
      const states = await getProviderConnectionStates({
        workspaceId,
        isLocalPreview
      });
      const state = states.find((candidate) => candidate.key === provider);

      if (!state?.account || state.account.status === "disconnected") {
        await ensureUsageAllowed({
          workspaceId,
          key: "providerConnections"
        });
      }

      return callback(states);
    }
  );
}
