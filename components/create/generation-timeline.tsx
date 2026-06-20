import { CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AgentRun } from "@/lib/agents/schemas/agent-run";

const toolLabels: Record<string, string> = {
  research_topic: "Research",
  read_brand_profile: "Brand",
  retrieve_past_posts: "Memory",
  generate_platform_variant: "Variants",
  check_platform_policy: "Policy",
  suggest_schedule: "Schedule",
  save_draft: "Save"
};

type GenerationTimelineProps = {
  run: AgentRun | null;
  loading: boolean;
};

export function GenerationTimeline({ run, loading }: GenerationTimelineProps) {
  const calls = run?.toolCalls ?? [];

  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white p-5">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] pb-4">
        <div>
          <h2 className="text-base font-semibold">Agent run</h2>
          {run ? (
            <p className="mt-1 font-mono text-xs text-[var(--color-text-muted)]">{run.traceId}</p>
          ) : (
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">No run yet</p>
          )}
        </div>
        <Badge
          tone={
            loading
              ? "primary"
              : run?.status === "succeeded"
                ? "success"
                : run?.status === "failed"
                  ? "critical"
                  : "neutral"
          }
        >
          {loading ? "Running" : run?.status ?? "Ready"}
        </Badge>
      </div>

      <div className="mt-4 space-y-3">
        {calls.length === 0 ? (
          <div className="flex items-center gap-3 rounded-[var(--radius-md)] bg-[var(--color-surface)] p-3 text-sm text-[var(--color-text-muted)]">
            <CircleDashed size={17} />
            Waiting for a generation run
          </div>
        ) : (
          calls.map((call) => (
            <div key={call.id} className="flex items-start gap-3 rounded-[var(--radius-md)] bg-[var(--color-surface)] p-3">
              {call.status === "succeeded" ? (
                <CheckCircle2 className="mt-0.5 text-[var(--color-community)]" size={17} />
              ) : (
                <XCircle className="mt-0.5 text-[var(--color-error)]" size={17} />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium">{toolLabels[call.name] ?? call.name}</p>
                <p className="mt-1 truncate font-mono text-xs text-[var(--color-text-muted)]">{call.name}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
