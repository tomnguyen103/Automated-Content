import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const routeMocks = vi.hoisted(() => {
  class QueueConfigurationError extends Error {
    constructor() {
      super("REDIS_URL is required for queue operations.");
      this.name = "QueueConfigurationError";
    }
  }

  return {
    QueueConfigurationError,
    ensureUsageAllowed: vi.fn(),
    enqueueAgentMission: vi.fn(),
    getMission: vi.fn(),
    resolveAgentOrchestrationContext: vi.fn(),
    runMissionWorkflow: vi.fn(),
    saveMission: vi.fn(),
    seedRoleTemplates: vi.fn(),
    simulateAgentMission: vi.fn(),
    withUsageLimitLock: vi.fn()
  };
});

vi.mock("@/lib/agents/graphs/mission-workflow", () => ({
  runMissionWorkflow: routeMocks.runMissionWorkflow
}));

vi.mock("@/lib/agents/orchestration/queue", () => ({
  enqueueAgentMission: routeMocks.enqueueAgentMission
}));

vi.mock("@/lib/agents/orchestration/server", () => ({
  resolveAgentOrchestrationContext: routeMocks.resolveAgentOrchestrationContext
}));

vi.mock("@/lib/billing/usage", () => ({
  UsageLimitExceededError: class UsageLimitExceededError extends Error {
    readonly metric: unknown;

    constructor(metric: unknown = null) {
      super("Usage limit exceeded.");
      this.name = "UsageLimitExceededError";
      this.metric = metric;
    }
  },
  ensureUsageAllowed: routeMocks.ensureUsageAllowed,
  withUsageLimitLock: routeMocks.withUsageLimitLock
}));

vi.mock("@/lib/agents/orchestration/simulation", () => ({
  simulateAgentMission: routeMocks.simulateAgentMission
}));

vi.mock("@/lib/scheduler/enqueue", () => ({
  QueueConfigurationError: routeMocks.QueueConfigurationError
}));

describe("agent mission run API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.getMission.mockResolvedValue({ id: "mission_1" });
    routeMocks.ensureUsageAllowed.mockResolvedValue(null);
    routeMocks.withUsageLimitLock.mockImplementation(
      async (_input: unknown, callback: () => Promise<unknown>) => callback()
    );
    routeMocks.saveMission.mockImplementation(async (mission) => mission);
    routeMocks.seedRoleTemplates.mockResolvedValue([
      {
        id: "agent_profile_1",
        role: "coordinator"
      }
    ]);
    routeMocks.resolveAgentOrchestrationContext.mockResolvedValue({
      workspace: {
        id: "00000000-0000-0000-0000-000000000001",
        isLocalPreview: false
      },
      user: {
        id: "user_1"
      },
      repositories: {
        missions: {
          get: routeMocks.getMission,
          save: routeMocks.saveMission
        },
        profiles: {
          seedRoleTemplates: routeMocks.seedRoleTemplates
        }
      }
    });
  });

  it("fails closed instead of running missions inline when the production queue is unavailable", async () => {
    routeMocks.enqueueAgentMission.mockRejectedValue(new routeMocks.QueueConfigurationError());
    const { POST } = await import("@/app/api/agents/missions/[id]/run/route");

    const response = await POST(new Request("http://localhost/api/agents/missions/mission_1/run"), {
      params: Promise.resolve({ id: "mission_1" })
    });
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toMatchObject({
      error: "Agent mission queue is not configured.",
      code: "agent_mission_queue_unavailable",
      mission: {
        status: "failed",
        error: "Agent mission queue is not configured.",
        context: {
          queue: {
            status: "failed",
            error: "Agent mission queue is not configured."
          }
        }
      }
    });
    expect(routeMocks.runMissionWorkflow).not.toHaveBeenCalled();
    expect(routeMocks.saveMission).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error: "Agent mission queue is not configured.",
        context: expect.objectContaining({
          queue: expect.objectContaining({
            status: "failed",
            error: "Agent mission queue is not configured.",
            failedAt: expect.any(String)
          })
        })
      })
    );
  });

  it("persists production queue metadata when mission enqueue succeeds", async () => {
    routeMocks.enqueueAgentMission.mockResolvedValue({
      queueJobId: "queue_mission_1",
      status: "queued"
    });
    const { POST } = await import("@/app/api/agents/missions/[id]/run/route");

    const response = await POST(new Request("http://localhost/api/agents/missions/mission_1/run"), {
      params: Promise.resolve({ id: "mission_1" })
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      execution: "queued",
      enqueue: {
        queueJobId: "queue_mission_1",
        status: "queued"
      },
      mission: {
        status: "queued",
        context: {
          queue: {
            status: "queued",
            queueJobId: "queue_mission_1"
          }
        }
      }
    });
    expect(routeMocks.saveMission).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "queued",
        error: undefined,
        context: expect.objectContaining({
          queue: expect.objectContaining({
            status: "queued",
            queueJobId: "queue_mission_1",
            queuedAt: expect.any(String)
          })
        })
      })
    );
  });

  it("runs mission simulations inline without queueing execution work", async () => {
    routeMocks.simulateAgentMission.mockResolvedValue({
      mission: {
        id: "mission_1"
      },
      simulationRun: {
        id: "agent_sim_1"
      },
      policyEvents: []
    });
    const { POST } = await import("@/app/api/agents/missions/[id]/simulate/route");

    const response = await POST(new Request("http://localhost/api/agents/missions/mission_1/simulate"), {
      params: Promise.resolve({ id: "mission_1" })
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      execution: "simulation",
      simulationRun: {
        id: "agent_sim_1"
      }
    });
    expect(routeMocks.simulateAgentMission).toHaveBeenCalledWith(
      expect.objectContaining({
        missionId: "mission_1",
        requestedByUserId: "user_1",
        workspaceId: "00000000-0000-0000-0000-000000000001"
      })
    );
    expect(routeMocks.enqueueAgentMission).not.toHaveBeenCalled();
    expect(routeMocks.runMissionWorkflow).not.toHaveBeenCalled();
  });

  it("returns persisted failed simulation payloads without queueing execution work", async () => {
    routeMocks.simulateAgentMission.mockResolvedValue({
      mission: {
        id: "mission_1"
      },
      simulationRun: {
        id: "agent_sim_failed_1",
        status: "failed",
        error: "policy event store offline"
      },
      policyEvents: []
    });
    const { POST } = await import("@/app/api/agents/missions/[id]/simulate/route");

    const response = await POST(new Request("http://localhost/api/agents/missions/mission_1/simulate"), {
      params: Promise.resolve({ id: "mission_1" })
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      execution: "simulation",
      simulationRun: {
        id: "agent_sim_failed_1",
        status: "failed",
        error: "policy event store offline"
      }
    });
    expect(routeMocks.enqueueAgentMission).not.toHaveBeenCalled();
    expect(routeMocks.runMissionWorkflow).not.toHaveBeenCalled();
  });

  it("creates new missions with supervised autonomy when no policy override is provided", async () => {
    const { POST } = await import("@/app/api/agents/missions/route");

    const response = await POST(
      new NextRequest("http://localhost/api/agents/missions", {
        method: "POST",
        body: JSON.stringify({
          missionType: "content_pipeline",
          title: "Supervised launch mission",
          objective: "Create launch content with approval gates.",
          brief: "Research, draft, and hold external actions for review."
        })
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.mission.policy).toMatchObject({
      autonomy: "supervised",
      requiresHumanApproval: false
    });
    expect(routeMocks.saveMission).toHaveBeenCalledWith(
      expect.objectContaining({
        policy: expect.objectContaining({
          autonomy: "supervised"
        })
      })
    );
    expect(routeMocks.ensureUsageAllowed).toHaveBeenCalledWith({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      key: "agentMissionsPerMonth",
      skip: false
    });
  });
});
