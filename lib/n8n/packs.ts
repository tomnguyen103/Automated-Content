import type { N8nEventType } from "@/lib/n8n/events";

export type N8nAutomationPackId =
  | "publish-failure-alert"
  | "reply-approval-reminder"
  | "usage-threshold-alert";

export type N8nPackSetupCheck = {
  id: string;
  label: string;
  description: string;
  status: "ready" | "missing" | "manual";
};

export type N8nAutomationPack = {
  id: N8nAutomationPackId;
  name: string;
  description: string;
  triggerEvent: N8nEventType;
  workflowFile: string;
  callbackWorkflow: string;
  requiredAppEnv: Array<"N8N_WEBHOOK_URL" | "N8N_WEBHOOK_SECRET" | "NEXT_PUBLIC_APP_URL">;
  requiredN8nVariables: string[];
  supportedActions: string[];
  unsupportedActions: string[];
  setupChecks: Array<Omit<N8nPackSetupCheck, "status">>;
  sampleEventData: Record<string, unknown>;
};

export const n8nAutomationPacks = [
  {
    id: "publish-failure-alert",
    name: "Publish Failure Alert",
    description: "Routes failed publishing events to an operations alert channel and records a callback.",
    triggerEvent: "publishing.post.failed",
    workflowFile: "docs/n8n/packs/publish-failure-alert.json",
    callbackWorkflow: "publish-failure-alert",
    requiredAppEnv: ["N8N_WEBHOOK_URL", "N8N_WEBHOOK_SECRET", "NEXT_PUBLIC_APP_URL"],
    requiredN8nVariables: [
      "AUTOMATED_CONTENT_WEBHOOK_SECRET",
      "AUTOMATED_CONTENT_CALLBACK_URL",
      "OPS_ALERT_WEBHOOK_URL"
    ],
    supportedActions: [
      "Validate the app event signature.",
      "Filter for publishing.post.failed events.",
      "Notify an operations channel.",
      "Call back to /api/webhooks/n8n with accepted, completed, or failed status."
    ],
    unsupportedActions: [
      "Retry the failed publish automatically.",
      "Change provider credentials.",
      "Suppress scheduler or policy failures."
    ],
    setupChecks: [
      {
        id: "event-webhook",
        label: "App event webhook is configured",
        description: "N8N_WEBHOOK_URL points at the imported workflow webhook."
      },
      {
        id: "shared-secret",
        label: "Shared signing secret is configured",
        description: "N8N_WEBHOOK_SECRET in the app matches AUTOMATED_CONTENT_WEBHOOK_SECRET in n8n."
      },
      {
        id: "callback-url",
        label: "Callback URL is reachable from n8n",
        description: "AUTOMATED_CONTENT_CALLBACK_URL points at /api/webhooks/n8n on the deployed app."
      }
    ],
    sampleEventData: {
      scheduledJobId: "job_123",
      provider: "linkedin",
      errorCode: "provider_rate_limited"
    }
  },
  {
    id: "reply-approval-reminder",
    name: "Reply Approval Reminder",
    description: "Waits after a reply approval request and alerts reviewers if approval is still pending.",
    triggerEvent: "reply.approval_requested",
    workflowFile: "docs/n8n/packs/reply-approval-reminder.json",
    callbackWorkflow: "reply-approval-reminder",
    requiredAppEnv: ["N8N_WEBHOOK_URL", "N8N_WEBHOOK_SECRET", "NEXT_PUBLIC_APP_URL"],
    requiredN8nVariables: [
      "AUTOMATED_CONTENT_WEBHOOK_SECRET",
      "AUTOMATED_CONTENT_CALLBACK_URL",
      "REVIEW_ALERT_WEBHOOK_URL"
    ],
    supportedActions: [
      "Validate the app event signature.",
      "Delay before notifying reviewers.",
      "Notify a review channel with the approval id.",
      "Call back with accepted status when the reminder is queued."
    ],
    unsupportedActions: [
      "Approve or reject replies.",
      "Send provider replies.",
      "Read private provider comments from n8n."
    ],
    setupChecks: [
      {
        id: "event-webhook",
        label: "App event webhook is configured",
        description: "N8N_WEBHOOK_URL points at the imported workflow webhook."
      },
      {
        id: "review-channel",
        label: "Review alert channel is configured",
        description: "REVIEW_ALERT_WEBHOOK_URL is available to the n8n workflow."
      },
      {
        id: "callback-url",
        label: "Callback URL is reachable from n8n",
        description: "AUTOMATED_CONTENT_CALLBACK_URL points at /api/webhooks/n8n on the deployed app."
      }
    ],
    sampleEventData: {
      replyAttemptId: "reply_123",
      commentId: "comment_123",
      provider: "linkedin"
    }
  },
  {
    id: "usage-threshold-alert",
    name: "Usage Threshold Alert",
    description: "Alerts workspace operators when a usage threshold event is emitted.",
    triggerEvent: "usage.threshold_reached",
    workflowFile: "docs/n8n/packs/usage-threshold-alert.json",
    callbackWorkflow: "usage-threshold-alert",
    requiredAppEnv: ["N8N_WEBHOOK_URL", "N8N_WEBHOOK_SECRET", "NEXT_PUBLIC_APP_URL"],
    requiredN8nVariables: [
      "AUTOMATED_CONTENT_WEBHOOK_SECRET",
      "AUTOMATED_CONTENT_CALLBACK_URL",
      "USAGE_ALERT_WEBHOOK_URL"
    ],
    supportedActions: [
      "Validate the app event signature.",
      "Filter for usage.threshold_reached events.",
      "Notify an owner or operations channel.",
      "Call back with completed status after alert delivery."
    ],
    unsupportedActions: [
      "Upgrade a billing plan.",
      "Change entitlements.",
      "Reset usage counters."
    ],
    setupChecks: [
      {
        id: "event-webhook",
        label: "App event webhook is configured",
        description: "N8N_WEBHOOK_URL points at the imported workflow webhook."
      },
      {
        id: "usage-channel",
        label: "Usage alert channel is configured",
        description: "USAGE_ALERT_WEBHOOK_URL is available to the n8n workflow."
      },
      {
        id: "callback-url",
        label: "Callback URL is reachable from n8n",
        description: "AUTOMATED_CONTENT_CALLBACK_URL points at /api/webhooks/n8n on the deployed app."
      }
    ],
    sampleEventData: {
      usageKey: "scheduledPosts",
      quantity: 7,
      limit: 7
    }
  }
] satisfies N8nAutomationPack[];

export function getN8nAutomationPack(id: N8nAutomationPackId) {
  return n8nAutomationPacks.find((pack) => pack.id === id);
}

export function buildN8nPackSetupChecklist({
  appEnv = {},
  n8nVariables = [],
  pack
}: {
  appEnv?: Partial<Record<N8nAutomationPack["requiredAppEnv"][number], string | undefined>>;
  n8nVariables?: string[];
  pack: N8nAutomationPack;
}): N8nPackSetupCheck[] {
  const n8nVariableSet = new Set(n8nVariables);
  const appEnvChecks: N8nPackSetupCheck[] = pack.requiredAppEnv.map((key) => ({
    id: `app-env-${key.toLowerCase()}`,
    label: `${key} is configured`,
    description: `${key} is required in the app runtime before this pack receives signed events.`,
    status: appEnv[key] ? "ready" : "missing"
  }));
  const n8nChecks: N8nPackSetupCheck[] = pack.requiredN8nVariables.map((key) => ({
    id: `n8n-var-${key.toLowerCase()}`,
    label: `${key} is configured in n8n`,
    description: `${key} must be set in n8n credentials or environment variables before activation.`,
    status: n8nVariableSet.has(key) ? "ready" : "manual"
  }));

  return [
    ...appEnvChecks,
    ...n8nChecks,
    ...pack.setupChecks.map((check) => ({
      ...check,
      status: "manual" as const
    }))
  ];
}
