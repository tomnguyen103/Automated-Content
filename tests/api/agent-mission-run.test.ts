import { describe, expect, it, beforeEach, vi } from "vitest";

const routeMocks = vi.hoisted(() => {
  class QueueConfigurationError extends Error {
    constructor() {
      super("REDIS_URL is required for queue operations.");
      this.name = "QueueConfigurationError";
    }
  }

  return {
    QueueConfigurationError,
    enqueueAgentMission: vi.fn(),
    getMission: vi.fn(),
    resolveAgentOrchestrationContext: vi.fn(),
    runMissionWorkflow: vi.fn(),
    simulateAgentMission: vi.fn()
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
          get: routeMocks.getMission
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
      code: "agent_mission_queue_unavailable"
    });
    expect(routeMocks.runMissionWorkflow).not.toHaveBeenCalled();
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
});
