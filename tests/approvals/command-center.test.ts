import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentOrchestrationRepositories } from "@/lib/agents/orchestration/repository";

const now = new Date("2026-06-23T18:00:00.000Z");

describe("approval command center", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("@/lib/approvals/command-center");
    vi.doUnmock("@/lib/auth/current-user");
    vi.doUnmock("@/lib/agents/orchestration/server");
    vi.resetModules();
  });

  it("aggregates pending decisions without leaking raw source payloads", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.resetModules();

    const { getApprovalCommandCenter } = await import("@/lib/approvals/command-center");
    const replyRepository = {
      getConsoleState: vi.fn(async () => ({
        rules: [],
        inbox: [],
        approvals: [
          {
            id: "reply_attempt_1",
            workspaceId: "workspace_1",
            commentId: "comment_1",
            provider: "mock" as const,
            platform: "linkedin" as const,
            authorName: "Rina",
            commentText: "Here is a raw-token-secret that must stay out of the command center.",
            suggestedReply: "Thanks for asking. We will send details.",
            confidence: 0.7,
            triageLabel: "needs_human_review" as const,
            triageReason: "Pricing question needs review.",
            status: "pending" as const,
            auditNotes: ["Non-keyword suggestion requires approval."],
            createdAt: "2026-06-23T17:30:00.000Z",
            updatedAt: "2026-06-23T17:30:00.000Z"
          }
        ],
        logs: []
      }))
    };
    const brandMemoryRepository = {
      list: vi.fn(async () => [
        {
          id: "brand_memory_1",
          workspaceId: "workspace_1",
          scope: "workspace" as const,
          originalText: "Do not leak secret-provider-token.",
          editedText: "Use calmer operator language.",
          inferredRule: "Use calmer operator language for automation claims.",
          confidence: 82,
          status: "pending" as const,
          evidence: {},
          createdAt: "2026-06-23T16:45:00.000Z",
          updatedAt: "2026-06-23T16:45:00.000Z"
        }
      ])
    };
    const agentRepositories = {
      missions: {
        list: vi.fn(async () => [
          {
            id: "mission_1",
            title: "Provider readiness review"
          }
        ])
      },
      policyEvents: {
        listForMission: vi.fn(async () => [
          {
            id: "policy_1",
            missionId: "mission_1",
            action: "block",
            severity: "blocked",
            policyKey: "provider_readiness",
            message: "Connect a LinkedIn account before scheduling or publishing.",
            details: {
              provider: "linkedin",
              platform: "linkedin",
              tokenRef: "secret-token-ref"
            },
            occurredAt: "2026-06-23T17:45:00.000Z"
          }
        ])
      }
    } as unknown as AgentOrchestrationRepositories;

    const result = await getApprovalCommandCenter({
      agentRepositories,
      brandMemoryRepository,
      filters: {},
      now,
      replyRepository,
      workspaceId: "workspace_1"
    });
    const blocked = await getApprovalCommandCenter({
      agentRepositories,
      brandMemoryRepository,
      filters: {
        severity: "blocked"
      },
      now,
      replyRepository,
      workspaceId: "workspace_1"
    });
    const serialized = JSON.stringify(result.items);

    expect(result.stats.total).toBe(3);
    expect(result.stats.bySource).toMatchObject({
      agents: 1,
      brand_memory: 1,
      reply: 1
    });
    expect(blocked.items).toHaveLength(1);
    expect(blocked.items[0]).toMatchObject({
      type: "provider_block",
      provider: "linkedin",
      severity: "blocked"
    });
    expect(serialized).not.toContain("raw-token-secret");
    expect(serialized).not.toContain("secret-provider-token");
    expect(serialized).not.toContain("secret-token-ref");
  });

  it("parses API filters for an authenticated workspace", async () => {
    const getApprovalCommandCenter = vi.fn(async () => ({
      items: [],
      stats: {
        total: 0,
        blocked: 0,
        pending: 0,
        bySource: {
          agents: 0,
          brand_memory: 0,
          content: 0,
          reply: 0
        }
      }
    }));

    vi.doMock("@/lib/approvals/command-center", () => ({
      getApprovalCommandCenter
    }));
    vi.doMock("@/lib/auth/current-user", () => ({
      getCurrentUser: vi.fn(async () => ({
        id: "user_1"
      }))
    }));
    vi.doMock("@/lib/agents/orchestration/server", () => ({
      resolveAgentOrchestrationContext: vi.fn(async () => ({
        user: {
          id: "user_1"
        },
        workspace: {
          id: "workspace_1",
          isLocalPreview: true
        },
        repositories: {
          mocked: true
        }
      }))
    }));

    const { GET } = await import("@/app/api/approvals/route");
    const response = await GET(
      new NextRequest("http://localhost:3000/api/approvals?severity=blocked&provider=linkedin&maxAgeHours=24")
    );

    expect(response.status).toBe(200);
    expect(getApprovalCommandCenter).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({
          maxAgeHours: 24,
          provider: "linkedin",
          severity: "blocked"
        }),
        isLocalPreview: true,
        workspaceId: "workspace_1"
      })
    );
  });
});
