import { AutoRepliesConsole } from "@/components/replies/auto-replies-console";
import { PageShell } from "@/components/layout/page-shell";
import { SubNav } from "@/components/layout/sub-nav";
import type { AutoRepliesConsoleState } from "@/lib/replies/console";
import { resolveReplyServerContext } from "@/lib/replies/server";

const emptyState: AutoRepliesConsoleState = {
  rules: [],
  inbox: [],
  approvals: [],
  logs: []
};

export default async function AutoRepliesPage() {
  const context = await resolveReplyServerContext();
  const initialState = context ? await context.repository.getConsoleState(context.workspace.id) : emptyState;

  return (
    <>
      <SubNav
        items={["Rules", "Inbox", "Approval Queue", "Logs"].map((label, index) => ({
          label,
          active: index === 0
        }))}
      />
      <PageShell
        title="Auto Replies"
        description="Configure keyword-triggered replies, inspect inbound comments, approve suggestions, and audit every reply."
      >
        <AutoRepliesConsole initialState={initialState} />
      </PageShell>
    </>
  );
}
