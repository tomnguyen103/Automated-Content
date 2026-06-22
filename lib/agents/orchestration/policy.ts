import {
  agentAutonomyPolicySchema,
  type AgentActionType,
  type AgentAutonomyPolicy,
  type AgentMission,
  type AgentPolicyEvent,
  type AgentPolicyEventAction,
  type AgentPolicyEventSeverity,
  type AgentProfile
} from "@/lib/agents/schemas/orchestration";

export type AgentPolicyDecision = {
  allowed: boolean;
  action: AgentPolicyEventAction;
  severity: AgentPolicyEventSeverity;
  policyKey: string;
  message: string;
  details: Record<string, unknown>;
  policy: AgentAutonomyPolicy;
};

export type EvaluateAgentPolicyInput = {
  action: AgentActionType;
  profile?: AgentProfile | null;
  mission?: AgentMission | null;
  policy?: Partial<AgentAutonomyPolicy>;
  toolScope?: string;
  provider?: string | null;
  platform?: string | null;
  connectedAccountId?: string | null;
  confidence?: number | null;
  contentText?: string | null;
  todayActionCount?: number;
  estimatedCostCents?: number;
  now?: Date;
};

function mergePolicies(...policies: Array<Partial<AgentAutonomyPolicy> | null | undefined>) {
  const merged: Record<string, unknown> = {};

  for (const policy of policies) {
    if (!policy) {
      continue;
    }

    for (const [key, value] of Object.entries(policy)) {
      if (value !== undefined) {
        merged[key] = value;
      }
    }
  }

  return agentAutonomyPolicySchema.parse(merged);
}

function decision({
  action,
  allowed,
  details = {},
  message,
  policy,
  policyKey,
  severity
}: {
  allowed: boolean;
  action: AgentPolicyEventAction;
  severity: AgentPolicyEventSeverity;
  policyKey: string;
  message: string;
  details?: Record<string, unknown>;
  policy: AgentAutonomyPolicy;
}): AgentPolicyDecision {
  return {
    allowed,
    action,
    severity,
    policyKey,
    message,
    details,
    policy
  };
}

function includesOrUnscoped(scope: string[], value: string | null | undefined) {
  return !value || scope.length === 0 || scope.includes(value);
}

function getHourInTimezone(date: Date, timezone: string) {
  const formatted = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    timeZone: timezone
  }).format(date);

  return Number(formatted);
}

function isInQuietHours(policy: AgentAutonomyPolicy, now: Date) {
  const quiet = policy.quietHours;

  if (!quiet.enabled) {
    return false;
  }

  const hour = getHourInTimezone(now, quiet.timezone);

  // Matching bounds intentionally mean full-day quiet hours, which acts as a policy lockdown.
  if (quiet.startHour === quiet.endHour) {
    return true;
  }

  if (quiet.startHour < quiet.endHour) {
    return hour >= quiet.startHour && hour < quiet.endHour;
  }

  return hour >= quiet.startHour || hour < quiet.endHour;
}

function findBlockedPhrase(policy: AgentAutonomyPolicy, contentText: string | null | undefined) {
  if (!contentText) {
    return null;
  }

  const normalized = contentText.toLowerCase();

  return (
    policy.blockedPhrases.find((phrase) => phrase.trim() && normalized.includes(phrase.toLowerCase())) ?? null
  );
}

export function isExternalAction(action: AgentActionType) {
  return action === "content.schedule" || action === "content.publish" || action === "reply.send";
}

export function evaluateAgentPolicy(input: EvaluateAgentPolicyInput): AgentPolicyDecision {
  const policy = mergePolicies(input.profile?.policy, input.mission?.policy, input.policy);
  const profileStatus = input.profile?.status ?? "active";
  const now = input.now ?? new Date();
  const todayActionCount = input.todayActionCount ?? 0;
  const estimatedCostCents = input.estimatedCostCents ?? 0;

  if (profileStatus !== "active") {
    return decision({
      allowed: false,
      action: "block",
      severity: "blocked",
      policyKey: "profile_status",
      message: `Agent profile is ${profileStatus}.`,
      details: { profileStatus },
      policy
    });
  }

  if (policy.emergencyPaused || input.mission?.status === "paused") {
    return decision({
      allowed: false,
      action: "block",
      severity: "blocked",
      policyKey: "emergency_pause",
      message: "Autonomous execution is paused for this mission or profile.",
      details: { missionStatus: input.mission?.status, emergencyPaused: policy.emergencyPaused },
      policy
    });
  }

  if (policy.requiresHumanApproval || policy.autonomy === "assistive") {
    return decision({
      allowed: false,
      action: "require_review",
      severity: "warning",
      policyKey: "human_review_required",
      message: "Policy requires review before this autonomous action.",
      details: { autonomy: policy.autonomy, requiresHumanApproval: policy.requiresHumanApproval },
      policy
    });
  }

  if (policy.allowedActions.length > 0 && !policy.allowedActions.includes(input.action)) {
    return decision({
      allowed: false,
      action: "block",
      severity: "blocked",
      policyKey: "action_scope",
      message: `Action ${input.action} is not allowed for this agent.`,
      details: { action: input.action, allowedActions: policy.allowedActions },
      policy
    });
  }

  if (input.toolScope && policy.allowedToolScopes.length > 0 && !policy.allowedToolScopes.includes(input.toolScope)) {
    return decision({
      allowed: false,
      action: "block",
      severity: "blocked",
      policyKey: "tool_scope",
      message: `Tool scope ${input.toolScope} is not allowed for this agent.`,
      details: { toolScope: input.toolScope, allowedToolScopes: policy.allowedToolScopes },
      policy
    });
  }

  if (!includesOrUnscoped(policy.allowedProviders, input.provider)) {
    return decision({
      allowed: false,
      action: "block",
      severity: "blocked",
      policyKey: "provider_scope",
      message: `Provider ${input.provider} is outside this mission scope.`,
      details: { provider: input.provider, allowedProviders: policy.allowedProviders },
      policy
    });
  }

  if (!includesOrUnscoped(policy.platformScope, input.platform)) {
    return decision({
      allowed: false,
      action: "block",
      severity: "blocked",
      policyKey: "platform_scope",
      message: `Platform ${input.platform} is outside this mission scope.`,
      details: { platform: input.platform, platformScope: policy.platformScope },
      policy
    });
  }

  if (!includesOrUnscoped(policy.connectedAccountIds, input.connectedAccountId)) {
    return decision({
      allowed: false,
      action: "block",
      severity: "blocked",
      policyKey: "connected_account_scope",
      message: "Connected account is outside this mission scope.",
      details: {
        connectedAccountId: input.connectedAccountId,
        connectedAccountIds: policy.connectedAccountIds
      },
      policy
    });
  }

  if (todayActionCount >= policy.dailyActionCap) {
    return decision({
      allowed: false,
      action: "block",
      severity: "blocked",
      policyKey: "daily_action_cap",
      message: "Daily autonomous action cap has been reached.",
      details: { todayActionCount, dailyActionCap: policy.dailyActionCap },
      policy
    });
  }

  if (policy.modelBudgetCents > 0 && estimatedCostCents > policy.modelBudgetCents) {
    return decision({
      allowed: false,
      action: "block",
      severity: "blocked",
      policyKey: "model_budget",
      message: "Estimated model cost exceeds this mission budget.",
      details: { estimatedCostCents, modelBudgetCents: policy.modelBudgetCents },
      policy
    });
  }

  if (typeof input.confidence === "number" && input.confidence < policy.confidenceThreshold) {
    return decision({
      allowed: false,
      action: "require_review",
      severity: "warning",
      policyKey: "confidence_threshold",
      message: "Confidence is below the autonomous action threshold.",
      details: { confidence: input.confidence, confidenceThreshold: policy.confidenceThreshold },
      policy
    });
  }

  const blockedPhrase = findBlockedPhrase(policy, input.contentText);

  if (blockedPhrase) {
    return decision({
      allowed: false,
      action: "block",
      severity: "blocked",
      policyKey: "blocked_phrase",
      message: "Content contains a blocked phrase.",
      details: { blockedPhrase },
      policy
    });
  }

  if (isInQuietHours(policy, now)) {
    return decision({
      allowed: false,
      action: "require_review",
      severity: "warning",
      policyKey: "quiet_hours",
      message: "Autonomous external actions are paused during quiet hours.",
      details: { quietHours: policy.quietHours },
      policy
    });
  }

  if (policy.autonomy === "supervised" && isExternalAction(input.action)) {
    return decision({
      allowed: false,
      action: "require_review",
      severity: "warning",
      policyKey: "supervised_external_action",
      message: "Supervised mode requires review before this external action.",
      details: { action: input.action, autonomy: policy.autonomy },
      policy
    });
  }

  return decision({
    allowed: true,
    action: "allow",
    severity: "info",
    policyKey: "allowed",
    message: "Autonomous action allowed by policy.",
    details: { action: input.action },
    policy
  });
}

export function createPolicyEventFromDecision({
  decision: policyDecision,
  id = `policy_event_${crypto.randomUUID()}`,
  mission,
  now = new Date(),
  profile,
  taskRunId,
  workspaceId
}: {
  decision: AgentPolicyDecision;
  workspaceId: string;
  mission?: AgentMission | null;
  profile?: AgentProfile | null;
  taskRunId?: string;
  id?: string;
  now?: Date;
}): AgentPolicyEvent {
  const timestamp = now.toISOString();

  return {
    id,
    workspaceId,
    missionId: mission?.id,
    taskRunId,
    profileId: profile?.id,
    severity: policyDecision.severity,
    action: policyDecision.action,
    policyKey: policyDecision.policyKey,
    message: policyDecision.message,
    details: policyDecision.details,
    occurredAt: timestamp,
    createdAt: timestamp
  };
}
