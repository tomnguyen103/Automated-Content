import { afterEach, describe, expect, it, vi } from "vitest";
import {
  agentAutonomyPolicySchema,
  agentMissionSchema,
  agentPolicyEventSchema,
  agentTaskRunSchema
} from "@/lib/agents/schemas/orchestration";
import { evaluateAgentPolicy } from "@/lib/agents/orchestration/policy";
import {
  agentRoleTemplateByRole,
  agentRoleTemplates,
  buildAgentProfileFromTemplate
} from "@/lib/agents/orchestration/role-templates";
import {
  clearAgentOrchestrationRepositoriesForTests,
  createAgentOrchestrationRepositories,
  createDatabaseAgentPolicyEventRepository
} from "@/lib/agents/orchestration/repository";
import {
  pauseAgentMission,
  resumeAgentMission,
  runAgentMission
} from "@/lib/agents/orchestration/runner";

const workspaceId = "00000000-0000-0000-0000-000000000001";
const otherWorkspaceId = "00000000-0000-0000-0000-000000000002";
const timestamp = "2026-06-21T12:00:00.000Z";

describe("agent orchestration foundation", () => {
  afterEach(() => {
    clearAgentOrchestrationRepositoriesForTests();
  });

  it("validates orchestration records and rejects invalid policy states", () => {
    const coordinator = buildAgentProfileFromTemplate({
      role: "coordinator",
      workspaceId,
      createdByUserId: "user_1",
      now: new Date(timestamp)
    });
    const mission = agentMissionSchema.parse({
      id: "mission_1",
      workspaceId,
      createdByUserId: "user_1",
      coordinatorProfileId: coordinator.id,
      missionType: "content_pipeline",
      title: "Launch content mission",
      objective: "Prepare a supervised content campaign.",
      brief: "Coordinate research, strategy, remixing, readiness checks, and reporting.",
      status: "queued",
      priority: 75,
      inputs: {
        topic: "Autonomous content operations"
      },
      context: {},
      policy: agentAutonomyPolicySchema.parse({
        autonomy: "full",
        allowedActions: ["mission.run", "task.execute", "content.generate", "content.publish"],
        allowedToolScopes: ["mission.plan", "strategy.plan", "content.generate", "content.publish"]
      }),
      requestedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    });
    const taskRun = agentTaskRunSchema.parse({
      id: "task_run_1",
      workspaceId,
      missionId: mission.id,
      profileId: coordinator.id,
      taskName: "Plan specialist handoffs",
      status: "queued",
      attemptNumber: 1,
      input: {},
      policySnapshot: mission.policy,
      queuedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    });
    const policyEvent = agentPolicyEventSchema.parse({
      id: "policy_event_1",
      workspaceId,
      missionId: mission.id,
      taskRunId: taskRun.id,
      profileId: coordinator.id,
      severity: "blocked",
      action: "block",
      policyKey: "external_side_effect",
      message: "Publishing requires an explicit human approval workflow.",
      details: {
        attemptedAction: "publish_content"
      },
      occurredAt: timestamp,
      createdAt: timestamp
    });

    expect(mission.status).toBe("queued");
    expect(taskRun.policySnapshot).toMatchObject({
      autonomy: "full",
      allowedActions: ["mission.run", "task.execute", "content.generate", "content.publish"],
      allowedToolScopes: ["mission.plan", "strategy.plan", "content.generate", "content.publish"]
    });
    expect(policyEvent.action).toBe("block");
    expect(() =>
      agentPolicyEventSchema.parse({
        ...policyEvent,
        action: "auto_publish"
      })
    ).toThrow();
  });

  it("ships the seven seeded role templates with full-autonomy policy defaults", () => {
    expect(agentRoleTemplates.map((template) => template.role)).toEqual([
      "coordinator",
      "researcher",
      "strategist",
      "remixer",
      "publisher",
      "engagement",
      "reporter"
    ]);
    expect(Object.keys(agentRoleTemplateByRole).sort()).toEqual(
      agentRoleTemplates.map((template) => template.role).sort()
    );

    for (const template of agentRoleTemplates) {
      expect(template.defaultPolicy).toMatchObject({
        autonomy: "full",
        requiresHumanApproval: false,
        emergencyPaused: false
      });
      expect(template.defaultPolicy.dailyActionCap).toBeGreaterThan(0);
    }
  });

  it("seeds role templates and persists mission records through the shared memory fallback", async () => {
    const repositories = createAgentOrchestrationRepositories({ allowMemoryFallback: true });
    const seeded = await repositories.profiles.seedRoleTemplates({
      workspaceId,
      createdByUserId: "user_1",
      now: new Date(timestamp)
    });
    const coordinator = seeded.find((profile) => profile.role === "coordinator");
    const researcher = seeded.find((profile) => profile.role === "researcher");

    expect(seeded).toHaveLength(7);
    expect(coordinator?.id).toBe(`agent_profile_${workspaceId}_coordinator`);
    expect(await repositories.profiles.get({ workspaceId: otherWorkspaceId, id: coordinator!.id })).toBeNull();

    await repositories.missions.save({
      id: "mission_memory_1",
      workspaceId,
      createdByUserId: "user_1",
      coordinatorProfileId: coordinator!.id,
      missionType: "research_topics",
      title: "Supervised campaign mission",
      objective: "Prepare content without publishing it.",
      brief: "Plan, research, adapt, and report only.",
      status: "draft",
      priority: 50,
      inputs: {},
      context: {},
      policy: agentAutonomyPolicySchema.parse({
        autonomy: "full",
        allowedActions: ["mission.run", "research.collect", "report.generate"],
        allowedToolScopes: ["research.topic", "mission.report"]
      }),
      requestedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    });
    await repositories.taskRuns.save({
      id: "task_run_memory_1",
      workspaceId,
      missionId: "mission_memory_1",
      profileId: researcher!.id,
      taskName: "Collect source notes",
      status: "queued",
      attemptNumber: 1,
      input: {
        topic: "AI content operations"
      },
      policySnapshot: {
        autonomy: "full"
      },
      queuedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    });
    await repositories.policyEvents.record({
      id: "policy_event_memory_1",
      workspaceId,
      missionId: "mission_memory_1",
      taskRunId: "task_run_memory_1",
      profileId: researcher!.id,
      severity: "warning",
      action: "require_review",
      policyKey: "freshness_required",
      message: "Research claims need a fresh source before strategy work.",
      details: {
        sourceCount: 0
      },
      occurredAt: timestamp,
      createdAt: timestamp
    });

    await expect(repositories.missions.list(workspaceId)).resolves.toHaveLength(1);
    await expect(
      repositories.taskRuns.listForMission({
        workspaceId,
        missionId: "mission_memory_1"
      })
    ).resolves.toMatchObject([{ id: "task_run_memory_1" }]);
    await expect(
      repositories.policyEvents.listForMission({
        workspaceId,
        missionId: "mission_memory_1"
      })
    ).resolves.toMatchObject([
      {
        id: "policy_event_memory_1",
        action: "require_review"
      }
    ]);
  });

  it("persists policy events through the database repository", async () => {
    const insertedRows: Record<string, unknown>[] = [];
    const values = vi.fn(async (row: Record<string, unknown>) => {
      insertedRows.push(row);
    });
    const insert = vi.fn(() => ({ values }));
    const repository = createDatabaseAgentPolicyEventRepository({ insert } as never);

    await repository.record({
      id: "policy_event_db_1",
      workspaceId,
      missionId: "mission_db_1",
      taskRunId: "task_run_db_1",
      profileId: `agent_profile_${workspaceId}_publisher`,
      severity: "blocked",
      action: "block",
      policyKey: "publish_requires_review",
      message: "The publisher profile cannot publish directly in Goal 1.",
      details: {
        attemptedAction: "publish_content"
      },
      occurredAt: timestamp,
      createdAt: timestamp
    });

    expect(insert).toHaveBeenCalledOnce();
    expect(values).toHaveBeenCalledOnce();
    const payload = insertedRows[0] as Record<string, unknown> & {
      occurredAt: Date;
      createdAt: Date;
    };

    expect(payload).toMatchObject({
      id: "policy_event_db_1",
      workspaceId,
      missionId: "mission_db_1",
      taskRunId: "task_run_db_1",
      profileId: `agent_profile_${workspaceId}_publisher`,
      severity: "blocked",
      action: "block",
      policyKey: "publish_requires_review",
      details: {
        attemptedAction: "publish_content"
      }
    });
    expect(payload.occurredAt.toISOString()).toBe(timestamp);
    expect(payload.createdAt.toISOString()).toBe(timestamp);
  });

  it("evaluates autonomy policy denials deterministically", () => {
    const engagement = buildAgentProfileFromTemplate({
      role: "engagement",
      workspaceId,
      createdByUserId: "user_1",
      now: new Date(timestamp)
    });

    expect(
      evaluateAgentPolicy({
        action: "reply.send",
        profile: engagement,
        contentText: "We guarantee 100% results.",
        confidence: 0.96,
        now: new Date(timestamp)
      })
    ).toMatchObject({
      allowed: false,
      action: "block",
      policyKey: "blocked_phrase"
    });

    expect(
      evaluateAgentPolicy({
        action: "reply.send",
        profile: {
          ...engagement,
          policy: {
            ...engagement.policy,
            emergencyPaused: true
          }
        },
        confidence: 0.96,
        now: new Date(timestamp)
      })
    ).toMatchObject({
      allowed: false,
      policyKey: "emergency_pause"
    });

    expect(
      evaluateAgentPolicy({
        action: "reply.send",
        profile: engagement,
        confidence: 0.2,
        now: new Date(timestamp)
      })
    ).toMatchObject({
      allowed: false,
      action: "require_review",
      policyKey: "confidence_threshold"
    });
  });

  it("plans, runs, pauses, and resumes autonomous missions through memory repositories", async () => {
    const repositories = createAgentOrchestrationRepositories({ allowMemoryFallback: true });
    const seeded = await repositories.profiles.seedRoleTemplates({
      workspaceId,
      createdByUserId: "user_1",
      now: new Date(timestamp)
    });
    const coordinator = seeded.find((profile) => profile.role === "coordinator")!;
    const createdAt = new Date(timestamp).toISOString();

    await repositories.missions.save({
      id: "mission_runner_1",
      workspaceId,
      createdByUserId: "user_1",
      coordinatorProfileId: coordinator.id,
      missionType: "weekly_report",
      title: "Weekly autonomous report",
      objective: "Summarize agent outcomes.",
      brief: "Compile current mission status, policy decisions, and next steps.",
      status: "queued",
      priority: 50,
      inputs: {},
      context: {},
      policy: agentAutonomyPolicySchema.parse({
        autonomy: "full",
        allowedActions: ["mission.run", "report.generate"],
        allowedToolScopes: ["mission.plan", "mission.report"]
      }),
      requestedAt: createdAt,
      createdAt,
      updatedAt: createdAt
    });

    const result = await runAgentMission({
      workspaceId,
      missionId: "mission_runner_1",
      repositories,
      now: () => new Date(timestamp)
    });

    expect(result.mission.status).toBe("succeeded");
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]).toMatchObject({
      taskName: "Compile weekly operating report",
      status: "succeeded"
    });
    expect(result.policyEvents.map((event) => event.action)).toContain("allow");

    const paused = await pauseAgentMission({
      workspaceId,
      missionId: "mission_runner_1",
      repositories,
      now: () => new Date(timestamp)
    });
    expect(paused).toMatchObject({
      status: "paused",
      policy: {
        emergencyPaused: true
      }
    });

    const resumed = await resumeAgentMission({
      workspaceId,
      missionId: "mission_runner_1",
      repositories,
      now: () => new Date(timestamp)
    });
    expect(resumed).toMatchObject({
      status: "queued",
      policy: {
        emergencyPaused: false
      }
    });
  });
});
