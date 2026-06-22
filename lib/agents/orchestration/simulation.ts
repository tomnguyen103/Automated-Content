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
  isExternalAction,
  type AgentPolicyDecision
} from "@/lib/agents/orchestration/policy";
import {
  createAgentOrchestrationRepositories,
  type AgentOrchestrationRepositories
} from "@/lib/agents/orchestration/repository";
import {
  addUsageEstimate,
  estimateUsageForTask
} from "@/lib/agents/orchestration/usage-estimates";
import type { MissionTaskExecutor } from "@/lib/agents/orchestration/runner";
import { emitAgentOrchestrationEvent } from "@/lib/agents/orchestration/events";
import type { SocialPlatform } from "@/lib/agents/schemas/platform-variant";
import { evaluateProviderHealth } from "@/lib/providers/health";
import {
  defaultProviderByPlatform,
  isProviderCompatibleWithPlatform
} from "@/lib/providers/platform-compatibility";
import { getProviderAdapter, isProviderKey } from "@/lib/providers/registry";
import type { ProviderHealthAccount } from "@/lib/providers/health";
import type { ProviderKey } from "@/lib/providers/types";

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

function readRecordMap(input: Record<string, unknown>, key: string) {
  const value = input[key];

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, Record<string, unknown>] =>
        Boolean(entry[1]) && typeof entry[1] === "object" && !Array.isArray(entry[1])
    )
  );
}

function readBoolean(input: Record<string, unknown>, key: string) {
  const value = input[key];

  return typeof value === "boolean" ? value : false;
}

function readPlatforms(input: Record<string, unknown>) {
  return readStringArray(input, "platforms").filter((platform): platform is SocialPlatform => platform in defaultProviderByPlatform);
}

const providerConnectionStatuses = ["connected", "requires_configuration", "unsupported", "disconnected", "error"] as const;

function readProviderHealthAccount(value: unknown): ProviderHealthAccount | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" && record.id.trim() ? record.id.trim() : null;
  const status = providerConnectionStatuses.find((candidate) => candidate === record.status);

  if (!id || !status) {
    return null;
  }

  const lastValidatedAt =
    record.lastValidatedAt instanceof Date
      ? record.lastValidatedAt
      : typeof record.lastValidatedAt === "string" && record.lastValidatedAt.trim()
        ? new Date(record.lastValidatedAt)
        : null;

  return {
    id,
    status,
    scopes: Array.isArray(record.scopes) ? record.scopes.filter((scope): scope is string => typeof scope === "string") : [],
    capabilities: Array.isArray(record.capabilities)
      ? record.capabilities.filter((capability): capability is string => typeof capability === "string")
      : [],
    lastValidatedAt: lastValidatedAt && !Number.isNaN(lastValidatedAt.getTime()) ? lastValidatedAt : null
  };
}

function resolveConnectedAccountId({
  input,
  platform,
  provider
}: {
  input: Record<string, unknown>;
  platform?: SocialPlatform;
  provider: ProviderKey;
}) {
  const accountByProvider = readStringMap(input, "connectedAccountIdsByProvider");
  const accountByPlatform = readStringMap(input, "connectedAccountIdsByPlatform");

  return (platform ? accountByPlatform[platform] : undefined) ?? accountByProvider[provider] ?? readString(input, "connectedAccountId");
}

function resolveConnectedAccount({
  connectedAccountId,
  input,
  platform,
  provider
}: {
  connectedAccountId?: string;
  input: Record<string, unknown>;
  platform?: SocialPlatform;
  provider: ProviderKey;
}) {
  const accountByProvider = readRecordMap(input, "connectedAccountsByProvider");
  const accountByPlatform = readRecordMap(input, "connectedAccountsByPlatform");
  const account =
    readProviderHealthAccount(platform ? accountByPlatform[platform] : undefined)
    ?? readProviderHealthAccount(accountByProvider[provider])
    ?? readProviderHealthAccount(input.connectedAccount);

  if (!account || (connectedAccountId && account.id !== connectedAccountId)) {
    return null;
  }

  return account;
}

function hasConnectedAccountSelection(input: Record<string, unknown>) {
  return Boolean(
    readString(input, "connectedAccountId")
      || Object.keys(readStringMap(input, "connectedAccountIdsByProvider")).length > 0
      || Object.keys(readStringMap(input, "connectedAccountIdsByPlatform")).length > 0
      || readProviderHealthAccount(input.connectedAccount)
      || Object.keys(readRecordMap(input, "connectedAccountsByProvider")).length > 0
      || Object.keys(readRecordMap(input, "connectedAccountsByPlatform")).length > 0
  );
}

function platformForProvider({
  platformProvider,
  platforms,
  provider,
  providerByPlatform
}: {
  platformProvider?: string;
  platforms: SocialPlatform[];
  provider?: string;
  providerByPlatform: Record<string, string>;
}) {
  return platforms.find((platform) => {
    const mappedProvider = providerByPlatform[platform] ?? provider ?? defaultProviderByPlatform[platform];

    return mappedProvider === platformProvider;
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

function providerReadinessWarningsForTask(mission: AgentMission, task: MissionPlanTask) {
  if (!isExternalAction(task.action)) {
    return [];
  }

  const warnings: string[] = [];
  const provider = readString(mission.inputs, "provider");
  const providerByPlatform = readStringMap(mission.inputs, "providerByPlatform");
  const platforms = readPlatforms(mission.inputs);
  const localPreview = readBoolean(mission.inputs, "localPreview");
  const requiredCapability = task.action === "reply.send" ? "comment_reply" : "scheduled_publish";
  const providers = [
    ...(provider ? [provider] : []),
    ...Object.values(providerByPlatform),
    ...(provider || Object.keys(providerByPlatform).length > 0
      ? []
      : platforms.map((platform) => defaultProviderByPlatform[platform]))
  ];
  const uniqueProviders = [...new Set(providers)];

  if (!provider && Object.keys(providerByPlatform).length === 0) {
    warnings.push("No provider is selected for this external action.");
  }

  if (platforms.length > 0) {
    const hasProviderMap = Object.keys(providerByPlatform).length > 0;

    for (const platform of platforms) {
      const mappedProvider = providerByPlatform[platform] ?? provider ?? (hasProviderMap ? undefined : defaultProviderByPlatform[platform]);

      if (!mappedProvider) {
        warnings.push(`No provider mapping is configured for ${platform}.`);
        continue;
      }

      if (
        isProviderKey(mappedProvider) &&
        !isProviderCompatibleWithPlatform({
          allowMock: localPreview,
          platform,
          provider: mappedProvider
        })
      ) {
        warnings.push(`Provider ${mappedProvider} cannot publish ${platform} variants.`);
      }
    }
  }

  if (!hasConnectedAccountSelection(mission.inputs)) {
    warnings.push("No connected account is selected for readiness validation.");
  }

  for (const providerKey of uniqueProviders) {
    if (!isProviderKey(providerKey)) {
      warnings.push(`Provider ${providerKey} is not registered.`);
      continue;
    }

    const platform = platformForProvider({
      platformProvider: providerKey,
      platforms,
      provider,
      providerByPlatform
    });
    const connectedAccountId = resolveConnectedAccountId({
      input: mission.inputs,
      platform,
      provider: providerKey
    });
    const connectedAccount = resolveConnectedAccount({
      connectedAccountId,
      input: mission.inputs,
      platform,
      provider: providerKey
    });
    const health = evaluateProviderHealth({
      adapter: getProviderAdapter(providerKey),
      allowMock: localPreview,
      connectedAccount,
      connectedAccountId: connectedAccount?.id ?? connectedAccountId ?? null,
      requiredCapability
    });

    if (health.blockingReason) {
      warnings.push(health.blockingReason);
    }

    warnings.push(...health.warnings);
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
        let decision = profile
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
        const preliminaryEstimate = estimateUsageForTask({ decision, mission, task });

        if (profile) {
          decision = evaluateAgentPolicy({
            action: task.action,
            mission,
            profile,
            toolScope: task.toolScope,
            provider: readString(mission.inputs, "provider"),
            platform: readString(mission.inputs, "platform") ?? readStringArray(mission.inputs, "platforms")[0],
            connectedAccountId: readString(mission.inputs, "connectedAccountId"),
            confidence: typeof mission.inputs.confidence === "number" ? mission.inputs.confidence : undefined,
            contentText: readString(mission.inputs, "contentText") ?? mission.brief,
            estimatedCostCents: preliminaryEstimate.estimatedCostCents,
            now: now()
          });
        }
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
