"use client";

import { Loader2, Sparkles } from "lucide-react";
import { FormEvent, useState } from "react";
import { DraftEditor } from "@/components/create/draft-editor";
import { GenerationTimeline } from "@/components/create/generation-timeline";
import { PlatformTabs } from "@/components/create/platform-tabs";
import {
  ReviewStep,
  type ApprovedVariantScheduleResult,
  type BrandMemoryProposalReviewItem
} from "@/components/create/review-step";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  ContentWorkflowApprovalAction,
  ContentWorkflowState
} from "@/lib/agents/graphs/state";
import type { AgentRun } from "@/lib/agents/schemas/agent-run";
import type { ContentPack } from "@/lib/agents/schemas/content-pack";
import type { SocialPlatform } from "@/lib/agents/schemas/platform-variant";
import { defaultProviderByPlatform } from "@/lib/providers/platform-compatibility";
import type { ProviderKey } from "@/lib/providers/types";

const platformOptions: Array<{ value: SocialPlatform; label: string }> = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "x", label: "X" },
  { value: "instagram", label: "Instagram" },
  { value: "threads", label: "Threads" }
];

type GenerateResponse = {
  run: AgentRun;
  workflow: ContentWorkflowState;
  contentPack: ContentPack | null;
  draft: {
    draftId: string;
    status: "saved";
    savedAt: string;
  } | null;
  brandMemoryProposals: BrandMemoryProposalReviewItem[];
};

type WorkflowPayload = Partial<GenerateResponse> & {
  error?: string;
};

type ScheduleResponsePayload = {
  error?: string;
  scheduledJob?: {
    id: string;
    enqueueStatus?: string;
  };
  enqueue?: {
    status: "queued" | "failed";
    error?: string;
    delayMs?: number;
  };
};

function normalizeWorkflowPayload(payload: WorkflowPayload): GenerateResponse | null {
  if (!payload.run || !payload.workflow) {
    return null;
  }

  return {
    run: payload.run,
    workflow: payload.workflow,
    contentPack: payload.contentPack ?? payload.workflow.contentPack,
    draft: payload.draft ?? payload.workflow.savedDraft,
    brandMemoryProposals: payload.brandMemoryProposals ?? []
  };
}

export function BriefForm() {
  const [topic, setTopic] = useState("Turn a weekly founder lesson into a multi-platform content batch");
  const [audience, setAudience] = useState("founders and operators");
  const [tone, setTone] = useState("clear, practical, confident");
  const [goal, setGoal] = useState("educate and drive replies");
  const [sources, setSources] = useState("Manual review stays in the loop before scheduling.");
  const [platforms, setPlatforms] = useState<SocialPlatform[]>(["linkedin", "x"]);
  const [loading, setLoading] = useState(false);
  const [decisionLoading, setDecisionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResponse | null>(null);

  const updateContentPack = (contentPack: ContentPack) => {
    setResult((current) =>
      current
        ? {
            ...current,
            contentPack,
            workflow: {
              ...current.workflow,
              contentPack,
              variants: contentPack.variants,
              scheduleSuggestions: contentPack.scheduleSuggestions
            }
          }
        : current
    );
  };

  const togglePlatform = (platform: SocialPlatform) => {
    setPlatforms((current) => {
      if (current.includes(platform)) {
        return current.length === 1 ? current : current.filter((item) => item !== platform);
      }

      return [...current, platform];
    });
  };

  const submitBrief = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          topic,
          audience,
          tone,
          goal,
          sources: sources
            .split(/\n+/)
            .map((source) => source.trim())
            .filter(Boolean),
          platforms
        })
      });
      const payload = (await response.json()) as WorkflowPayload;
      const nextResult = normalizeWorkflowPayload(payload);

      if (nextResult) {
        setResult(nextResult);
      }

      if (!response.ok || !nextResult) {
        const message = payload.error;
        throw new Error(message ?? "Generation failed.");
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Generation failed.");
    } finally {
      setLoading(false);
    }
  };

  const submitApprovalDecision = async (action: ContentWorkflowApprovalAction, comment?: string) => {
    if (!result) {
      return;
    }

    setDecisionLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/agent-runs/${result.run.id}/approval`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action,
          comment,
          contentPack: result.contentPack ?? result.workflow.contentPack ?? undefined
        })
      });
      const payload = (await response.json()) as WorkflowPayload;
      const nextResult = normalizeWorkflowPayload(payload);

      if (nextResult) {
        setResult(nextResult);
      }

      if (!response.ok || !nextResult) {
        const message = payload.error;
        throw new Error(message ?? "Approval update failed.");
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Approval update failed.");
    } finally {
      setDecisionLoading(false);
    }
  };

  const reviewBrandMemoryProposal = async (
    proposalId: string,
    status: "accepted" | "rejected"
  ) => {
    if (!result) {
      return;
    }

    setDecisionLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/brand-memory/proposals/${encodeURIComponent(proposalId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ status })
      });
      const payload = (await response.json()) as {
        error?: string;
        proposal?: BrandMemoryProposalReviewItem;
      };

      if (!response.ok || !payload.proposal) {
        throw new Error(payload.error ?? "Brand memory update failed.");
      }

      const reviewedProposal = payload.proposal;
      setResult((current) =>
        current
          ? {
              ...current,
              brandMemoryProposals: current.brandMemoryProposals.map((proposal) =>
                proposal.id === reviewedProposal.id ? reviewedProposal : proposal
              )
            }
          : current
      );
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Brand memory update failed.");
    } finally {
      setDecisionLoading(false);
    }
  };

  const providerForVariant = (platform: SocialPlatform): ProviderKey => {
    if (
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ) {
      return "mock";
    }

    return defaultProviderByPlatform[platform];
  };

  const scheduleApprovedVariants = async (): Promise<ApprovedVariantScheduleResult[]> => {
    const workflow = result?.workflow;
    const contentPack = result?.contentPack ?? workflow?.contentPack;

    if (!workflow || !contentPack || workflow.approvalStatus !== "approved" || workflow.status !== "succeeded") {
      throw new Error("Approve the content pack before scheduling variants.");
    }

    const schedules = contentPack.variants.map(async (variant) => {
      const suggestion = contentPack.scheduleSuggestions.find((candidate) => candidate.platform === variant.platform);
      const provider = providerForVariant(variant.platform);

      if (variant.policyStatus !== "pass") {
        return {
          variantId: variant.id,
          platform: variant.platform,
          provider,
          status: "skipped" as const,
          message: "Variant needs policy review before scheduling."
        };
      }

      if (!suggestion) {
        return {
          variantId: variant.id,
          platform: variant.platform,
          provider,
          status: "skipped" as const,
          message: "No schedule suggestion is available for this variant."
        };
      }

      let response: Response;
      let payload: ScheduleResponsePayload;

      try {
        response = await fetch(`/api/posts/${variant.id}/schedule`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            provider,
            connectedAccountId: null,
            scheduledFor: suggestion.scheduledFor,
            metadata: {
              confirmation: "create-review-approved-variants",
              contentPackId: contentPack.id,
              runId: workflow.runId,
              scheduleSuggestionId: suggestion.id,
              source: "create-review"
            }
          })
        });
        payload = (await response.json()) as ScheduleResponsePayload;
      } catch (caughtError) {
        return {
          variantId: variant.id,
          platform: variant.platform,
          provider,
          scheduledFor: suggestion.scheduledFor,
          status: "needs_attention" as const,
          message: caughtError instanceof Error ? caughtError.message : "Schedule request failed."
        };
      }

      if (!response.ok) {
        return {
          variantId: variant.id,
          platform: variant.platform,
          provider,
          scheduledFor: suggestion.scheduledFor,
          status: "needs_attention" as const,
          message: payload.error ?? "Schedule request failed."
        };
      }

      if (payload.enqueue?.status === "failed") {
        return {
          variantId: variant.id,
          platform: variant.platform,
          provider,
          scheduledFor: suggestion.scheduledFor,
          status: "needs_attention" as const,
          scheduledJobId: payload.scheduledJob?.id,
          message: payload.enqueue.error ?? "Scheduled row was saved, but queue enqueue needs attention."
        };
      }

      return {
        variantId: variant.id,
        platform: variant.platform,
        provider,
        scheduledFor: suggestion.scheduledFor,
        status: "queued" as const,
        scheduledJobId: payload.scheduledJob?.id,
        message: "Scheduled and queued."
      };
    });

    return Promise.all(schedules);
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <form className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white p-5" onSubmit={submitBrief}>
        <div className="flex flex-col gap-3 border-b border-[var(--color-border)] pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Content brief</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">Topic to structured content pack.</p>
          </div>
          <Badge tone="primary">Phase 4</Badge>
        </div>

        <div className="mt-5 grid gap-4">
          <label className="grid gap-2 text-sm font-medium" htmlFor="topic">
            Topic
            <input
              id="topic"
              className="h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-sm font-normal outline-none transition focus:border-[var(--color-primary)]"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium" htmlFor="audience">
              Audience
              <input
                id="audience"
                className="h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-sm font-normal outline-none transition focus:border-[var(--color-primary)]"
                value={audience}
                onChange={(event) => setAudience(event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium" htmlFor="tone">
              Tone
              <input
                id="tone"
                className="h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-sm font-normal outline-none transition focus:border-[var(--color-primary)]"
                value={tone}
                onChange={(event) => setTone(event.target.value)}
              />
            </label>
          </div>

          <label className="grid gap-2 text-sm font-medium" htmlFor="goal">
            Goal
            <input
              id="goal"
              className="h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-sm font-normal outline-none transition focus:border-[var(--color-primary)]"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
            />
          </label>

          <label className="grid gap-2 text-sm font-medium" htmlFor="sources">
            Sources
            <textarea
              id="sources"
              className="min-h-24 resize-y rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm font-normal leading-6 outline-none transition focus:border-[var(--color-primary)]"
              value={sources}
              onChange={(event) => setSources(event.target.value)}
            />
          </label>

          <fieldset>
            <legend className="text-sm font-medium">Platforms</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {platformOptions.map((platform) => {
                const active = platforms.includes(platform.value);

                return (
                  <button
                    key={platform.value}
                    className={`h-9 rounded-[var(--radius-md)] border px-3 text-sm font-medium transition ${
                      active
                        ? "border-rose-200 bg-rose-50 text-[var(--color-primary)]"
                        : "border-[var(--color-border)] bg-white text-[var(--color-text-muted)] hover:bg-[var(--color-surface)]"
                    }`}
                    type="button"
                    aria-pressed={active}
                    onClick={() => togglePlatform(platform.value)}
                  >
                    {platform.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>

        {error ? (
          <div className="mt-4 rounded-[var(--radius-md)] border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-xs text-[var(--color-text-muted)]">
            {result ? `${result.run.id} / ${result.workflow.currentNode}` : "No run started"}
          </p>
          <Button className="min-w-36" disabled={loading} type="submit">
            {loading ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
            {loading ? "Running" : "Run workflow"}
          </Button>
        </div>
      </form>

      <div className="grid gap-5">
        <GenerationTimeline run={result?.run ?? null} loading={loading} />
        <DraftEditor contentPack={result?.contentPack ?? null} onChange={updateContentPack} />
        <PlatformTabs
          variants={result?.contentPack?.variants ?? []}
          onChange={(variants) => {
            const contentPack = result?.contentPack;

            if (contentPack) {
              updateContentPack({ ...contentPack, variants });
            }
          }}
        />
        <ReviewStep
          brandMemoryProposals={result?.brandMemoryProposals ?? []}
          disabled={decisionLoading}
          workflow={result?.workflow ?? null}
          onDecision={submitApprovalDecision}
          onReviewBrandMemoryProposal={reviewBrandMemoryProposal}
          onScheduleApprovedVariants={scheduleApprovedVariants}
        />
      </div>
    </div>
  );
}
