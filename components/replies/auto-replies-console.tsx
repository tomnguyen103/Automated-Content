"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Inbox, Play, ShieldCheck } from "lucide-react";
import { ApprovalQueue } from "@/components/replies/approval-queue";
import { ReplyLog } from "@/components/replies/reply-log";
import { RuleBuilder } from "@/components/replies/rule-builder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  autoRepliesConsoleStateSchema,
  type AutoRepliesConsoleState,
  type CreateReplyRuleRequest
} from "@/lib/replies/console";

type AutoRepliesConsoleProps = {
  initialState: AutoRepliesConsoleState;
};

type BusyAction = "create_rule" | "toggle_rule" | "run_rules" | "approve" | null;

async function readConsoleResponse(response: Response) {
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : "Unable to update auto replies.";
    throw new Error(message);
  }

  return autoRepliesConsoleStateSchema.parse(payload);
}

export function AutoRepliesConsole({ initialState }: AutoRepliesConsoleProps) {
  const [state, setState] = useState(() => autoRepliesConsoleStateSchema.parse(initialState));
  const [previewSessionId] = useState(() => crypto.randomUUID());
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [error, setError] = useState<string | null>(null);
  const mutationInFlightRef = useRef(false);
  const stats = useMemo(
    () => ({
      enabledRules: state.rules.filter((rule) => rule.enabled).length,
      pendingApprovals: state.approvals.filter((approval) => approval.status === "pending").length,
      newComments: state.inbox.filter((comment) => comment.status === "new").length,
      sentReplies: state.logs.filter((entry) => entry.status === "sent").length
    }),
    [state]
  );

  function requestHeaders(json = false) {
    return {
      ...(json ? { "Content-Type": "application/json" } : {}),
      "x-reply-preview-session": previewSessionId
    };
  }

  useEffect(() => {
    let active = true;

    fetch("/api/replies/console", {
      headers: {
        "x-reply-preview-session": previewSessionId
      }
    })
      .then(readConsoleResponse)
      .then((nextState) => {
        if (active) {
          setState(nextState);
        }
      })
      .catch((caught) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Unable to load auto replies.");
        }
      });

    return () => {
      active = false;
    };
  }, [previewSessionId]);

  async function updateState(action: BusyAction, request: () => Promise<Response>) {
    if (mutationInFlightRef.current) {
      const message = "Another auto reply update is already running.";
      setError(message);
      return { ok: false as const, error: message };
    }

    mutationInFlightRef.current = true;
    setBusyAction(action);
    setError(null);

    try {
      setState(await readConsoleResponse(await request()));
      return { ok: true as const };
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to update auto replies.";
      setError(message);
      return { ok: false as const, error: message };
    } finally {
      mutationInFlightRef.current = false;
      setBusyAction(null);
    }
  }

  async function createRule(rule: CreateReplyRuleRequest) {
    return updateState("create_rule", () =>
      fetch("/api/replies/rules", {
        method: "POST",
        headers: requestHeaders(true),
        body: JSON.stringify(rule)
      })
    );
  }

  async function toggleRule(ruleId: string) {
    const rule = state.rules.find((candidate) => candidate.id === ruleId);

    if (!rule) {
      return;
    }

    await updateState("toggle_rule", () =>
      fetch(`/api/replies/rules/${ruleId}`, {
        method: "PATCH",
        headers: requestHeaders(true),
        body: JSON.stringify({
          enabled: !rule.enabled
        })
      })
    );
  }

  async function runRules() {
    await updateState("run_rules", () =>
      fetch("/api/replies/run", {
        method: "POST",
        headers: requestHeaders()
      })
    );
  }

  async function approveSuggestion(itemId: string, replyText: string) {
    await updateState("approve", () =>
      fetch(`/api/replies/approvals/${itemId}`, {
        method: "POST",
        headers: requestHeaders(true),
        body: JSON.stringify({ replyText })
      })
    );
  }

  return (
    <div className="grid gap-5">
      <section className="grid gap-4 md:grid-cols-4">
        <Stat label="Enabled rules" value={stats.enabledRules} />
        <Stat label="New comments" value={stats.newComments} />
        <Stat label="Pending approvals" value={stats.pendingApprovals} />
        <Stat label="Sent replies" value={stats.sentReplies} />
      </section>

      {error ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--color-error)] bg-rose-50 p-4 text-sm font-medium text-[var(--color-error)]">
          {error}
        </div>
      ) : null}

      <div id="rules" className="scroll-mt-20">
        <RuleBuilder
          rules={state.rules}
          onCreateRule={createRule}
          onToggleRule={toggleRule}
          submitting={busyAction === "create_rule"}
        />
      </div>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <section id="inbox" className="scroll-mt-20 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-teal-50 text-teal-700">
                <Inbox size={18} aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-base font-semibold">Inbox</h2>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  Review incoming comments before rules decide the next action.
                </p>
              </div>
            </div>
            <Button onClick={runRules} disabled={stats.newComments === 0 || busyAction === "run_rules"}>
              <Play size={16} aria-hidden="true" />
              {busyAction === "run_rules" ? "Running" : "Run rules"}
            </Button>
          </div>

          <div className="mt-4 grid gap-3">
            {state.inbox.length === 0 ? (
              <div className="rounded-[var(--radius-md)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-muted)]">
                No comments have been ingested yet.
              </div>
            ) : (
              state.inbox.map((comment) => (
                <article key={comment.id} className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">{comment.authorName}</h3>
                    <Badge tone="neutral">{comment.platform}</Badge>
                    <Badge tone={comment.status === "replied" ? "success" : comment.status === "awaiting_approval" ? "premium" : "neutral"}>
                      {comment.status.replace("_", " ")}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">{comment.text}</p>
                  {comment.postTitle ? (
                    <p className="mt-2 text-xs text-[var(--color-text-subtle)]">{comment.postTitle}</p>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </section>

        <div id="approvals" className="scroll-mt-20">
          <ApprovalQueue
            items={state.approvals}
            onApprove={approveSuggestion}
            approving={busyAction === "approve"}
          />
        </div>
      </section>

      <div id="logs" className="scroll-mt-20">
        <ReplyLog entries={state.logs} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-rose-50 text-[var(--color-primary)]">
          <ShieldCheck size={18} aria-hidden="true" />
        </span>
        <div>
          <p className="text-2xl font-semibold">{value}</p>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{label}</p>
        </div>
      </div>
    </section>
  );
}
