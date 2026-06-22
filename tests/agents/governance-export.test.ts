import { beforeEach, describe, expect, it } from "vitest";
import {
  clearAgentOrchestrationRepositoriesForTests,
  createAgentOrchestrationRepositories
} from "@/lib/agents/orchestration/repository";
import { buildAgentGovernanceExport, redactSensitive } from "@/lib/agents/governance-export";
import { agentAutonomyPolicySchema } from "@/lib/agents/schemas/orchestration";
import { clearBrandMemoryProposalsForTests } from "@/lib/brand-memory/proposals";

const workspaceId = "00000000-0000-0000-0000-000000000001";
const timestamp = "2026-06-22T12:00:00.000Z";

describe("agent governance export", () => {
  beforeEach(() => {
    clearAgentOrchestrationRepositoriesForTests();
    clearBrandMemoryProposalsForTests();
  });

  it("redacts sensitive keys recursively while preserving non-sensitive provider outcomes", () => {
    expect(
      redactSensitive({
        authorization: "Bearer secret",
        nested: {
          webhookSignature: "signed",
          providerResponse: {
            id: "post_1",
            status: "ok"
          }
        },
        list: [
          {
            apiKey: "abc",
            result: "kept"
          }
        ]
      })
    ).toEqual({
      authorization: "[redacted]",
      nested: {
        webhookSignature: "[redacted]",
        providerResponse: {
          id: "post_1",
          status: "ok"
        }
      },
      list: [
        {
          apiKey: "[redacted]",
          result: "kept"
        }
      ]
    });
  });

  it("builds a workspace-scoped JSON payload from mission audit repositories", async () => {
    const repositories = createAgentOrchestrationRepositories({ allowMemoryFallback: true });
    const profiles = await repositories.profiles.seedRoleTemplates({
      workspaceId,
      createdByUserId: "user_1",
      now: new Date(timestamp)
    });
    const coordinator = profiles.find((profile) => profile.role === "coordinator")!;

    await repositories.missions.save({
      id: "mission_export_1",
      workspaceId,
      createdByUserId: "user_1",
      coordinatorProfileId: coordinator.id,
      missionType: "weekly_report",
      title: "Governance export mission",
      objective: "Prove export coverage.",
      brief: "Compile agent evidence.",
      status: "queued",
      priority: 50,
      inputs: {},
      context: {
        webhookSecret: "do-not-export"
      },
      policy: agentAutonomyPolicySchema.parse({
        autonomy: "full",
        allowedActions: ["mission.run", "report.generate"],
        allowedToolScopes: ["mission.report"]
      }),
      requestedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    const payload = await buildAgentGovernanceExport({
      workspaceId,
      requestedByUserId: "user_1",
      repositories,
      allowMemoryFallback: true,
      now: new Date(timestamp)
    }) as {
      summary: { missions: number };
      missions: Array<{ mission: { context: Record<string, unknown> } }>;
      usage: { records: unknown[] };
    };

    expect(payload.summary.missions).toBe(1);
    expect(payload.missions[0].mission.context.webhookSecret).toBe("[redacted]");
    expect(payload.usage.records).toEqual([]);
  });
});
