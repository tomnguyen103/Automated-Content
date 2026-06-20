import { Badge } from "@/components/ui/badge";
import type { PlatformBreakdownItem } from "@/lib/analytics/metrics";

function getFailureTone(failures: number) {
  return failures > 0 ? "critical" : "success";
}

export function PlatformBreakdown({ rows }: { rows: PlatformBreakdownItem[] }) {
  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white">
      <div className="flex flex-col gap-3 border-b border-[var(--color-border)] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Platform breakdown</h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Posting, comment, and reply activity by channel.
          </p>
        </div>
        <Badge tone="community">{rows.length} tracked</Badge>
      </div>

      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
              <tr>
                <th className="px-5 py-3 font-medium">Platform</th>
                <th className="px-5 py-3 font-medium">Posts</th>
                <th className="px-5 py-3 font-medium">Published</th>
                <th className="px-5 py-3 font-medium">Comments</th>
                <th className="px-5 py-3 font-medium">Replies</th>
                <th className="px-5 py-3 font-medium">Failures</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map((row) => (
                <tr key={row.platform}>
                  <td className="px-5 py-4 font-medium text-[var(--color-text)]">{row.platform}</td>
                  <td className="px-5 py-4 text-[var(--color-text-muted)]">{row.posts}</td>
                  <td className="px-5 py-4 text-[var(--color-text-muted)]">{row.published}</td>
                  <td className="px-5 py-4 text-[var(--color-text-muted)]">{row.comments}</td>
                  <td className="px-5 py-4 text-[var(--color-text-muted)]">{row.replies}</td>
                  <td className="px-5 py-4">
                    <Badge tone={getFailureTone(row.failures)}>{row.failures}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-5 text-sm text-[var(--color-text-muted)]">
          No platform activity has been recorded yet.
        </div>
      )}
    </section>
  );
}
