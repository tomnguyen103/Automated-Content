"use client";

import { Check, MessageSquare, PauseCircle } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  ContentWorkflowApprovalAction,
  ContentWorkflowState
} from "@/lib/agents/graphs/state";

type ApprovalPanelProps = {
  workflow: ContentWorkflowState | null;
  disabled?: boolean;
  onDecision: (action: ContentWorkflowApprovalAction, comment?: string) => Promise<void> | void;
};

const statusLabels: Record<ContentWorkflowState["approvalStatus"], string> = {
  not_requested: "Not requested",
  pending: "Pending review",
  approved: "Approved",
  changes_requested: "Changes requested",
  paused: "Paused"
};

export function ApprovalPanel({ disabled = false, onDecision, workflow }: ApprovalPanelProps) {
  const [comment, setComment] = useState("");
  const [pendingAction, setPendingAction] = useState<ContentWorkflowApprovalAction | null>(null);
  const canAct =
    Boolean(workflow?.contentPack) &&
    workflow?.status !== "succeeded" &&
    workflow?.status !== "failed" &&
    !disabled &&
    !pendingAction;

  const submitDecision = async (action: ContentWorkflowApprovalAction) => {
    setPendingAction(action);

    try {
      await onDecision(action, comment.trim() || undefined);
      if (action !== "request_changes") {
        setComment("");
      }
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold">Approval</h3>
          <p className="mt-1 font-mono text-xs text-[var(--color-text-muted)]">
            {workflow ? workflow.currentNode : "review"}
          </p>
        </div>
        <Badge
          tone={
            workflow?.approvalStatus === "approved"
              ? "success"
              : workflow?.approvalStatus === "changes_requested" || workflow?.approvalStatus === "paused"
                ? "premium"
                : "neutral"
          }
        >
          {workflow ? statusLabels[workflow.approvalStatus] : "Waiting"}
        </Badge>
      </div>

      <label className="grid gap-2 text-sm font-medium" htmlFor="approval-comment">
        Review note
        <textarea
          id="approval-comment"
          className="min-h-20 resize-y rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm font-normal leading-6 outline-none transition focus:border-[var(--color-primary)]"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
        />
      </label>

      <div className="grid gap-2 sm:grid-cols-3">
        <Button disabled={!canAct || pendingAction === "approve"} type="button" onClick={() => submitDecision("approve")}>
          <Check size={16} />
          Approve
        </Button>
        <Button
          disabled={!canAct || pendingAction === "request_changes"}
          type="button"
          variant="secondary"
          onClick={() => submitDecision("request_changes")}
        >
          <MessageSquare size={16} />
          Changes
        </Button>
        <Button
          disabled={!canAct || pendingAction === "pause"}
          type="button"
          variant="outline"
          onClick={() => submitDecision("pause")}
        >
          <PauseCircle size={16} />
          Pause
        </Button>
      </div>
    </div>
  );
}
