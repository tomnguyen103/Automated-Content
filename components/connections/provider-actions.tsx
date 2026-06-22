"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProviderConnectionActionState } from "@/lib/providers/connections";
import type { ProviderKey } from "@/lib/providers/types";

type ProviderActionsProps = {
  accountId?: string;
  connect: ProviderConnectionActionState;
  disconnect: ProviderConnectionActionState;
  providerKey: ProviderKey;
  refreshHealth: ProviderConnectionActionState;
};

export function ProviderActions({
  accountId,
  connect,
  disconnect,
  providerKey,
  refreshHealth
}: ProviderActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function runAction(action: () => Promise<string>) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const actionMessage = await action();
        setMessage(actionMessage);
        router.refresh();
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "Action failed.");
      }
    });
  }

  async function refreshProviderHealth() {
    const url = new URL(`/api/connections/${providerKey}/health`, window.location.origin);

    if (accountId) {
      url.searchParams.set("accountId", accountId);
    }

    const response = await fetch(url, {
      headers: {
        Accept: "application/json"
      }
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to refresh provider health.");
    }

    return "Health refreshed.";
  }

  async function disconnectProvider() {
    if (!accountId) {
      throw new Error("No connected account is selected.");
    }

    const confirmed = window.confirm("Disconnect this provider account?");

    if (!confirmed) {
      return "Disconnect canceled.";
    }

    const response = await fetch(`/api/connections/${providerKey}/disconnect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        accountId
      })
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to disconnect provider account.");
    }

    return "Provider disconnected.";
  }

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <div className="flex flex-wrap gap-2">
        {connect.enabled && connect.href ? (
          <a
            href={connect.href}
            className="inline-flex h-8 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white px-3 text-sm font-medium text-[var(--color-text)] transition hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface)] active:translate-y-px"
          >
            <ExternalLink size={15} aria-hidden="true" />
            {connect.label}
          </a>
        ) : (
          <Button variant="outline" size="sm" disabled title={connect.reason}>
            <ExternalLink size={15} aria-hidden="true" />
            {connect.label}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={!refreshHealth.enabled || isPending}
          title={refreshHealth.reason}
          onClick={() => runAction(refreshProviderHealth)}
        >
          <RefreshCw size={15} aria-hidden="true" />
          {refreshHealth.label}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!disconnect.enabled || isPending}
          title={disconnect.reason}
          onClick={() => runAction(disconnectProvider)}
        >
          <Trash2 size={15} aria-hidden="true" />
          {disconnect.label}
        </Button>
      </div>
      {message ? <p className="text-xs text-[var(--color-success)]">{message}</p> : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
