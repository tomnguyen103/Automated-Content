import { afterEach, describe, expect, it, vi } from "vitest";
import { agentPolicyEvents } from "@/db/schema";
import { agentRunSchema } from "@/lib/agents/schemas/agent-run";
import { contentPackSchema } from "@/lib/agents/schemas/content-pack";
import {
  agentAutonomyPolicySchema,
  defaultAgentAutonomyPolicy,
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
  AGENT_MISSION_HISTORY_LIMIT,
  AGENT_POLICY_EVENT_HISTORY_LIMIT,
  AGENT_TASK_RUN_HISTORY_LIMIT,
  clearAgentOrchestrationRepositoriesForTests,
  createAgentOrchestrationRepositories,
  createDatabaseAgentPolicyEventRepository
} from "@/lib/agents/orchestration/repository";
import {
  pauseAgentMission,
  resumeAgentMission,
  runAgentMission
} from "@/lib/agents/orchestration/runner";
import { simulateAgentMission } from "@/lib/agents/orchestration/simulation";
import { createAutonomousMissionTaskExecutor } from "@/lib/agents/orchestration/executors";
import type { AnalyticsSnapshot } from "@/lib/analytics/metrics";

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

  it("ships the seven seeded role templates with supervised external-action defaults", () => {
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

    expect(defaultAgentAutonomyPolicy.autonomy).toBe("supervised");

    for (const template of agentRoleTemplates) {
      const supervisesExternalActions = template.role === "publisher" || template.role === "engagement";

      expect(template.defaultPolicy).toMatchObject({
        autonomy: supervisesExternalActions ? "supervised" : "full",
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
    const limit = vi.fn(async () => [{ id: `agent_profile_${workspaceId}_publisher` }]);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where }));
    const select = vi.fn(() => ({ from }));
    const repository = createDatabaseAgentPolicyEventRepository({ insert, select } as never);

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
    expect(insert).toHaveBeenCalledWith(agentPolicyEvents);
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
    const publisher = buildAgentProfileFromTemplate({
      role: "publisher",
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

    expect(
      evaluateAgentPolicy({
        action: "content.publish",
        profile: publisher,
        confidence: 0.96,
        now: new Date(timestamp)
      })
    ).toMatchObject({
      allowed: false,
      action: "require_review",
      policyKey: "supervised_external_action"
    });

    expect(
      evaluateAgentPolicy({
        action: "task.execute",
        profile: publisher,
        now: new Date(timestamp)
      })
    ).toMatchObject({
      allowed: true,
      action: "allow"
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
  });

  it("compiles weekly operator reports with simulations, policy events, usage, and caveats", async () => {
    const repositories = createAgentOrchestrationRepositories({ allowMemoryFallback: true });
    const seeded = await repositories.profiles.seedRoleTemplates({
      workspaceId,
      createdByUserId: "user_1",
      now: new Date(timestamp)
    });
    const coordinator = seeded.find((profile) => profile.role === "coordinator")!;
    const policy = agentAutonomyPolicySchema.parse({
      autonomy: "full",
      allowedActions: ["mission.run", "report.generate"],
      allowedToolScopes: ["mission.plan", "mission.report"]
    });
    const snapshot = {
      generatedAt: timestamp,
      posting: {
        total: 6,
        scheduled: 2,
        queued: 1,
        publishing: 0,
        published: 2,
        failed: 1,
        canceled: 0
      },
      failures: {
        total: 3,
        publishing: 1,
        replies: 1,
        agents: 1
      },
      replies: {
        comments: 9,
        matched: 5,
        awaitingApproval: 2,
        sent: 3,
        failed: 1
      },
      usage: {
        totalQuantity: 14,
        byType: [
          {
            type: "ai_generation",
            label: "AI generations",
            quantity: 8
          },
          {
            type: "auto_reply",
            label: "Auto replies",
            quantity: 6
          }
        ],
        daily: [
          {
            date: "2026-06-20",
            label: "Jun 20",
            quantity: 14
          }
        ]
      },
      agents: {
        total: 4,
        running: 0,
        succeeded: 3,
        failed: 1,
        averageToolCalls: 2.25,
        recent: [
          {
            id: "run_recent_report_1",
            traceId: "trace_recent_report_1",
            status: "failed",
            provider: "gemini",
            model: "mock-gemini",
            toolCallCount: 2,
            durationMs: 1000,
            startedAt: timestamp,
            completedAt: "2026-06-21T12:00:01.000Z",
            error: "Provider metrics unavailable"
          }
        ]
      },
      platformBreakdown: [
        {
          platform: "LinkedIn",
          posts: 4,
          published: 2,
          comments: 5,
          replies: 2,
          failures: 1
        }
      ]
    } satisfies AnalyticsSnapshot;

    await repositories.missions.save({
      id: "mission_report_source_1",
      workspaceId,
      createdByUserId: "user_1",
      coordinatorProfileId: coordinator.id,
      missionType: "content_pipeline",
      title: "Campaign source mission",
      objective: "Provide evidence for reporting.",
      brief: "A mission with review-gated scheduling evidence.",
      status: "paused",
      priority: 70,
      inputs: {},
      context: {},
      policy,
      requestedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    });
    await repositories.policyEvents.record({
      id: "policy_report_source_1",
      workspaceId,
      missionId: "mission_report_source_1",
      severity: "warning",
      action: "require_review",
      policyKey: "supervised_external_action",
      message: "Schedule suggestion needs approval before writing a durable job.",
      details: {},
      occurredAt: timestamp,
      createdAt: timestamp
    });
    await repositories.simulationRuns.save({
      id: "simulation_report_source_1",
      workspaceId,
      missionId: "mission_report_source_1",
      requestedByUserId: "user_1",
      status: "succeeded",
      plannedActions: [],
      policyEvents: [],
      estimatedUsage: {
        modelCalls: 0,
        toolCalls: 0,
        estimatedCostCents: 0,
        usageLedgerWrites: 0,
        scheduledPostWrites: 0,
        publishEnqueues: 0,
        replySends: 0,
        providerRequests: 0,
        sideEffectsSuppressed: 3
      },
      summary: {
        riskLevel: "high",
        approvalRequiredCount: 1
      },
      createdAt: timestamp,
      completedAt: timestamp
    });
    await repositories.policyEvents.record({
      id: "policy_report_stale_1",
      workspaceId,
      missionId: "mission_report_source_1",
      severity: "warning",
      action: "require_review",
      policyKey: "stale_policy_event",
      message: "This older event should not appear in a trailing 7-day report.",
      details: {},
      occurredAt: "2026-06-01T12:00:00.000Z",
      createdAt: "2026-06-01T12:00:00.000Z"
    });
    await repositories.simulationRuns.save({
      id: "simulation_report_stale_1",
      workspaceId,
      missionId: "mission_report_source_1",
      requestedByUserId: "user_1",
      status: "failed",
      plannedActions: [],
      policyEvents: [],
      estimatedUsage: {
        modelCalls: 0,
        toolCalls: 0,
        estimatedCostCents: 0,
        usageLedgerWrites: 0,
        scheduledPostWrites: 0,
        publishEnqueues: 0,
        replySends: 0,
        providerRequests: 0,
        sideEffectsSuppressed: 0
      },
      summary: {
        riskLevel: "blocked",
        approvalRequiredCount: 0
      },
      error: "stale simulation failure",
      createdAt: "2026-06-01T12:00:00.000Z",
      completedAt: "2026-06-01T12:01:00.000Z"
    });
    await repositories.missions.save({
      id: "mission_weekly_operator_report_1",
      workspaceId,
      createdByUserId: "user_1",
      coordinatorProfileId: coordinator.id,
      missionType: "weekly_report",
      title: "Weekly operator report",
      objective: "Summarize operations for human review.",
      brief: "Compile posting, replies, failures, usage, simulations, agent runs, and policy events.",
      status: "queued",
      priority: 50,
      inputs: {},
      context: {},
      policy,
      requestedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    const result = await runAgentMission({
      workspaceId,
      missionId: "mission_weekly_operator_report_1",
      repositories,
      executeTask: createAutonomousMissionTaskExecutor({
        allowMemoryFallback: true,
        getAnalyticsSnapshot: vi.fn(async () => snapshot)
      }),
      now: () => new Date(timestamp)
    });
    const reportOutput = result.tasks[0].output as Record<string, unknown>;

    expect(result.mission.status).toBe("succeeded");
    expect(reportOutput).toMatchObject({
      report: {
        period: {
          timezone: "UTC"
        },
        posting: {
          published: 2,
          failed: 1,
          pending: 3
        },
        replies: {
          awaitingApproval: 2,
          sent: 3
        },
        failures: {
          total: 3,
          failedSimulations: 0
        },
        usage: {
          totalQuantity: 14
        },
        simulations: {
          total: 1,
          riskCounts: {
            high: 1
          }
        },
        agentRuns: {
          total: 4,
          failed: 1
        },
        policy: {
          reviewRequired: 1
        },
        providerMetricsCaveat: expect.stringContaining("Provider metrics")
      },
      policyEvents: expect.arrayContaining([
        expect.objectContaining({
          missionId: "mission_report_source_1",
          policyKey: "supervised_external_action"
        })
      ])
    });
    expect(reportOutput).toMatchObject({
      report: {
        simulations: {
          total: 1,
          riskCounts: expect.not.objectContaining({
            blocked: expect.any(Number)
          })
        },
        failures: {
          failedSimulations: 0
        },
        policy: {
          reviewRequired: 1
        }
      }
    });
    expect(reportOutput.policyEvents).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          policyKey: "stale_policy_event"
        })
      ])
    );
  });

  it("runs autonomous content missions through content generation and scheduling executors", async () => {
    const repositories = createAgentOrchestrationRepositories({ allowMemoryFallback: true });
    const seeded = await repositories.profiles.seedRoleTemplates({
      workspaceId,
      createdByUserId: "user_1",
      now: new Date(timestamp)
    });
    const coordinator = seeded.find((profile) => profile.role === "coordinator")!;
    const contentPack = contentPackSchema.parse({
      id: "pack_autonomous_1",
      topic: "Autonomous content operations",
      summary: "A compact content pack for autonomous scheduling.",
      audience: "founders",
      tone: "practical",
      goal: "educate",
      ideas: [
        {
          id: "idea_1",
          title: "Make the workflow visible",
          angle: "Show the checks before scaling",
          audiencePromise: "Know what each agent did"
        }
      ],
      captions: ["Make each autonomous handoff visible before raising caps."],
      variants: [
        {
          id: "variant_linkedin_1",
          platform: "linkedin",
          title: "Autonomy with controls",
          hook: "Autonomous agents need a visible control plane.",
          body: "Give every mission a policy, a run log, and a schedule trail.",
          cta: "Review your next mission before raising caps.",
          hashtags: ["#AI", "#ContentOps"],
          media: [],
          mediaPrompt: "A clean control room dashboard.",
          characterCount: 92,
          policyStatus: "pass",
          policyWarnings: []
        }
      ],
      hashtags: ["#AI", "#ContentOps"],
      ctaOptions: ["Review your next mission before raising caps."],
      scheduleSuggestions: [
        {
          id: "schedule_linkedin_1",
          platform: "linkedin",
          scheduledFor: "2026-06-22T17:00:00.000Z",
          timezone: "America/Chicago",
          reason: "High-attention publishing window.",
          confidence: 0.88
        }
      ],
      warnings: [],
      createdAt: timestamp,
      metadata: {
        provider: "gemini",
        model: "mock-gemini",
        traceId: "trace_content_1",
        toolCallCount: 1
      }
    });
    const run = agentRunSchema.parse({
      id: "run_autonomous_content_1",
      traceId: "trace_content_1",
      status: "succeeded",
      provider: "gemini",
      model: "mock-gemini",
      userId: "user_1",
      workspaceId,
      input: {
        topic: contentPack.topic,
        platforms: ["linkedin"]
      },
      output: contentPack,
      toolCalls: [],
      startedAt: timestamp,
      completedAt: timestamp
    });
    const runContent = vi.fn(async () => ({
      run,
      contentPack,
      draft: {
        draftId: "draft_autonomous_1",
        status: "saved" as const,
        savedAt: timestamp
      }
    }));
    const schedulePost = vi.fn(async ({ input }) => ({
      scheduledJob: {
        id: `job_${input.platformVariantId}`,
        platformVariantId: input.platformVariantId,
        provider: input.provider,
        scheduledFor: input.scheduledFor
      },
      enqueue: {
        status: "queued" as const,
        queueJobId: `queue_${input.platformVariantId}`,
        delayMs: 0
      }
    })) as never;
    const createdAt = new Date(timestamp).toISOString();

    await repositories.missions.save({
      id: "mission_content_executor_1",
      workspaceId,
      createdByUserId: "user_1",
      coordinatorProfileId: coordinator.id,
      missionType: "content_remix",
      title: "Autonomous content remix",
      objective: "Generate and schedule a platform-ready remix.",
      brief: "Create a durable draft and schedule it through provider queues.",
      status: "queued",
      priority: 80,
      inputs: {
        topic: "Autonomous content operations",
        platforms: ["linkedin"]
      },
      context: {},
      policy: agentAutonomyPolicySchema.parse({
        autonomy: "full",
        allowedActions: ["mission.run", "content.generate", "content.schedule"],
        allowedToolScopes: ["mission.plan", "content.generate", "content.schedule"],
        platformScope: ["linkedin"],
        allowedProviders: ["linkedin"]
      }),
      requestedAt: createdAt,
      createdAt,
      updatedAt: createdAt
    });

    const result = await runAgentMission({
      workspaceId,
      missionId: "mission_content_executor_1",
      repositories,
      executeTask: createAutonomousMissionTaskExecutor({
        allowMemoryFallback: true,
        runContent,
        schedulePost
      }),
      now: () => new Date(timestamp)
    });

    expect(result.mission.status).toBe("succeeded");
    expect(result.tasks).toHaveLength(2);
    expect(result.tasks[0]).toMatchObject({
      status: "succeeded",
      agentRunId: "run_autonomous_content_1"
    });
    expect(result.tasks[1].output).toMatchObject({
      scheduledJobs: [
        {
          id: "job_variant_linkedin_1",
          provider: "linkedin"
        }
      ]
    });
    expect(runContent).toHaveBeenCalledOnce();
    expect(schedulePost).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          platformVariantId: "variant_linkedin_1",
          metadata: expect.objectContaining({
            agentMissionId: "mission_content_executor_1",
            autonomous: true
          })
        })
      })
    );
  });

  it("runs supervised campaign missions through approval-gated scheduling and report tasks", async () => {
    const repositories = createAgentOrchestrationRepositories({ allowMemoryFallback: true });
    const seeded = await repositories.profiles.seedRoleTemplates({
      workspaceId,
      createdByUserId: "user_1",
      now: new Date(timestamp)
    });
    const coordinator = seeded.find((profile) => profile.role === "coordinator")!;
    const contentPack = contentPackSchema.parse({
      id: "pack_campaign_1",
      topic: "Governed AI content operations",
      summary: "A supervised campaign pack.",
      audience: "founders",
      tone: "practical",
      goal: "educate",
      ideas: [
        {
          id: "idea_campaign_1",
          title: "Approval gates build trust",
          angle: "Show governed scheduling before publishing",
          audiencePromise: "Know what needs approval"
        }
      ],
      captions: ["Governed campaigns work best when approval gates are visible."],
      variants: [
        {
          id: "variant_campaign_linkedin",
          platform: "linkedin",
          title: "Supervised campaign",
          hook: "Campaign agents need human-visible approval gates.",
          body: "Research, strategy, content, schedule suggestions, and reports should be inspectable before anything posts.",
          cta: "Review the campaign plan before scheduling.",
          hashtags: ["#AI", "#ContentOps"],
          media: [],
          mediaPrompt: "A clean campaign operations desk.",
          characterCount: 138,
          policyStatus: "pass",
          policyWarnings: []
        }
      ],
      hashtags: ["#AI", "#ContentOps"],
      ctaOptions: ["Review the campaign plan before scheduling."],
      scheduleSuggestions: [
        {
          id: "schedule_campaign_linkedin",
          platform: "linkedin",
          scheduledFor: "2026-06-22T17:00:00.000Z",
          timezone: "America/Chicago",
          reason: "Best weekday operator review window.",
          confidence: 0.82
        }
      ],
      warnings: [],
      createdAt: timestamp,
      metadata: {
        provider: "gemini",
        model: "mock-gemini",
        traceId: "trace_campaign_content",
        toolCallCount: 1
      }
    });
    const run = agentRunSchema.parse({
      id: "run_campaign_content_1",
      traceId: "trace_campaign_content",
      status: "succeeded",
      provider: "gemini",
      model: "mock-gemini",
      userId: "user_1",
      workspaceId,
      input: {
        topic: contentPack.topic,
        platforms: ["linkedin"]
      },
      output: contentPack,
      toolCalls: [],
      startedAt: timestamp,
      completedAt: timestamp
    });
    const runContent = vi.fn(async () => ({
      run,
      contentPack,
      draft: {
        draftId: "draft_campaign_1",
        status: "saved" as const,
        savedAt: timestamp
      }
    }));
    const schedulePost = vi.fn(async () => {
      throw new Error("Supervised campaign scheduling must stop for approval.");
    }) as never;

    await repositories.missions.save({
      id: "mission_supervised_campaign_1",
      workspaceId,
      createdByUserId: "user_1",
      coordinatorProfileId: coordinator.id,
      missionType: "supervised_campaign",
      title: "Supervised campaign autopilot",
      objective: "Produce campaign assets without scheduling until approval.",
      brief: "Research, plan, generate, prepare schedule suggestions, and report readiness.",
      status: "queued",
      priority: 85,
      inputs: {
        topic: "Governed AI content operations",
        platforms: ["linkedin"]
      },
      context: {},
      policy: agentAutonomyPolicySchema.parse({
        autonomy: "supervised",
        allowedActions: [
          "mission.run",
          "research.collect",
          "task.execute",
          "content.generate",
          "content.schedule",
          "report.generate"
        ],
        allowedToolScopes: [
          "mission.plan",
          "research.topic",
          "strategy.plan",
          "content.generate",
          "content.schedule",
          "mission.report"
        ],
        platformScope: ["linkedin"],
        allowedProviders: ["linkedin"]
      }),
      requestedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    const simulation = await simulateAgentMission({
      workspaceId,
      missionId: "mission_supervised_campaign_1",
      repositories,
      requestedByUserId: "user_1",
      now: () => new Date(timestamp)
    });
    expect(simulation.simulationRun.plannedActions.map((action) => action.action)).toEqual([
      "research.collect",
      "task.execute",
      "content.generate",
      "content.schedule",
      "report.generate"
    ]);
    expect(simulation.simulationRun.plannedActions.find((action) => action.action === "content.schedule")).toMatchObject({
      status: "would_require_review",
      approvalRequired: true,
      policy: {
        policyKey: "supervised_external_action"
      }
    });

    const result = await runAgentMission({
      workspaceId,
      missionId: "mission_supervised_campaign_1",
      repositories,
      executeTask: createAutonomousMissionTaskExecutor({
        allowMemoryFallback: true,
        runContent,
        schedulePost
      }),
      now: () => new Date(timestamp)
    });
    const contentTask = result.tasks.find((task) => task.taskName === "Generate campaign variants");
    const scheduleTask = result.tasks.find((task) => task.taskName === "Prepare approval-gated schedule");
    const reportTask = result.tasks.find((task) => task.taskName === "Compile campaign readiness report");

    expect(result.mission.status).toBe("succeeded");
    expect(result.tasks.map((task) => task.taskName)).toEqual([
      "Research campaign context",
      "Plan supervised campaign strategy",
      "Generate campaign variants",
      "Prepare approval-gated schedule",
      "Compile campaign readiness report"
    ]);
    expect(contentTask?.output).toMatchObject({
      generatedVariants: [
        {
          id: "variant_campaign_linkedin",
          policyStatus: "pass"
        }
      ],
      scheduleSuggestions: [
        {
          id: "schedule_campaign_linkedin",
          platform: "linkedin"
        }
      ],
      approvalGate: {
        scheduling: "requires_human_approval",
        publishing: "requires_human_approval"
      }
    });
    expect(scheduleTask).toMatchObject({
      status: "skipped",
      output: {
        policy: {
          key: "supervised_external_action",
          action: "require_review"
        }
      }
    });
    expect(reportTask?.output).toMatchObject({
      report: expect.objectContaining({
        providerMetricsCaveat: expect.stringContaining("Provider metrics")
      })
    });
    expect(schedulePost).not.toHaveBeenCalled();
  });

  it("simulates publish missions without invoking scheduling or publish executors", async () => {
    const repositories = createAgentOrchestrationRepositories({ allowMemoryFallback: true });
    const seeded = await repositories.profiles.seedRoleTemplates({
      workspaceId,
      createdByUserId: "user_1",
      now: new Date(timestamp)
    });
    const coordinator = seeded.find((profile) => profile.role === "coordinator")!;
    const executeTask = vi.fn(async () => {
      throw new Error("Simulation must not execute task side effects.");
    });

    await repositories.missions.save({
      id: "mission_publish_simulation_1",
      workspaceId,
      createdByUserId: "user_1",
      coordinatorProfileId: coordinator.id,
      missionType: "content_pipeline",
      title: "Autonomous publish simulation",
      objective: "Preview a publish mission before queueing provider work.",
      brief: "Research, generate, and prepare publish actions without writing jobs.",
      status: "queued",
      priority: 80,
      inputs: {
        topic: "Simulation safety",
        platforms: ["linkedin", "x"]
      },
      context: {},
      policy: agentAutonomyPolicySchema.parse({
        autonomy: "full",
        allowedActions: ["mission.run", "research.collect", "task.execute", "content.generate", "content.publish"],
        allowedToolScopes: ["mission.plan", "research.topic", "strategy.plan", "content.generate", "content.publish"],
        platformScope: ["linkedin", "x"]
      }),
      requestedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    const result = await simulateAgentMission({
      workspaceId,
      missionId: "mission_publish_simulation_1",
      repositories,
      executeTask,
      requestedByUserId: "user_1",
      now: () => new Date(timestamp)
    });

    expect(executeTask).not.toHaveBeenCalled();
    expect(result.mission.status).toBe("queued");
    expect(result.simulationRun).toMatchObject({
      missionId: "mission_publish_simulation_1",
      requestedByUserId: "user_1",
      status: "succeeded",
      estimatedUsage: {
        scheduledPostWrites: 2,
        publishEnqueues: 2
      },
      summary: {
        approvalRequiredCount: 0,
        promotable: false,
        riskLevel: "high",
        providerReadinessWarnings: expect.arrayContaining([
          "No provider is selected for this external action.",
          "No connected account is selected for readiness validation."
        ])
      }
    });
    expect(result.simulationRun.plannedActions.map((action) => action.action)).toContain("content.publish");
    expect(result.simulationRun.plannedActions.find((action) => action.action === "content.publish")).toMatchObject({
      status: "would_run",
      riskLevel: "high",
      promotable: false,
      suppressedSideEffects: expect.arrayContaining(["publish queue enqueue"])
    });
    await expect(
      repositories.taskRuns.listForMission({
        workspaceId,
        missionId: "mission_publish_simulation_1"
      })
    ).resolves.toHaveLength(0);
    await expect(
      repositories.simulationRuns.listForMission({
        workspaceId,
        missionId: "mission_publish_simulation_1"
      })
    ).resolves.toHaveLength(1);
    await expect(
      repositories.policyEvents.listForMission({
        workspaceId,
        missionId: "mission_publish_simulation_1"
      })
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          details: expect.objectContaining({
            simulation: true,
            simulationRunId: result.simulationRun.id
          })
        })
      ])
    );
  });

  it("warns when a single selected provider is incompatible with requested platforms", async () => {
    const repositories = createAgentOrchestrationRepositories({ allowMemoryFallback: true });
    const seeded = await repositories.profiles.seedRoleTemplates({
      workspaceId,
      createdByUserId: "user_1",
      now: new Date(timestamp)
    });
    const coordinator = seeded.find((profile) => profile.role === "coordinator")!;

    await repositories.missions.save({
      id: "mission_single_provider_compatibility_1",
      workspaceId,
      createdByUserId: "user_1",
      coordinatorProfileId: coordinator.id,
      missionType: "content_pipeline",
      title: "Provider compatibility simulation",
      objective: "Preview provider-platform mismatches before scheduling.",
      brief: "Detect an X provider mismatch for LinkedIn variants.",
      status: "queued",
      priority: 80,
      inputs: {
        topic: "Provider checks",
        provider: "x",
        platforms: ["linkedin"],
        connectedAccountId: "account_x_1",
        connectedAccount: {
          id: "account_x_1",
          status: "connected",
          scopes: ["publish"],
          capabilities: ["scheduled_publish"],
          lastValidatedAt: timestamp
        }
      },
      context: {},
      policy: agentAutonomyPolicySchema.parse({
        autonomy: "full",
        allowedActions: ["mission.run", "research.collect", "task.execute", "content.generate", "content.publish"],
        allowedToolScopes: ["mission.plan", "research.topic", "strategy.plan", "content.generate", "content.publish"],
        platformScope: ["linkedin"],
        allowedProviders: ["x"]
      }),
      requestedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    const result = await simulateAgentMission({
      workspaceId,
      missionId: "mission_single_provider_compatibility_1",
      repositories,
      now: () => new Date(timestamp)
    });

    expect(result.simulationRun.summary.providerReadinessWarnings).toEqual(
      expect.arrayContaining(["Provider x cannot publish linkedin variants."])
    );
    expect(result.simulationRun.summary.providerReadinessWarnings).not.toContain(
      "No connected account is selected for readiness validation."
    );
  });

  it("keeps supervised simulations inspectable while requiring review for external actions", async () => {
    const repositories = createAgentOrchestrationRepositories({ allowMemoryFallback: true });
    const seeded = await repositories.profiles.seedRoleTemplates({
      workspaceId,
      createdByUserId: "user_1",
      now: new Date(timestamp)
    });
    const coordinator = seeded.find((profile) => profile.role === "coordinator")!;

    await repositories.missions.save({
      id: "mission_supervised_simulation_1",
      workspaceId,
      createdByUserId: "user_1",
      coordinatorProfileId: coordinator.id,
      missionType: "content_pipeline",
      title: "Supervised publish simulation",
      objective: "Preview the whole mission while holding external actions.",
      brief: "Research, generate, and hold publish work for review.",
      status: "queued",
      priority: 70,
      inputs: {
        topic: "Supervised autonomy",
        platforms: ["linkedin"]
      },
      context: {},
      policy: agentAutonomyPolicySchema.parse({
        autonomy: "supervised",
        allowedActions: ["mission.run", "research.collect", "task.execute", "content.generate", "content.publish"],
        allowedToolScopes: ["mission.plan", "research.topic", "strategy.plan", "content.generate", "content.publish"],
        platformScope: ["linkedin"]
      }),
      requestedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    const result = await simulateAgentMission({
      workspaceId,
      missionId: "mission_supervised_simulation_1",
      repositories,
      requestedByUserId: "user_1",
      now: () => new Date(timestamp)
    });
    const publishAction = result.simulationRun.plannedActions.find((action) => action.action === "content.publish");

    expect(result.simulationRun.plannedActions.length).toBeGreaterThan(1);
    expect(publishAction).toMatchObject({
      status: "would_require_review",
      approvalRequired: true,
      policy: {
        policyKey: "supervised_external_action"
      },
      estimatedUsage: {
        publishEnqueues: 1,
        scheduledPostWrites: 1
      },
      suppressedSideEffects: expect.arrayContaining(["publish queue enqueue"])
    });
    expect(result.simulationRun.summary).toMatchObject({
      approvalRequiredCount: 1,
      blockedReasonCount: 0,
      promotable: false,
      riskLevel: "high"
    });
  });

  it("simulates comment engagement without invoking reply send executors", async () => {
    const repositories = createAgentOrchestrationRepositories({ allowMemoryFallback: true });
    const seeded = await repositories.profiles.seedRoleTemplates({
      workspaceId,
      createdByUserId: "user_1",
      now: new Date(timestamp)
    });
    const coordinator = seeded.find((profile) => profile.role === "coordinator")!;
    const executeTask = vi.fn(async () => {
      throw new Error("Simulation must not send replies.");
    });

    await repositories.missions.save({
      id: "mission_reply_simulation_1",
      workspaceId,
      createdByUserId: "user_1",
      coordinatorProfileId: coordinator.id,
      missionType: "comment_engagement",
      title: "Reply simulation",
      objective: "Preview auto replies before provider calls.",
      brief: "Review inbound comment handling without sending replies.",
      status: "queued",
      priority: 70,
      inputs: {
        maxComments: 3,
        platform: "linkedin"
      },
      context: {},
      policy: agentAutonomyPolicySchema.parse({
        autonomy: "full",
        allowedActions: ["mission.run", "reply.send"],
        allowedToolScopes: ["mission.plan", "reply.send"],
        dailyActionCap: 5,
        platformScope: ["linkedin"]
      }),
      requestedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    const result = await simulateAgentMission({
      workspaceId,
      missionId: "mission_reply_simulation_1",
      repositories,
      executeTask,
      now: () => new Date(timestamp)
    });
    const replyAction = result.simulationRun.plannedActions.find((action) => action.action === "reply.send");

    expect(executeTask).not.toHaveBeenCalled();
    expect(replyAction).toMatchObject({
      status: "would_run",
      estimatedUsage: {
        replySends: 3,
        providerRequests: 3
      },
      suppressedSideEffects: expect.arrayContaining(["provider reply send"])
    });
    expect(result.simulationRun.estimatedUsage.replySends).toBe(3);
    await expect(
      repositories.taskRuns.listForMission({
        workspaceId,
        missionId: "mission_reply_simulation_1"
      })
    ).resolves.toHaveLength(0);
  });

  it("stops simulated task planning when mission-level policy denies execution", async () => {
    const repositories = createAgentOrchestrationRepositories({ allowMemoryFallback: true });
    const seeded = await repositories.profiles.seedRoleTemplates({
      workspaceId,
      createdByUserId: "user_1",
      now: new Date(timestamp)
    });
    const coordinator = seeded.find((profile) => profile.role === "coordinator")!;

    await repositories.missions.save({
      id: "mission_policy_denied_simulation_1",
      workspaceId,
      createdByUserId: "user_1",
      coordinatorProfileId: coordinator.id,
      missionType: "content_pipeline",
      title: "Policy denied simulation",
      objective: "Preview a mission that cannot start autonomously.",
      brief: "The mission requires review before any task actions are planned.",
      status: "queued",
      priority: 70,
      inputs: {
        topic: "Human review controls",
        platforms: ["linkedin"]
      },
      context: {},
      policy: agentAutonomyPolicySchema.parse({
        autonomy: "full",
        requiresHumanApproval: true,
        allowedActions: ["mission.run", "research.collect", "task.execute", "content.generate", "content.publish"],
        allowedToolScopes: ["mission.plan", "research.topic", "strategy.plan", "content.generate", "content.publish"],
        platformScope: ["linkedin"]
      }),
      requestedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    const result = await simulateAgentMission({
      workspaceId,
      missionId: "mission_policy_denied_simulation_1",
      repositories,
      now: () => new Date(timestamp)
    });

    expect(result.simulationRun.status).toBe("succeeded");
    expect(result.simulationRun.plannedActions).toHaveLength(0);
    expect(result.simulationRun.estimatedUsage).toMatchObject({
      publishEnqueues: 0,
      replySends: 0,
      scheduledPostWrites: 0,
      sideEffectsSuppressed: 0,
      usageLedgerWrites: 0
    });
    expect(result.policyEvents).toEqual([
      expect.objectContaining({
        action: "require_review",
        policyKey: "human_review_required",
        message: "Policy requires review before this autonomous action."
      })
    ]);
    await expect(
      repositories.taskRuns.listForMission({
        workspaceId,
        missionId: "mission_policy_denied_simulation_1"
      })
    ).resolves.toHaveLength(0);
  });

  it("persists failed simulation rows when policy event recording fails", async () => {
    const repositories = createAgentOrchestrationRepositories({ allowMemoryFallback: true });
    const seeded = await repositories.profiles.seedRoleTemplates({
      workspaceId,
      createdByUserId: "user_1",
      now: new Date(timestamp)
    });
    const coordinator = seeded.find((profile) => profile.role === "coordinator")!;
    const failingRepositories = {
      ...repositories,
      policyEvents: {
        ...repositories.policyEvents,
        record: vi.fn(async () => {
          throw new Error("policy event store offline");
        })
      }
    };

    await repositories.missions.save({
      id: "mission_failed_simulation_1",
      workspaceId,
      createdByUserId: "user_1",
      coordinatorProfileId: coordinator.id,
      missionType: "comment_engagement",
      title: "Failed simulation persistence",
      objective: "Keep failed dry runs visible in history.",
      brief: "A storage failure should be visible to the operator.",
      status: "queued",
      priority: 70,
      inputs: {
        maxComments: 2,
        platform: "linkedin"
      },
      context: {},
      policy: agentAutonomyPolicySchema.parse({
        autonomy: "full",
        allowedActions: ["mission.run", "reply.send"],
        allowedToolScopes: ["mission.plan", "reply.send"],
        platformScope: ["linkedin"]
      }),
      requestedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    const result = await simulateAgentMission({
      workspaceId,
      missionId: "mission_failed_simulation_1",
      repositories: failingRepositories,
      now: () => new Date(timestamp)
    });

    expect(result.simulationRun).toMatchObject({
      missionId: "mission_failed_simulation_1",
      status: "failed",
      error: "policy event store offline"
    });
    expect(result.simulationRun.plannedActions.map((action) => action.action)).toContain("reply.send");
    await expect(
      repositories.simulationRuns.listForMission({
        workspaceId,
        missionId: "mission_failed_simulation_1"
      })
    ).resolves.toEqual([
      expect.objectContaining({
        status: "failed",
        error: "policy event store offline"
      })
    ]);
    await expect(
      repositories.taskRuns.listForMission({
        workspaceId,
        missionId: "mission_failed_simulation_1"
      })
    ).resolves.toHaveLength(0);
  });

  it("preserves the original simulation error when failed-run persistence also fails", async () => {
    const repositories = createAgentOrchestrationRepositories({ allowMemoryFallback: true });
    const seeded = await repositories.profiles.seedRoleTemplates({
      workspaceId,
      createdByUserId: "user_1",
      now: new Date(timestamp)
    });
    const coordinator = seeded.find((profile) => profile.role === "coordinator")!;
    const failingRepositories = {
      ...repositories,
      policyEvents: {
        ...repositories.policyEvents,
        record: vi.fn(async () => {
          throw new Error("policy event store offline");
        })
      },
      simulationRuns: {
        ...repositories.simulationRuns,
        save: vi.fn(async () => {
          throw new Error("simulation history store offline");
        })
      }
    };

    await repositories.missions.save({
      id: "mission_failed_persistence_simulation_1",
      workspaceId,
      createdByUserId: "user_1",
      coordinatorProfileId: coordinator.id,
      missionType: "weekly_report",
      title: "Failed persistence simulation",
      objective: "Preserve the original dry-run error.",
      brief: "Secondary persistence failures should not hide the original simulation failure.",
      status: "queued",
      priority: 70,
      inputs: {},
      context: {},
      policy: agentAutonomyPolicySchema.parse({
        autonomy: "full",
        allowedActions: ["mission.run", "report.generate"],
        allowedToolScopes: ["mission.plan", "mission.report"]
      }),
      requestedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    await expect(
      simulateAgentMission({
        workspaceId,
        missionId: "mission_failed_persistence_simulation_1",
        repositories: failingRepositories,
        now: () => new Date(timestamp)
      })
    ).rejects.toThrow(
      "Mission simulation failed: policy event store offline. Failed to persist simulation failure: simulation history store offline"
    );
  });

  it("does not overwrite customized role templates when seeding runs again", async () => {
    const repositories = createAgentOrchestrationRepositories({ allowMemoryFallback: true });
    const seeded = await repositories.profiles.seedRoleTemplates({
      workspaceId,
      createdByUserId: "user_1",
      now: new Date(timestamp)
    });
    const coordinator = seeded.find((profile) => profile.role === "coordinator")!;
    const customized = await repositories.profiles.save({
      ...coordinator,
      name: "Dragon",
      instructions: "Preserve this workspace-specific control-plane knowledge.",
      policy: {
        ...coordinator.policy,
        dailyActionCap: 1,
        emergencyPaused: true
      },
      metadata: {
        ...coordinator.metadata,
        customized: true
      },
      updatedAt: "2026-06-21T13:00:00.000Z"
    });

    const reseeded = await repositories.profiles.seedRoleTemplates({
      workspaceId,
      createdByUserId: "user_2",
      now: new Date("2026-06-21T14:00:00.000Z")
    });
    const reseededCoordinator = reseeded.find((profile) => profile.id === coordinator.id);
    const persistedCoordinator = await repositories.profiles.get({
      workspaceId,
      id: coordinator.id
    });

    expect(reseededCoordinator).toMatchObject({
      id: coordinator.id,
      name: "Dragon",
      instructions: customized.instructions,
      policy: {
        dailyActionCap: 1,
        emergencyPaused: true
      },
      metadata: {
        customized: true
      }
    });
    expect(persistedCoordinator).toEqual(reseededCoordinator);
  });

  it("bounds mission, task, and policy history lists", async () => {
    const repositories = createAgentOrchestrationRepositories({ allowMemoryFallback: true });
    const [coordinator] = await repositories.profiles.seedRoleTemplates({
      workspaceId,
      createdByUserId: "user_1",
      roles: ["coordinator"],
      now: new Date(timestamp)
    });
    const policy = agentAutonomyPolicySchema.parse({
      autonomy: "full",
      allowedActions: ["mission.run", "task.execute"],
      allowedToolScopes: ["mission.plan"]
    });

    for (let index = 0; index < AGENT_MISSION_HISTORY_LIMIT + 5; index += 1) {
      const createdAt = new Date(Date.UTC(2026, 5, 21, 12, index)).toISOString();
      await repositories.missions.save({
        id: `mission_history_${index}`,
        workspaceId,
        createdByUserId: "user_1",
        coordinatorProfileId: coordinator.id,
        missionType: "weekly_report",
        title: `History mission ${index}`,
        objective: "Keep recent mission history bounded.",
        brief: "Regression coverage for list limits.",
        status: "queued",
        priority: 50,
        inputs: {},
        context: {},
        policy,
        requestedAt: createdAt,
        createdAt,
        updatedAt: createdAt
      });
    }

    for (let index = 0; index < AGENT_TASK_RUN_HISTORY_LIMIT + 5; index += 1) {
      const createdAt = new Date(Date.UTC(2026, 5, 21, 13, index)).toISOString();
      await repositories.taskRuns.save({
        id: `task_history_${index}`,
        workspaceId,
        missionId: "mission_history_0",
        profileId: coordinator.id,
        taskName: `Task history ${index}`,
        status: "queued",
        attemptNumber: 1,
        input: {},
        policySnapshot: policy,
        queuedAt: createdAt,
        createdAt,
        updatedAt: createdAt
      });
    }

    for (let index = 0; index < AGENT_POLICY_EVENT_HISTORY_LIMIT + 5; index += 1) {
      const createdAt = new Date(Date.UTC(2026, 5, 21, 14, index)).toISOString();
      await repositories.policyEvents.record({
        id: `policy_history_${index}`,
        workspaceId,
        missionId: "mission_history_0",
        taskRunId: "task_history_0",
        profileId: coordinator.id,
        severity: "info",
        action: "allow",
        policyKey: "history_limit",
        message: `History policy event ${index}`,
        details: {},
        occurredAt: createdAt,
        createdAt
      });
    }

    await expect(repositories.missions.list(workspaceId)).resolves.toHaveLength(AGENT_MISSION_HISTORY_LIMIT);
    await expect(repositories.missions.list(workspaceId, { limit: 5 })).resolves.toHaveLength(5);
    await expect(
      repositories.taskRuns.listForMission({
        workspaceId,
        missionId: "mission_history_0"
      })
    ).resolves.toHaveLength(AGENT_TASK_RUN_HISTORY_LIMIT);
    await expect(
      repositories.policyEvents.listForMission({
        workspaceId,
        missionId: "mission_history_0"
      })
    ).resolves.toHaveLength(AGENT_POLICY_EVENT_HISTORY_LIMIT);
  });
});
