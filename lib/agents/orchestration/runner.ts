import {
  type AgentMission,
  type AgentPolicyEvent,
  type AgentProfile,
  type AgentTaskRun
} from "@/lib/agents/schemas/orchestration";
import {
  createQueuedTaskRun,
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
import { emitAgentOrchestrationEvent } from "@/lib/agents/orchestration/events";
import { estimateUsageForTask } from "@/lib/agents/orchestration/usage-estimates";

export type MissionTaskExecutionContext = {
  mission: AgentMission;
  profile: AgentProfile;
  task: MissionPlanTask;
  taskRun: AgentTaskRun;
  policy: AgentPolicyDecision;
  repositories: AgentOrchestrationRepositories;
  now: () => Date;
};

export type MissionTaskExecutor = (
  context: MissionTaskExecutionContext
) => Promise<Record<string, unknown>> | Record<string, unknown>;

export type RunAgentMissionOptions = {
  workspaceId: string;
  missionId: string;
  repositories?: AgentOrchestrationRepositories;
  executeTask?: MissionTaskExecutor;
  now?: () => Date;
};

export type RunAgentMissionResult = {
  mission: AgentMission;
  tasks: AgentTaskRun[];
  policyEvents: AgentPolicyEvent[];
};

function timestamp(now: () => Date) {
  return now().toISOString();
}

function updateMission(
  mission: AgentMission,
  updates: Partial<AgentMission>,
  now: () => Date
): AgentMission {
  return {
    ...mission,
    ...updates,
    updatedAt: timestamp(now)
  };
}

function updateTaskRun(
  taskRun: AgentTaskRun,
  updates: Partial<AgentTaskRun>,
  now: () => Date
): AgentTaskRun {
  return {
    ...taskRun,
    ...updates,
    updatedAt: timestamp(now)
  };
}

function readOutputAgentRunId(output: Record<string, unknown>) {
  return typeof output.agentRunId === "string" && output.agentRunId.trim() ? output.agentRunId : undefined;
}

function readString(input: Record<string, unknown>, key: string) {
  const value = input[key];

  return typeof value === "string" && value.trim() ? value : undefined;
}

function defaultTaskOutput({ mission, profile, task }: MissionTaskExecutionContext) {
  if (task.action === "research.collect") {
    return {
      summary: `Research notes prepared for ${mission.title}.`,
      topic: readString(mission.inputs, "topic") ?? mission.title,
      sourceCount: Array.isArray(mission.inputs.sources) ? mission.inputs.sources.length : 0
    };
  }

  if (task.action === "content.generate") {
    return {
      summary: "Generated content task is ready for the content pipeline executor.",
      generated: false,
      reason: "No content executor was provided for this run."
    };
  }

  if (task.action === "content.schedule" || task.action === "content.publish") {
    return {
      summary: "Publishing task is ready for the provider pipeline executor.",
      published: false,
      reason: "No publishing executor was provided for this run."
    };
  }

  if (task.action === "reply.send") {
    return {
      summary: "Engagement task is ready for the reply workflow executor.",
      processedComments: 0,
      reason: "No engagement executor was provided for this run."
    };
  }

  if (task.action === "report.generate") {
    return {
      summary: `${profile.name} summarized mission ${mission.title}.`,
      recommendations: [
        "Review policy events before increasing daily caps.",
        "Compare scheduled output with reply outcomes before adding more missions."
      ]
    };
  }

  return {
    summary: `${profile.name} completed ${task.taskName}.`
  };
}

async function recordPolicyDecision({
  decision,
  mission,
  now,
  profile,
  repositories,
  taskRun,
  workspaceId
}: {
  decision: AgentPolicyDecision;
  workspaceId: string;
  mission: AgentMission;
  profile?: AgentProfile | null;
  taskRun?: AgentTaskRun;
  repositories: AgentOrchestrationRepositories;
  now: () => Date;
}) {
  const event = createPolicyEventFromDecision({
    decision,
    mission,
    now: now(),
    profile,
    taskRunId: taskRun?.id,
    workspaceId
  });

  await repositories.policyEvents.record(event);

  emitAgentOrchestrationEvent("agent.policy.evaluated", {
    action: decision.action,
    allowed: decision.allowed,
    missionId: mission.id,
    policyKey: decision.policyKey,
    profileId: profile?.id,
    severity: decision.severity,
    taskRunId: taskRun?.id,
    workspaceId
  });

  return event;
}

export async function runAgentMission({
  executeTask = defaultTaskOutput,
  missionId,
  now = () => new Date(),
  repositories = createAgentOrchestrationRepositories(),
  workspaceId
}: RunAgentMissionOptions): Promise<RunAgentMissionResult> {
  const loadedMission = await repositories.missions.get({ workspaceId, id: missionId });

  if (!loadedMission) {
    throw new Error(`Mission ${missionId} was not found.`);
  }

  if (loadedMission.status === "running") {
    throw new Error(`Mission ${missionId} is already running.`);
  }

  const profiles = await repositories.profiles.list(workspaceId);
  const coordinator = loadedMission.coordinatorProfileId
    ? profiles.find((profile) => profile.id === loadedMission.coordinatorProfileId) ?? null
    : profiles.find((profile) => profile.role === "coordinator") ?? null;
  const missionRunDecision = evaluateAgentPolicy({
    action: "mission.run",
    mission: loadedMission,
    profile: coordinator,
    now: now()
  });
  const policyEvents: AgentPolicyEvent[] = [
    await recordPolicyDecision({
      decision: missionRunDecision,
      mission: loadedMission,
      now,
      profile: coordinator,
      repositories,
      workspaceId
    })
  ];

  if (!missionRunDecision.allowed) {
    const paused = updateMission(
      loadedMission,
      {
        status: "paused",
        error: missionRunDecision.message
      },
      now
    );

    return {
      mission: await repositories.missions.save(paused),
      tasks: [],
      policyEvents
    };
  }

  const runningMission = await repositories.missions.save(
    updateMission(
      loadedMission,
      {
        status: "running",
        startedAt: loadedMission.startedAt ?? timestamp(now),
        error: undefined
      },
      now
    )
  );
  const plan = createMissionPlan(runningMission);
  const createdTasks: AgentTaskRun[] = [];
  const maxTasks = missionRunDecision.policy.maxTasksPerRun;

  emitAgentOrchestrationEvent("agent.mission.started", {
    missionId: runningMission.id,
    missionType: runningMission.missionType,
    taskCount: plan.tasks.length,
    workspaceId
  });

  for (const [taskIndex, task] of plan.tasks.slice(0, maxTasks).entries()) {
    const profile = selectProfileForTask({ profiles, role: task.role });

    if (!profile) {
      const failedMission = await repositories.missions.save(
        updateMission(
          runningMission,
          {
            status: "failed",
            error: `No ${task.role} profile is available for ${task.taskName}.`
          },
          now
        )
      );

      return {
        mission: failedMission,
        tasks: createdTasks,
        policyEvents
      };
    }

    let taskRun = await repositories.taskRuns.save(
      createQueuedTaskRun({
        mission: runningMission,
        now: now(),
        profile,
        task,
        taskIndex
      })
    );
    let policy = evaluateAgentPolicy({
      action: task.action,
      mission: runningMission,
      profile,
      toolScope: task.toolScope,
      provider: readString(runningMission.inputs, "provider"),
      platform: readString(runningMission.inputs, "platform"),
      connectedAccountId: readString(runningMission.inputs, "connectedAccountId"),
      confidence: typeof runningMission.inputs.confidence === "number" ? runningMission.inputs.confidence : undefined,
      contentText: readString(runningMission.inputs, "contentText") ?? runningMission.brief,
      now: now()
    });
    const preliminaryEstimate = estimateUsageForTask({
      decision: policy,
      mission: runningMission,
      task
    });

    policy = evaluateAgentPolicy({
      action: task.action,
      mission: runningMission,
      profile,
      toolScope: task.toolScope,
      provider: readString(runningMission.inputs, "provider"),
      platform: readString(runningMission.inputs, "platform"),
      connectedAccountId: readString(runningMission.inputs, "connectedAccountId"),
      confidence: typeof runningMission.inputs.confidence === "number" ? runningMission.inputs.confidence : undefined,
      contentText: readString(runningMission.inputs, "contentText") ?? runningMission.brief,
      estimatedCostCents: preliminaryEstimate.estimatedCostCents,
      now: now()
    });

    policyEvents.push(
      await recordPolicyDecision({
        decision: policy,
        mission: runningMission,
        now,
        profile,
        repositories,
        taskRun,
        workspaceId
      })
    );

    if (!policy.allowed) {
      taskRun = await repositories.taskRuns.save(
        updateTaskRun(
          taskRun,
          {
            status: "skipped",
            output: {
              estimatedUsage: preliminaryEstimate,
              policy: {
                action: policy.action,
                key: policy.policyKey,
                message: policy.message
              }
            },
            completedAt: timestamp(now)
          },
          now
        )
      );
      createdTasks.push(taskRun);
      continue;
    }

    taskRun = await repositories.taskRuns.save(
      updateTaskRun(
        taskRun,
        {
          status: "running",
          startedAt: timestamp(now)
        },
        now
      )
    );

    try {
      const output = await executeTask({
        mission: runningMission,
        now,
        policy,
        profile,
        repositories,
        task,
        taskRun
      });

      taskRun = await repositories.taskRuns.save(
        updateTaskRun(
          taskRun,
          {
            agentRunId: readOutputAgentRunId(output) ?? taskRun.agentRunId,
            status: "succeeded",
            output,
            completedAt: timestamp(now)
          },
          now
        )
      );
      createdTasks.push(taskRun);

      emitAgentOrchestrationEvent("agent.task.succeeded", {
        missionId: runningMission.id,
        profileId: profile.id,
        taskName: task.taskName,
        taskRunId: taskRun.id,
        workspaceId
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown mission task error.";
      taskRun = await repositories.taskRuns.save(
        updateTaskRun(
          taskRun,
          {
            status: "failed",
            error: message,
            completedAt: timestamp(now)
          },
          now
        )
      );
      createdTasks.push(taskRun);

      const failedMission = await repositories.missions.save(
        updateMission(
          runningMission,
          {
            status: "failed",
            error: message,
            completedAt: timestamp(now)
          },
          now
        )
      );

      emitAgentOrchestrationEvent("agent.task.failed", {
        error: message,
        missionId: runningMission.id,
        profileId: profile.id,
        taskName: task.taskName,
        taskRunId: taskRun.id,
        workspaceId
      });

      return {
        mission: failedMission,
        tasks: createdTasks,
        policyEvents
      };
    }
  }

  const finalStatus = "succeeded";
  const completedMission = await repositories.missions.save(
    updateMission(
      runningMission,
      {
        status: finalStatus,
        completedAt: timestamp(now),
        result: {
          taskCount: createdTasks.length,
          succeeded: createdTasks.filter((task) => task.status === "succeeded").length,
          skipped: createdTasks.filter((task) => task.status === "skipped").length,
          failed: createdTasks.filter((task) => task.status === "failed").length,
          taskOutputs: createdTasks.map((task) => ({
            id: task.id,
            taskName: task.taskName,
            status: task.status,
            agentRunId: task.agentRunId,
            output: task.output
          }))
        }
      },
      now
    )
  );

  emitAgentOrchestrationEvent("agent.mission.completed", {
    missionId: completedMission.id,
    missionType: completedMission.missionType,
    status: completedMission.status,
    taskCount: createdTasks.length,
    workspaceId
  });

  return {
    mission: completedMission,
    tasks: createdTasks,
    policyEvents
  };
}

export async function pauseAgentMission({
  missionId,
  now = () => new Date(),
  repositories = createAgentOrchestrationRepositories(),
  workspaceId
}: Omit<RunAgentMissionOptions, "executeTask">) {
  const mission = await repositories.missions.get({ workspaceId, id: missionId });

  if (!mission) {
    throw new Error(`Mission ${missionId} was not found.`);
  }

  return repositories.missions.save(
    updateMission(
      mission,
      {
        status: "paused",
        policy: {
          ...mission.policy,
          emergencyPaused: true
        }
      },
      now
    )
  );
}

export async function resumeAgentMission({
  missionId,
  now = () => new Date(),
  repositories = createAgentOrchestrationRepositories(),
  workspaceId
}: Omit<RunAgentMissionOptions, "executeTask">) {
  const mission = await repositories.missions.get({ workspaceId, id: missionId });

  if (!mission) {
    throw new Error(`Mission ${missionId} was not found.`);
  }

  return repositories.missions.save(
    updateMission(
      mission,
      {
        status: "queued",
        error: undefined,
        policy: {
          ...mission.policy,
          emergencyPaused: false
        }
      },
      now
    )
  );
}
