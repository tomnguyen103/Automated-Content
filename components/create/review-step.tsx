"use client";

import { CalendarCheck2 } from "lucide-react";
import { ApprovalPanel } from "@/components/create/approval-panel";
import { Badge } from "@/components/ui/badge";
import type {
  ContentWorkflowApprovalAction,
  ContentWorkflowState
} from "@/lib/agents/graphs/state";
import { platformLabels } from "@/lib/agents/schemas/platform-variant";

type ReviewStepProps = {
  workflow: ContentWorkflowState | null;
  disabled?: boolean;
  onDecision: (action: ContentWorkflowApprovalAction, comment?: string) => Promise<void> | void;
};

export function ReviewStep({ disabled = false, onDecision, workflow }: ReviewStepProps) {
  const contentPack = workflow?.contentPack ?? null;

  if (!workflow || !contentPack) {
    return (
      <section className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-white p-5">
        <h2 className="text-base font-semibold">Review</h2>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">Approval controls will appear with the workflow checkpoint.</p>
      </section>
    );
  }

  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white p-5">
      <div className="flex flex-col gap-3 border-b border-[var(--color-border)] pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Review</h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">{contentPack.summary}</p>
        </div>
        <Badge tone={workflow.status === "succeeded" ? "success" : "primary"}>{workflow.status}</Badge>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_0.85fr]">
        <div className="grid gap-3">
          <h3 className="text-sm font-semibold">Schedule suggestions</h3>
          {contentPack.scheduleSuggestions.map((suggestion) => (
            <div
              key={suggestion.id}
              className="grid gap-2 rounded-[var(--radius-md)] bg-[var(--color-surface)] p-3 text-sm sm:grid-cols-[auto_1fr]"
            >
              <CalendarCheck2 className="mt-0.5 text-[var(--color-community)]" size={17} />
              <div>
                <p className="font-medium">{platformLabels[suggestion.platform]}</p>
                <p className="mt-1 text-[var(--color-text-muted)]">{suggestion.reason}</p>
                <p className="mt-2 font-mono text-xs text-[var(--color-text-muted)]">
                  {new Date(suggestion.scheduledFor).toLocaleString([], {
                    dateStyle: "medium",
                    timeStyle: "short"
                  })}
                </p>
              </div>
            </div>
          ))}

          {contentPack.warnings.length > 0 ? (
            <div className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {contentPack.warnings.join(" ")}
            </div>
          ) : null}
        </div>

        <ApprovalPanel disabled={disabled} workflow={workflow} onDecision={onDecision} />
      </div>
    </section>
  );
}
