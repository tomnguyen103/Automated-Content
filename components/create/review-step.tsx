"use client";

import { Brain, CalendarCheck2, CalendarPlus, CheckCircle2, CircleAlert, Loader2, XCircle } from "lucide-react";
import { useState } from "react";
import { ApprovalPanel } from "@/components/create/approval-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  ContentWorkflowApprovalAction,
  ContentWorkflowState
} from "@/lib/agents/graphs/state";
import { platformLabels } from "@/lib/agents/schemas/platform-variant";

export type ApprovedVariantScheduleResult = {
  variantId: string;
  platform: string;
  provider: string;
  scheduledFor?: string;
  status: "queued" | "needs_attention" | "skipped";
  message: string;
  scheduledJobId?: string;
};

export type BrandMemoryProposalReviewItem = {
  id: string;
  inferredRule: string;
  confidence: number;
  status: "pending" | "accepted" | "rejected";
  originalText: string;
  editedText: string;
  platform?: string;
  scope: "workspace" | "platform" | "profile" | "campaign";
};

type ReviewStepProps = {
  workflow: ContentWorkflowState | null;
  disabled?: boolean;
  onDecision: (action: ContentWorkflowApprovalAction, comment?: string) => Promise<void> | void;
  brandMemoryProposals?: BrandMemoryProposalReviewItem[];
  onReviewBrandMemoryProposal?: (
    proposalId: string,
    status: "accepted" | "rejected"
  ) => Promise<void> | void;
  onScheduleApprovedVariants?: () => Promise<ApprovedVariantScheduleResult[]> | ApprovedVariantScheduleResult[];
};

function WorkflowErrors({ workflow }: { workflow: ContentWorkflowState }) {
  if (workflow.errors.length === 0) {
    return null;
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      <h3 className="font-semibold">Workflow errors</h3>
      <ul className="mt-2 grid gap-1">
        {workflow.errors.map((error, index) => (
          <li key={`${error.node}-${error.occurredAt}-${index}`}>
            <span className="font-mono text-xs">{error.node}</span>: {error.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ScheduleApprovedVariantsPanel({
  disabled,
  onScheduleApprovedVariants,
  workflow
}: {
  disabled: boolean;
  onScheduleApprovedVariants?: () => Promise<ApprovedVariantScheduleResult[]> | ApprovedVariantScheduleResult[];
  workflow: ContentWorkflowState;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [results, setResults] = useState<ApprovedVariantScheduleResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const hasPersistedSchedule = results.some((result) => result.status === "queued" || Boolean(result.scheduledJobId));
  const canSchedule =
    workflow.status === "succeeded" &&
    workflow.approvalStatus === "approved" &&
    Boolean(onScheduleApprovedVariants);

  if (!canSchedule) {
    return null;
  }

  const schedule = async () => {
    if (!onScheduleApprovedVariants || !confirmed || hasPersistedSchedule) {
      return;
    }

    setPending(true);
    setError(null);

    try {
      const nextResults = await onScheduleApprovedVariants();
      setResults(nextResults);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to schedule approved variants.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold">Schedule approved variants</h3>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">{workflow.variants.length} approved variants ready.</p>
        </div>
        <Badge tone="success">Approved</Badge>
      </div>

      <label className="mt-4 flex items-start gap-3 text-sm" htmlFor="confirm-schedule-approved">
        <input
          id="confirm-schedule-approved"
          className="mt-1 size-4 rounded border-[var(--color-border)]"
          checked={confirmed}
          disabled={disabled || pending || hasPersistedSchedule}
          type="checkbox"
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        <span>
          <span className="font-medium">Confirm schedule creation</span>
          <span className="mt-1 block text-[var(--color-text-muted)]">
            Approved variants will be written to the durable scheduler before queue enqueue.
          </span>
        </span>
      </label>

      {error ? (
        <div className="mt-3 rounded-[var(--radius-md)] border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {results.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {results.map((result) => {
            const ok = result.status === "queued";

            return (
              <div
                key={`${result.variantId}-${result.status}`}
                className="flex items-start gap-2 rounded-[var(--radius-sm)] bg-[var(--color-surface)] px-3 py-2 text-sm"
              >
                {ok ? (
                  <CheckCircle2 className="mt-0.5 text-[var(--color-success)]" size={16} aria-hidden="true" />
                ) : (
                  <CircleAlert className="mt-0.5 text-[var(--color-warning)]" size={16} aria-hidden="true" />
                )}
                <div>
                  <p className="font-medium">
                    {platformLabels[result.platform as keyof typeof platformLabels] ?? result.platform} / {result.provider}
                  </p>
                  <p className="text-[var(--color-text-muted)]">{result.message}</p>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="mt-4 flex justify-end">
        <Button disabled={disabled || pending || !confirmed || hasPersistedSchedule} type="button" onClick={schedule}>
          {pending ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <CalendarPlus size={16} aria-hidden="true" />}
          {hasPersistedSchedule ? "Scheduling complete" : pending ? "Scheduling" : "Schedule approved variants"}
        </Button>
      </div>
    </div>
  );
}

function BrandMemoryProposalsPanel({
  disabled,
  onReviewBrandMemoryProposal,
  proposals
}: {
  disabled: boolean;
  proposals: BrandMemoryProposalReviewItem[];
  onReviewBrandMemoryProposal?: (proposalId: string, status: "accepted" | "rejected") => Promise<void> | void;
}) {
  if (proposals.length === 0) {
    return null;
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Brain size={16} aria-hidden="true" />
            Brand memory
          </h3>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Reviewed edits produced voice rules for approval.</p>
        </div>
        <Badge tone="community">{proposals.length} proposed</Badge>
      </div>

      <div className="mt-4 grid gap-3">
        {proposals.map((proposal) => (
          <article key={proposal.id} className="rounded-[var(--radius-sm)] bg-[var(--color-surface)] p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{proposal.inferredRule}</p>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  {proposal.platform ?? proposal.scope} / {proposal.confidence}% confidence
                </p>
              </div>
              <Badge tone={proposal.status === "accepted" ? "success" : proposal.status === "rejected" ? "critical" : "neutral"}>
                {proposal.status}
              </Badge>
            </div>
            <div className="mt-3 grid gap-2 text-xs leading-5 md:grid-cols-2">
              <p className="line-clamp-3 text-[var(--color-text-muted)]">{proposal.originalText}</p>
              <p className="line-clamp-3 font-medium">{proposal.editedText}</p>
            </div>
            {proposal.status === "pending" && onReviewBrandMemoryProposal ? (
              <div className="mt-3 flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  type="button"
                  onClick={() => onReviewBrandMemoryProposal(proposal.id, "rejected")}
                >
                  <XCircle size={15} aria-hidden="true" />
                  Reject
                </Button>
                <Button
                  size="sm"
                  disabled={disabled}
                  type="button"
                  onClick={() => onReviewBrandMemoryProposal(proposal.id, "accepted")}
                >
                  <CheckCircle2 size={15} aria-hidden="true" />
                  Accept
                </Button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}

export function ReviewStep({
  brandMemoryProposals = [],
  disabled = false,
  onDecision,
  onReviewBrandMemoryProposal,
  onScheduleApprovedVariants,
  workflow
}: ReviewStepProps) {
  const contentPack = workflow?.contentPack ?? null;

  if (!workflow || !contentPack) {
    return (
      <section className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-white p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Review</h2>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">Approval controls will appear with the workflow checkpoint.</p>
          </div>
          {workflow ? <Badge tone={workflow.status === "failed" ? "premium" : "neutral"}>{workflow.status}</Badge> : null}
        </div>
        {workflow ? (
          <div className="mt-4">
            <WorkflowErrors workflow={workflow} />
          </div>
        ) : null}
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

      <div className="mt-4">
        <WorkflowErrors workflow={workflow} />
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

        <div className="grid gap-4">
          <ApprovalPanel disabled={disabled} workflow={workflow} onDecision={onDecision} />
          <BrandMemoryProposalsPanel
            disabled={disabled}
            proposals={brandMemoryProposals}
            onReviewBrandMemoryProposal={onReviewBrandMemoryProposal}
          />
          <ScheduleApprovedVariantsPanel
            disabled={disabled}
            workflow={workflow}
            onScheduleApprovedVariants={onScheduleApprovedVariants}
          />
        </div>
      </div>
    </section>
  );
}
