"use client";

import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

type PublishRetryButtonProps = {
  scheduledJobId: string;
  disabled?: boolean;
};

type PublishRetryResponse = {
  error?: string;
};

async function readRetryResponse(response: Response): Promise<PublishRetryResponse> {
  try {
    const payload = (await response.json()) as PublishRetryResponse;

    return payload && typeof payload === "object" ? payload : {};
  } catch {
    return {};
  }
}

export function PublishRetryButton({ disabled = false, scheduledJobId }: PublishRetryButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submitLockRef = useRef(false);
  const isBusy = isSubmitting || isPending;

  async function retryPublish() {
    if (isBusy || submitLockRef.current) {
      return;
    }

    submitLockRef.current = true;
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/operations/publish-retry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ scheduledJobId })
      });
      const payload = await readRetryResponse(response);

      if (!response.ok) {
        setError(payload.error ?? "Unable to retry scheduled publish.");
        return;
      }

      setMessage("Retry queued");
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError("Unable to retry scheduled publish.");
    } finally {
      submitLockRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-w-[9rem] flex-col items-start gap-1 lg:items-end">
      <Button
        aria-label="Retry scheduled publish"
        disabled={disabled || isBusy}
        onClick={retryPublish}
        size="sm"
        variant="outline"
      >
        <RotateCcw className={isBusy ? "animate-spin" : undefined} size={16} aria-hidden="true" />
        {isBusy ? "Retrying" : "Retry"}
      </Button>
      {error ? (
        <p className="max-w-48 text-xs text-red-600" role="status">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="text-xs text-[var(--color-text-muted)]" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
