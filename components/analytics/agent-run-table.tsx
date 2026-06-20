import { Badge } from "@/components/ui/badge";
import type { AgentRunSummary } from "@/lib/analytics/metrics";

const statusTone = {
  queued: "neutral",
  running: "premium",
  succeeded: "success",
  failed: "critical"
} as const;

function formatDuration(durationMs: number | null) {
  if (durationMs === null) {
    return "In progress";
  }

  const seconds = Math.round(durationMs / 1000);

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${minutes}m ${remainingSeconds}s`;
}

function formatStartedAt(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function AgentRunTable({ runs }: { runs: AgentRunSummary[] }) {
  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white">
      <div className="flex flex-col gap-3 border-b border-[var(--color-border)] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Agent activity</h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Recent LangChain and LangGraph runs with trace IDs.
          </p>
        </div>
        <Badge tone="primary">{runs.length} recent</Badge>
      </div>

      {runs.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
              <tr>
                <th className="px-5 py-3 font-medium">Run</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Model</th>
                <th className="px-5 py-3 font-medium">Tools</th>
                <th className="px-5 py-3 font-medium">Duration</th>
                <th className="px-5 py-3 font-medium">Started</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {runs.map((run) => (
                <tr key={run.id}>
                  <td className="max-w-[220px] px-5 py-4">
                    <p className="truncate font-medium text-[var(--color-text)]">{run.id}</p>
                    <p className="mt-1 truncate text-xs text-[var(--color-text-muted)]">{run.traceId}</p>
                  </td>
                  <td className="px-5 py-4">
                    <Badge tone={statusTone[run.status]}>{run.status}</Badge>
                  </td>
                  <td className="px-5 py-4 text-[var(--color-text-muted)]">
                    {run.provider} / {run.model}
                  </td>
                  <td className="px-5 py-4 text-[var(--color-text-muted)]">{run.toolCallCount}</td>
                  <td className="px-5 py-4 text-[var(--color-text-muted)]">{formatDuration(run.durationMs)}</td>
                  <td className="px-5 py-4 text-[var(--color-text-muted)]">{formatStartedAt(run.startedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-5 text-sm text-[var(--color-text-muted)]">No agent runs have been recorded yet.</div>
      )}
    </section>
  );
}
