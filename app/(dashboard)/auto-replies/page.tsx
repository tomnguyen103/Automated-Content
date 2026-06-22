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
        items={[
          { label: "Rules", href: "#rules", active: true },
          { label: "Inbox", href: "#inbox" },
          { label: "Approval Queue", href: "#approvals" },
          { label: "Logs", href: "#logs" }
        ]}
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
