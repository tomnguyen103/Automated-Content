import {
  type AgentActionType,
  type AgentMission,
  type AgentMissionSimulationRun,
  type AgentPolicyEvent,
  type AgentProfile,
  type AgentSimulationPlannedAction,
  type AgentSimulationRiskLevel,
  type AgentSimulationUsageEstimate,
  agentMissionSimulationRunSchema,
  agentSimulationUsageEstimateSchema
} from "@/lib/agents/schemas/orchestration";
import {
  createMissionPlan,
  selectProfileForTask,
  type MissionPlanTask
} from "@/lib/agents/orchestration/planner";
import {
  createPolicyEventFromDecision,
  evaluateAgentPolicy,
  type AgentPolicyDecision
} from "@/lib/agents/orchestration/policy";
import {
  createAgentOrchestrationRepositories,
  type AgentOrchestrationRepositories
} from "@/lib/agents/orchestration/repository";
import type { MissionTaskExecutor } from "@/lib/agents/orchestration/runner";
import { emitAgentOrchestrationEvent } from "@/lib/agents/orchestration/events";

export type SimulateAgentMissionOptions = {
  workspaceId: string;
  missionId: string;
  requestedByUserId?: string;
  repositories?: AgentOrchestrationRepositories;
  executeTask?: MissionTaskExecutor;
  now?: () => Date;
};

export type SimulateAgentMissionResult = {
  mission: AgentMission;
  simulationRun: AgentMissionSimulationRun;
  policyEvents: AgentPolicyEvent[];
};

export class AgentMissionNotFoundError extends Error {
  constructor(missionId: string) {
    super(`Mission ${missionId} was not found.`);
    this.name = "AgentMissionNotFoundError";
  }
}

function timestamp(now: () => Date) {
  return now().toISOString();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown mission simulation error.";
}

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

function readStringMap(input: Record<string, unknown>, key: string) {
  const value = input[key];

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0)
      .map(([mapKey, mapValue]) => [mapKey, mapValue.trim()])
  );
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

function addUsageEstimate(
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

function estimateUsageForTask({
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

function suppressedSideEffectsForTask(task: MissionPlanTask) {
  if (task.action === "content.generate") {
    return ["model call", "usage ledger write", "draft write"];
  }

  if (task.action === "content.schedule") {
    return ["scheduled job write", "usage ledger write"];
  }

  if (task.action === "content.publish") {
    return ["scheduled job write", "publish queue enqueue", "usage ledger write"];
  }

  if (task.action === "reply.send") {
    return ["reply attempt write", "provider reply send", "usage ledger write"];
  }

  if (task.action === "research.collect" || task.action === "report.generate" || task.action === "task.execute") {
    return ["model call"];
  }

  return [];
}

function suppressedSideEffectsForDecision(task: MissionPlanTask, decision: AgentPolicyDecision) {
  return decision.allowed || decision.action === "require_review" ? suppressedSideEffectsForTask(task) : [];
}

function plannedActionStatus(decision: AgentPolicyDecision): AgentSimulationPlannedAction["status"] {
  if (decision.allowed) {
    return "would_run";
  }

  return decision.action === "require_review" ? "would_require_review" : "blocked";
}

function isExternalPlannedAction(task: MissionPlanTask) {
  return task.action === "content.schedule" || task.action === "content.publish" || task.action === "reply.send";
}

function providerReadinessWarningsForTask(mission: AgentMission, task: MissionPlanTask) {
  if (!isExternalPlannedAction(task)) {
    return [];
  }

  const warnings: string[] = [];
  const provider = readString(mission.inputs, "provider");
  const providerByPlatform = readStringMap(mission.inputs, "providerByPlatform");
  const platforms = readStringArray(mission.inputs, "platforms");
  const connectedAccountId = readString(mission.inputs, "connectedAccountId");
  const providers = [
    ...(provider ? [provider] : []),
    ...Object.values(providerByPlatform)
  ];
  const uniqueProviders = [...new Set(providers)];

  if (!provider && uniqueProviders.length === 0) {
    warnings.push("No provider is selected for this external action.");
  }

  if (platforms.length > 0 && Object.keys(providerByPlatform).length > 0) {
    for (const platform of platforms) {
      if (!providerByPlatform[platform]) {
        warnings.push(`No provider mapping is configured for ${platform}.`);
      }
    }
  }

  if (!connectedAccountId) {
    warnings.push("No connected account is selected for readiness validation.");
  }

  if (uniqueProviders.includes("mock")) {
    warnings.push("Mock provider readiness is local-preview only.");
  }

  if (uniqueProviders.some((candidate) => candidate !== "mock")) {
    warnings.push("Provider health has not been checked by a live readiness sentinel yet.");
  }

  return [...new Set(warnings)];
}

function blockedReasonsForDecision(decision: AgentPolicyDecision) {
  return decision.action === "block" ? [decision.message] : [];
}

function riskLevelForAction({
  decision,
  task,
  providerReadinessWarnings
}: {
  decision: AgentPolicyDecision;
  task: MissionPlanTask;
  providerReadinessWarnings: string[];
}): AgentSimulationRiskLevel {
  if (decision.action === "block") {
    return "blocked";
  }

  if (decision.action === "require_review" || task.action === "content.publish" || task.action === "reply.send") {
    return "high";
  }

  if (task.action === "content.schedule" || providerReadinessWarnings.length > 0) {
    return "medium";
  }

  return "low";
}

function createSimulationPolicyEvent({
  decision,
  mission,
  now,
  plannedActionId,
  profile,
  simulationRunId,
  task
}: {
  decision: AgentPolicyDecision;
  mission: AgentMission;
  now: Date;
  plannedActionId?: string;
  profile?: AgentProfile | null;
  simulationRunId: string;
  task?: MissionPlanTask;
}) {
  const event = createPolicyEventFromDecision({
    decision,
    mission,
    now,
    profile,
    workspaceId: mission.workspaceId
  });

  return {
    ...event,
    details: {
      ...event.details,
      plannedActionId,
      simulatedAction: task?.action,
      simulation: true,
      simulationRunId,
      taskName: task?.taskName
    }
  };
}

function createMissingProfileDecision({
  action,
  role,
  mission
}: {
  action: AgentActionType;
  role: string;
  mission: AgentMission;
}): AgentPolicyDecision {
  return {
    allowed: false,
    action: "block",
    severity: "blocked",
    policyKey: "profile_missing",
    message: `No ${role} profile is available for this simulated action.`,
    details: {
      action,
      role
    },
    policy: mission.policy
  };
}

function createSimulationSummary({
  estimatedUsage,
  plannedActions,
  policyEvents
}: {
  estimatedUsage: AgentSimulationUsageEstimate;
  plannedActions: AgentSimulationPlannedAction[];
  policyEvents: AgentPolicyEvent[];
}) {
  const blockedActions = plannedActions.filter((action) => action.status === "blocked").length;
  const approvalRequiredCount = plannedActions.filter((action) => action.approvalRequired).length
    + policyEvents.filter((event) => {
      const details = isRecord(event.details) ? event.details : {};

      return event.action === "require_review" && typeof details.plannedActionId !== "string";
    }).length;
  const policyBlocks = policyEvents.filter((event) => event.severity === "blocked").length;
  const blockedReasonCount = plannedActions.reduce((sum, action) => sum + action.blockedReasons.length, 0)
    + policyEvents.filter((event) => {
      const details = isRecord(event.details) ? event.details : {};

      return event.severity === "blocked" && typeof details.plannedActionId !== "string";
    }).length;
  const providerReadinessWarnings = [
    ...new Set(plannedActions.flatMap((action) => action.providerReadinessWarnings))
  ];
  const riskOrder: AgentSimulationRiskLevel[] = ["low", "medium", "high", "blocked"];
  const riskLevel = plannedActions.reduce<AgentSimulationRiskLevel>((current, action) => {
    return riskOrder.indexOf(action.riskLevel) > riskOrder.indexOf(current) ? action.riskLevel : current;
  }, policyBlocks > 0 ? "blocked" : approvalRequiredCount > 0 ? "high" : "low");

  return {
    allowedActions: plannedActions.filter((action) => action.status === "would_run").length,
    approvalRequiredCount,
    blockedActions,
    blockedReasonCount,
    policyBlocks,
    providerReadinessWarnings,
    promotable:
      plannedActions.length > 0
      && approvalRequiredCount === 0
      && blockedReasonCount === 0
      && providerReadinessWarnings.length === 0,
    riskLevel,
    reviewRequiredActions: approvalRequiredCount,
    sideEffectsSuppressed: estimatedUsage.sideEffectsSuppressed,
    taskCount: plannedActions.length
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function simulateAgentMission({
  missionId,
  now = () => new Date(),
  repositories = createAgentOrchestrationRepositories(),
  requestedByUserId,
  workspaceId
}: SimulateAgentMissionOptions): Promise<SimulateAgentMissionResult> {
  const mission = await repositories.missions.get({ workspaceId, id: missionId });

  if (!mission) {
    throw new AgentMissionNotFoundError(missionId);
  }

  const simulationRunId = `agent_sim_${crypto.randomUUID()}`;
  const plannedActions: AgentSimulationPlannedAction[] = [];
  const policyEvents: AgentPolicyEvent[] = [];
  let estimatedUsage = agentSimulationUsageEstimateSchema.parse({});

  try {
    const profiles = await repositories.profiles.list(workspaceId);
    const coordinator = mission.coordinatorProfileId
      ? profiles.find((profile) => profile.id === mission.coordinatorProfileId) ?? null
      : profiles.find((profile) => profile.role === "coordinator") ?? null;
    const missionDecision = evaluateAgentPolicy({
      action: "mission.run",
      mission,
      profile: coordinator,
      now: now()
    });

    policyEvents.push(
      createSimulationPolicyEvent({
        decision: missionDecision,
        mission,
        now: now(),
        profile: coordinator,
        simulationRunId
      })
    );

    if (missionDecision.allowed) {
      const plan = createMissionPlan(mission);

      for (const [taskIndex, task] of plan.tasks.slice(0, missionDecision.policy.maxTasksPerRun).entries()) {
        const profile = selectProfileForTask({ profiles, role: task.role });
        const plannedActionId = `sim_action_${crypto.randomUUID()}`;
        const decision = profile
          ? evaluateAgentPolicy({
              action: task.action,
              mission,
              profile,
              toolScope: task.toolScope,
              provider: readString(mission.inputs, "provider"),
              platform: readString(mission.inputs, "platform") ?? readStringArray(mission.inputs, "platforms")[0],
              connectedAccountId: readString(mission.inputs, "connectedAccountId"),
              confidence: typeof mission.inputs.confidence === "number" ? mission.inputs.confidence : undefined,
              contentText: readString(mission.inputs, "contentText") ?? mission.brief,
              now: now()
            })
          : createMissingProfileDecision({
              action: task.action,
              mission,
              role: task.role
            });
        const taskEstimate = estimateUsageForTask({ decision, mission, task });
        const providerReadinessWarnings = providerReadinessWarningsForTask(mission, task);
        const blockedReasons = blockedReasonsForDecision(decision);
        const policyEvent = createSimulationPolicyEvent({
          decision,
          mission,
          now: now(),
          plannedActionId,
          profile,
          simulationRunId,
          task
        });

        estimatedUsage = addUsageEstimate(estimatedUsage, taskEstimate);
        policyEvents.push(policyEvent);
        plannedActions.push(
          {
            id: plannedActionId,
            taskIndex,
            role: task.role,
            taskName: task.taskName,
            action: task.action,
            toolScope: task.toolScope,
            input: task.input,
            profileId: profile?.id,
            profileName: profile?.name,
            status: plannedActionStatus(decision),
            policy: {
              allowed: decision.allowed,
              action: decision.action,
              severity: decision.severity,
              policyKey: decision.policyKey,
              message: decision.message
            },
            estimatedUsage: taskEstimate,
            suppressedSideEffects: suppressedSideEffectsForDecision(task, decision),
            approvalRequired: decision.action === "require_review",
            blockedReasons,
            providerReadinessWarnings,
            promotable: decision.allowed && blockedReasons.length === 0 && providerReadinessWarnings.length === 0,
            riskLevel: riskLevelForAction({ decision, providerReadinessWarnings, task })
          }
        );
      }
    }

    const simulationRun = agentMissionSimulationRunSchema.parse({
      id: simulationRunId,
      workspaceId,
      missionId,
      requestedByUserId,
      status: "succeeded",
      plannedActions,
      policyEvents,
      estimatedUsage,
      summary: createSimulationSummary({ estimatedUsage, plannedActions, policyEvents }),
      createdAt: timestamp(now),
      completedAt: timestamp(now)
    });

    for (const policyEvent of policyEvents) {
      await repositories.policyEvents.record(policyEvent);
    }

    const savedSimulation = await repositories.simulationRuns.save(simulationRun);

    emitAgentOrchestrationEvent("agent.mission.simulated", {
      missionId,
      policyEventCount: policyEvents.length,
      plannedActionCount: plannedActions.length,
      simulationRunId: savedSimulation.id,
      sideEffectsSuppressed: estimatedUsage.sideEffectsSuppressed,
      workspaceId
    });

    return {
      mission,
      simulationRun: savedSimulation,
      policyEvents
    };
  } catch (error) {
    const message = errorMessage(error);
    const failedSimulation = agentMissionSimulationRunSchema.parse({
      id: simulationRunId,
      workspaceId,
      missionId,
      requestedByUserId,
      status: "failed",
      plannedActions,
      policyEvents,
      estimatedUsage,
      summary: {
        ...createSimulationSummary({ estimatedUsage, plannedActions, policyEvents }),
        error: message
      },
      error: message,
      createdAt: timestamp(now),
      completedAt: timestamp(now)
    });
    try {
      const savedFailure = await repositories.simulationRuns.save(failedSimulation);

      emitAgentOrchestrationEvent("agent.mission.simulated", {
        error: message,
        missionId,
        policyEventCount: policyEvents.length,
        plannedActionCount: plannedActions.length,
        simulationRunId: savedFailure.id,
        sideEffectsSuppressed: estimatedUsage.sideEffectsSuppressed,
        status: "failed",
        workspaceId
      });

      return {
        mission,
        simulationRun: savedFailure,
        policyEvents
      };
    } catch (persistenceError) {
      const persistenceMessage = errorMessage(persistenceError);

      emitAgentOrchestrationEvent("agent.mission.simulated", {
        error: message,
        missionId,
        persistenceError: persistenceMessage,
        policyEventCount: policyEvents.length,
        plannedActionCount: plannedActions.length,
        sideEffectsSuppressed: estimatedUsage.sideEffectsSuppressed,
        status: "failed",
        workspaceId
      });

      throw new Error(
        `Mission simulation failed: ${message}. Failed to persist simulation failure: ${persistenceMessage}`
      );
    }
  }
}
