"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Filter, RotateCcw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type {
  BrandMemoryProposal,
  BrandMemoryProposalScope,
  BrandMemoryProposalStatus
} from "@/lib/brand-memory/schemas";
import type { BrandMemoryCurationSummary } from "@/lib/brand-memory/curator";
import { socialPlatformOptions } from "@/lib/agents/schemas/platform-variant";

type BrandMemoryFilters = {
  status?: BrandMemoryProposalStatus;
  scope?: BrandMemoryProposalScope;
  platform?: string;
  minConfidence?: number;
  maxConfidence?: number;
};

type BrandMemoryWorkbenchProps = {
  initialCuration: BrandMemoryCurationSummary;
  initialFilters: BrandMemoryFilters;
  initialProposals: BrandMemoryProposal[];
};

const statusOptions = ["pending", "accepted", "rejected"] as const;
const scopeOptions = ["workspace", "platform", "profile", "campaign"] as const;
const platformOptions = socialPlatformOptions;

const statusTone: Record<BrandMemoryProposalStatus, "primary" | "success" | "critical"> = {
  pending: "primary",
  accepted: "success",
  rejected: "critical"
};

function formatDate(value: string | undefined) {
  if (!value) {
    return "Not reviewed";
  }

  return new Date(value).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function proposalSource(proposal: BrandMemoryProposal) {
  return proposal.sourceVariantId ?? proposal.sourceContentPackId ?? proposal.sourceAgentRunId ?? "Manual review";
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : "Brand memory review failed.";
    throw new Error(message);
  }

  return payload as T;
}

export function BrandMemoryWorkbench({
  initialCuration,
  initialFilters,
  initialProposals
}: BrandMemoryWorkbenchProps) {
  const [proposals, setProposals] = useState(initialProposals);
  const [selectedId, setSelectedId] = useState(initialProposals[0]?.id ?? "");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selectedProposal = useMemo(
    () => proposals.find((proposal) => proposal.id === selectedId) ?? proposals[0] ?? null,
    [proposals, selectedId]
  );
  const pendingCount = proposals.filter((proposal) => proposal.status === "pending").length;
  const acceptedCount = proposals.filter((proposal) => proposal.status === "accepted").length;
  const rejectedCount = proposals.filter((proposal) => proposal.status === "rejected").length;

  function replaceReviewed(reviewed: BrandMemoryProposal[]) {
    const reviewedById = new Map(reviewed.map((proposal) => [proposal.id, proposal]));
    setProposals((current) =>
      current.map((proposal) => reviewedById.get(proposal.id) ?? proposal)
    );
  }

  function reviewProposal(id: string, status: Extract<BrandMemoryProposalStatus, "accepted" | "rejected">) {
    setError(null);
    startTransition(async () => {
      try {
        const payload = await parseJsonResponse<{ proposal: BrandMemoryProposal }>(
          await fetch(`/api/brand-memory/proposals/${encodeURIComponent(id)}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ status })
          })
        );

        replaceReviewed([payload.proposal]);
      } catch (reviewError) {
        setError(reviewError instanceof Error ? reviewError.message : "Brand memory review failed.");
      }
    });
  }

  function reviewSelected(status: Extract<BrandMemoryProposalStatus, "accepted" | "rejected">) {
    if (selectedIds.length === 0) {
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const payload = await parseJsonResponse<{ proposals: BrandMemoryProposal[] }>(
          await fetch("/api/brand-memory/proposals/bulk", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              ids: selectedIds,
              status
            })
          })
        );

        replaceReviewed(payload.proposals);
        setSelectedIds([]);
      } catch (reviewError) {
        setError(reviewError instanceof Error ? reviewError.message : "Brand memory review failed.");
      }
    });
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((selected) => selected !== id) : [...current, id]
    );
  }

  return (
    <div className="grid gap-5">
      <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-4">
        <form className="grid gap-3 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto_auto]" method="get">
          <label className="grid gap-1 text-xs font-medium text-[var(--color-text-muted)]">
            Status
            <select
              className="h-10 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)]"
              defaultValue={initialFilters.status ?? ""}
              name="status"
            >
              <option value="">All</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-[var(--color-text-muted)]">
            Scope
            <select
              className="h-10 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)]"
              defaultValue={initialFilters.scope ?? ""}
              name="scope"
            >
              <option value="">All</option>
              {scopeOptions.map((scope) => (
                <option key={scope} value={scope}>
                  {scope}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-[var(--color-text-muted)]">
            Platform
            <select
              className="h-10 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)]"
              defaultValue={initialFilters.platform ?? ""}
              name="platform"
            >
              <option value="">All</option>
              {platformOptions.map((platform) => (
                <option key={platform} value={platform}>
                  {platform}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-[var(--color-text-muted)]">
            Min confidence
            <input
              className="h-10 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)]"
              defaultValue={initialFilters.minConfidence ?? ""}
              max={100}
              min={0}
              name="minConfidence"
              type="number"
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-[var(--color-text-muted)]">
            Max confidence
            <input
              className="h-10 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)]"
              defaultValue={initialFilters.maxConfidence ?? ""}
              max={100}
              min={0}
              name="maxConfidence"
              type="number"
            />
          </label>
          <button className="inline-flex h-10 items-center justify-center gap-2 self-end rounded-[var(--radius-md)] border border-transparent bg-[var(--color-primary)] px-4 text-sm font-medium text-white shadow-sm transition hover:bg-[var(--color-primary-strong)]" type="submit">
            <Filter size={16} aria-hidden="true" />
            Apply
          </button>
          <a className="inline-flex h-10 items-center justify-center gap-2 self-end rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white px-4 text-sm font-medium text-[var(--color-text)] transition hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface)]" href="/brand-memory">
            <RotateCcw size={16} aria-hidden="true" />
            Reset
          </a>
        </form>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-4">
          <p className="text-sm text-[var(--color-text-muted)]">Pending</p>
          <p className="mt-2 text-3xl font-semibold">{pendingCount}</p>
        </section>
        <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-4">
          <p className="text-sm text-[var(--color-text-muted)]">Accepted</p>
          <p className="mt-2 text-3xl font-semibold">{acceptedCount}</p>
        </section>
        <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-4">
          <p className="text-sm text-[var(--color-text-muted)]">Rejected</p>
          <p className="mt-2 text-3xl font-semibold">{rejectedCount}</p>
        </section>
      </div>

      <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Curator 2.0</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Groups related memory, suggests merges, and flags conflicting guidance before activation.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral">{initialCuration.clusters.length} clusters</Badge>
            <Badge tone="premium">{initialCuration.mergeSuggestions.length} merges</Badge>
            <Badge tone={initialCuration.contradictionWarnings.length > 0 ? "critical" : "success"}>
              {initialCuration.contradictionWarnings.length} conflicts
            </Badge>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <div className="rounded-[var(--radius-md)] bg-[var(--color-surface)] p-4">
            <h3 className="text-sm font-semibold">Top clusters</h3>
            <div className="mt-3 grid gap-3">
              {initialCuration.clusters.slice(0, 3).map((cluster) => (
                <div key={cluster.id} className="grid gap-2 rounded-[var(--radius-sm)] bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">{cluster.label}</p>
                    <Badge tone="neutral">{cluster.proposalIds.length}</Badge>
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {cluster.scope}
                    {cluster.platform ? ` / ${cluster.platform}` : ""} | {cluster.averageConfidence}% average confidence
                  </p>
                </div>
              ))}
              {initialCuration.clusters.length === 0 ? (
                <p className="text-sm text-[var(--color-text-muted)]">No active memory clusters yet.</p>
              ) : null}
            </div>
          </div>

          <div className="rounded-[var(--radius-md)] bg-[var(--color-surface)] p-4">
            <h3 className="text-sm font-semibold">Merge suggestions</h3>
            <div className="mt-3 grid gap-3">
              {initialCuration.mergeSuggestions.slice(0, 3).map((suggestion) => (
                <div key={suggestion.id} className="grid gap-2 rounded-[var(--radius-sm)] bg-white p-3">
                  <p className="line-clamp-2 text-sm font-medium">{suggestion.recommendedRule}</p>
                  <p className="text-xs leading-5 text-[var(--color-text-muted)]">{suggestion.reason}</p>
                </div>
              ))}
              {initialCuration.mergeSuggestions.length === 0 ? (
                <p className="text-sm text-[var(--color-text-muted)]">No overlapping rules need merging.</p>
              ) : null}
            </div>
          </div>

          <div className="rounded-[var(--radius-md)] bg-[var(--color-surface)] p-4">
            <h3 className="text-sm font-semibold">Contradictions</h3>
            <div className="mt-3 grid gap-3">
              {initialCuration.contradictionWarnings.slice(0, 3).map((warning) => (
                <div key={warning.id} className="grid gap-2 rounded-[var(--radius-sm)] bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">{warning.dimension.replaceAll("_", " ")}</p>
                    <Badge tone={warning.severity === "blocked" ? "critical" : "premium"}>{warning.severity}</Badge>
                  </div>
                  <p className="text-xs leading-5 text-[var(--color-text-muted)]">{warning.reason}</p>
                </div>
              ))}
              {initialCuration.contradictionWarnings.length === 0 ? (
                <p className="text-sm text-[var(--color-text-muted)]">No contradictions detected.</p>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-[var(--radius-md)] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white">
          <div className="flex flex-col gap-3 border-b border-[var(--color-border)] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold">Proposals</h2>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">{proposals.length} visible</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="inline-flex h-9 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white px-3 text-sm font-medium text-[var(--color-text)] transition hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface)] disabled:pointer-events-none disabled:opacity-50"
                disabled={selectedIds.length === 0 || isPending}
                onClick={() => reviewSelected("accepted")}
                type="button"
              >
                <Check size={15} aria-hidden="true" />
                Accept selected
              </button>
              <button
                className="inline-flex h-9 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white px-3 text-sm font-medium text-[var(--color-text)] transition hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface)] disabled:pointer-events-none disabled:opacity-50"
                disabled={selectedIds.length === 0 || isPending}
                onClick={() => reviewSelected("rejected")}
                type="button"
              >
                <X size={15} aria-hidden="true" />
                Reject selected
              </button>
            </div>
          </div>

          <div className="max-h-[680px] overflow-y-auto p-2">
            {proposals.length === 0 ? (
              <div className="p-6 text-sm text-[var(--color-text-muted)]">No proposals match these filters.</div>
            ) : (
              proposals.map((proposal) => {
                const active = selectedProposal?.id === proposal.id;

                return (
                  <div
                    className={`grid grid-cols-[auto_1fr] gap-3 rounded-[var(--radius-md)] p-3 transition ${
                      active ? "bg-rose-50" : "hover:bg-[var(--color-surface)]"
                    }`}
                    key={proposal.id}
                  >
                    <input
                      aria-label={`Select proposal ${proposal.id}`}
                      checked={selectedIds.includes(proposal.id)}
                      className="mt-1 h-4 w-4"
                      onChange={() => toggleSelected(proposal.id)}
                      type="checkbox"
                    />
                    <button
                      className="min-w-0 text-left"
                      onClick={() => setSelectedId(proposal.id)}
                      type="button"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={statusTone[proposal.status]}>{proposal.status}</Badge>
                        <span className="text-xs font-medium text-[var(--color-text-muted)]">
                          {proposal.scope}
                          {proposal.platform ? ` / ${proposal.platform}` : ""}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm font-medium text-[var(--color-text)]">
                        {proposal.inferredRule}
                      </p>
                      <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                        {proposal.confidence}% confidence | {formatDate(proposal.createdAt)}
                      </p>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section id="evidence" className="scroll-mt-16 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-5">
          {selectedProposal ? (
            <div>
              <div className="flex flex-col gap-3 border-b border-[var(--color-border)] pb-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold">Review detail</h2>
                    <Badge tone={statusTone[selectedProposal.status]}>{selectedProposal.status}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                    {selectedProposal.scope}
                    {selectedProposal.platform ? ` / ${selectedProposal.platform}` : ""} | {selectedProposal.confidence}% confidence
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    aria-label={`Accept proposal ${selectedProposal.id}`}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-transparent bg-[var(--color-primary)] px-3 text-sm font-medium text-white shadow-sm transition hover:bg-[var(--color-primary-strong)] disabled:pointer-events-none disabled:opacity-50"
                    disabled={isPending || selectedProposal.status === "accepted"}
                    onClick={() => reviewProposal(selectedProposal.id, "accepted")}
                    type="button"
                  >
                    <Check size={15} aria-hidden="true" />
                    Accept
                  </button>
                  <button
                    aria-label={`Reject proposal ${selectedProposal.id}`}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white px-3 text-sm font-medium text-[var(--color-text)] transition hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface)] disabled:pointer-events-none disabled:opacity-50"
                    disabled={isPending || selectedProposal.status === "rejected"}
                    onClick={() => reviewProposal(selectedProposal.id, "rejected")}
                    type="button"
                  >
                    <X size={15} aria-hidden="true" />
                    Reject
                  </button>
                </div>
              </div>

              <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium uppercase text-[var(--color-text-muted)]">Source</dt>
                  <dd className="mt-1 break-all font-mono text-xs">{proposalSource(selectedProposal)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase text-[var(--color-text-muted)]">Reviewed</dt>
                  <dd className="mt-1 text-sm">{formatDate(selectedProposal.reviewedAt)}</dd>
                </div>
              </dl>

              <div className="mt-5 grid gap-4">
                <section className="rounded-[var(--radius-md)] bg-[var(--color-surface)] p-4">
                  <h3 className="text-sm font-semibold">Inferred rule</h3>
                  <p className="mt-2 text-sm leading-6">{selectedProposal.inferredRule}</p>
                </section>
                <section className="rounded-[var(--radius-md)] bg-[var(--color-surface)] p-4">
                  <h3 className="text-sm font-semibold">Original text</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--color-text-muted)]">
                    {selectedProposal.originalText}
                  </p>
                </section>
                <section className="rounded-[var(--radius-md)] bg-[var(--color-surface)] p-4">
                  <h3 className="text-sm font-semibold">Edited text</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--color-text-muted)]">
                    {selectedProposal.editedText}
                  </p>
                </section>
                <section className="rounded-[var(--radius-md)] bg-[var(--color-surface)] p-4">
                  <h3 className="text-sm font-semibold">Evidence</h3>
                  <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-[var(--color-text-muted)]">
                    {JSON.stringify(selectedProposal.evidence, null, 2)}
                  </pre>
                </section>
              </div>
            </div>
          ) : (
            <div className="p-6 text-sm text-[var(--color-text-muted)]">No proposal selected.</div>
          )}
        </section>
      </div>
    </div>
  );
}
