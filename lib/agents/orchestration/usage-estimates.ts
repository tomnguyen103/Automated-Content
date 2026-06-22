import {
  agentSimulationUsageEstimateSchema,
  type AgentMission,
  type AgentSimulationUsageEstimate
} from "@/lib/agents/schemas/orchestration";
import type { MissionPlanTask } from "@/lib/agents/orchestration/planner";
import type { AgentPolicyDecision } from "@/lib/agents/orchestration/policy";

function readString(input: Record<string, unknown>, key: string) {
  const value = input[key];

  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readNumber(input: Record<string, unknown>, key: string) {
  const value = input[key];

  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readStringArray(input: Record<string, unknown>, key: string) {
  const value = input[key];

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
}

function estimatePlatformActionCount(mission: AgentMission) {
  const platformVariantIds = readStringArray(mission.inputs, "platformVariantIds");

  if (platformVariantIds.length > 0) {
    return platformVariantIds.length;
  }

  const platforms = readStringArray(mission.inputs, "platforms");

  if (platforms.length > 0) {
    return platforms.length;
  }

  return readString(mission.inputs, "platform") ? 1 : 0;
}

function estimateCommentActionCount(mission: AgentMission, decision: AgentPolicyDecision) {
  const requested = readNumber(mission.inputs, "maxComments") ?? decision.policy.dailyActionCap;

  return Math.max(0, Math.min(Math.floor(requested), decision.policy.dailyActionCap));
}

export function addUsageEstimate(
  current: AgentSimulationUsageEstimate,
  next: AgentSimulationUsageEstimate
): AgentSimulationUsageEstimate {
  return agentSimulationUsageEstimateSchema.parse({
    modelCalls: current.modelCalls + next.modelCalls,
    toolCalls: current.toolCalls + next.toolCalls,
    estimatedCostCents: current.estimatedCostCents + next.estimatedCostCents,
    usageLedgerWrites: current.usageLedgerWrites + next.usageLedgerWrites,
    scheduledPostWrites: current.scheduledPostWrites + next.scheduledPostWrites,
    publishEnqueues: current.publishEnqueues + next.publishEnqueues,
    replySends: current.replySends + next.replySends,
    providerRequests: current.providerRequests + next.providerRequests,
    sideEffectsSuppressed: current.sideEffectsSuppressed + next.sideEffectsSuppressed
  });
}

function estimateSideEffectCount(estimate: Omit<AgentSimulationUsageEstimate, "sideEffectsSuppressed">) {
  return (
    estimate.modelCalls
    + estimate.usageLedgerWrites
    + estimate.scheduledPostWrites
    + estimate.publishEnqueues
    + estimate.replySends
    + estimate.providerRequests
  );
}

export function estimateUsageForTask({
  decision,
  mission,
  task
}: {
  decision: AgentPolicyDecision;
  mission: AgentMission;
  task: MissionPlanTask;
}): AgentSimulationUsageEstimate {
  const base = {
    modelCalls: 0,
    toolCalls: 0,
    estimatedCostCents: 0,
    usageLedgerWrites: 0,
    scheduledPostWrites: 0,
    publishEnqueues: 0,
    replySends: 0,
    providerRequests: 0
  };

  if (!decision.allowed && decision.action !== "require_review") {
    return agentSimulationUsageEstimateSchema.parse({
      ...base,
      sideEffectsSuppressed: 0
    });
  }

  const platformActionCount = estimatePlatformActionCount(mission);
  const commentActionCount = estimateCommentActionCount(mission, decision);

  if (task.action === "research.collect") {
    return agentSimulationUsageEstimateSchema.parse({
      ...base,
      modelCalls: 1,
      toolCalls: 1,
      estimatedCostCents: 1,
      sideEffectsSuppressed: 1
    });
  }

  if (task.action === "content.generate") {
    return agentSimulationUsageEstimateSchema.parse({
      ...base,
      modelCalls: 1,
      toolCalls: 4,
      estimatedCostCents: 4,
      usageLedgerWrites: 1,
      sideEffectsSuppressed: 2
    });
  }

  if (task.action === "content.schedule" || task.action === "content.publish") {
    const count = Math.max(1, platformActionCount);
    const estimate = {
      ...base,
      usageLedgerWrites: count,
      scheduledPostWrites: count,
      publishEnqueues: task.action === "content.publish" ? count : 0
    };

    return agentSimulationUsageEstimateSchema.parse({
      ...estimate,
      sideEffectsSuppressed: estimateSideEffectCount(estimate)
    });
  }

  if (task.action === "reply.send") {
    const estimate = {
      ...base,
      modelCalls: commentActionCount,
      toolCalls: commentActionCount * 3,
      estimatedCostCents: commentActionCount * 2,
      usageLedgerWrites: commentActionCount,
      replySends: commentActionCount,
      providerRequests: commentActionCount
    };

    return agentSimulationUsageEstimateSchema.parse({
      ...estimate,
      sideEffectsSuppressed: estimateSideEffectCount(estimate)
    });
  }

  if (task.action === "report.generate" || task.action === "task.execute") {
    return agentSimulationUsageEstimateSchema.parse({
      ...base,
      modelCalls: 1,
      estimatedCostCents: 1,
      sideEffectsSuppressed: 1
    });
  }

  return agentSimulationUsageEstimateSchema.parse({
    ...base,
    sideEffectsSuppressed: 0
  });
}
