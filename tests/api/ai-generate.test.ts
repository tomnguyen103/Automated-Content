import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadApiModules() {
  const [
    { POST: generate },
    { GET },
    { POST: approve },
    { clearAgentStorageForTests },
    { clearContentWorkflowCheckpointsForTests },
    { clearBrandMemoryProposalsForTests }
  ] = await Promise.all([
    import("@/app/api/ai/generate/route"),
    import("@/app/api/agent-runs/[id]/route"),
    import("@/app/api/agent-runs/[id]/approval/route"),
    import("@/lib/agents/langchain/storage"),
    import("@/lib/agents/graphs/checkpoints"),
    import("@/lib/brand-memory/proposals")
  ]);

  return {
    generate,
    GET,
    approve,
    clearAgentStorageForTests,
    clearContentWorkflowCheckpointsForTests,
    clearBrandMemoryProposalsForTests
  };
}

describe("AI generate API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("AUTH_LOCAL_PREVIEW", "1");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("PLAYWRIGHT_AUTH_LOCAL_PREVIEW", "1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("@/lib/agents/graphs/content-workflow");
    vi.doUnmock("@/lib/agents/graphs/checkpoints");
    vi.doUnmock("@/lib/agents/langchain/storage");
    vi.doUnmock("@/lib/auth/current-user");
    vi.doUnmock("@/lib/billing/usage");
    vi.doUnmock("@/lib/workspaces/personal-workspace");
    vi.resetModules();
  });

  it("generates a content pack and exposes the agent run", async () => {
    const {
      generate,
      GET,
      approve,
      clearAgentStorageForTests,
      clearContentWorkflowCheckpointsForTests,
      clearBrandMemoryProposalsForTests
    } = await loadApiModules();
    clearAgentStorageForTests();
    clearContentWorkflowCheckpointsForTests();
    clearBrandMemoryProposalsForTests();

    const request = new NextRequest("http://localhost:3000/api/ai/generate", {
      method: "POST",
      body: JSON.stringify({
        topic: "AI content calendars",
        audience: "founders",
        tone: "clear",
        goal: "educate",
        sources: ["Manual review before publishing."],
        platforms: ["linkedin", "x"]
      })
    });
    const response = await generate(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.contentPack.variants).toHaveLength(2);
    expect(payload.run.status).toBe("running");
    expect(payload.workflow.status).toBe("awaiting_review");
    expect(payload.draft).toBeNull();

    const getResponse = await GET(new Request(`http://localhost:3000/api/agent-runs/${payload.run.id}`), {
      params: Promise.resolve({ id: payload.run.id })
    });
    const getPayload = await getResponse.json();

    expect(getResponse.status).toBe(200);
    expect(getPayload.run.id).toBe(payload.run.id);
    expect(getPayload.workflow.runId).toBe(payload.run.id);

    const approveResponse = await approve(
      new Request(`http://localhost:3000/api/agent-runs/${payload.run.id}/approval`, {
        method: "POST",
        body: JSON.stringify({
          action: "approve",
          contentPack: {
            ...payload.contentPack,
            captions: ["Edited API caption"]
          }
        })
      }),
      {
        params: Promise.resolve({ id: payload.run.id })
      }
    );
    const approvePayload = await approveResponse.json();

    expect(approveResponse.status).toBe(200);
    expect(approvePayload.run.status).toBe("succeeded");
    expect(approvePayload.workflow.status).toBe("succeeded");
    expect(approvePayload.contentPack.captions[0]).toBe("Edited API caption");
    expect(approvePayload.draft.status).toBe("saved");
    expect(approvePayload.brandMemoryProposals).toEqual([
      expect.objectContaining({
        status: "pending",
        originalText: payload.contentPack.captions[0],
        editedText: "Edited API caption"
      })
    ]);
  });

  it("returns a 400 when approval edits target another content pack", async () => {
    const { generate, approve, clearAgentStorageForTests, clearContentWorkflowCheckpointsForTests } = await loadApiModules();
    clearAgentStorageForTests();
    clearContentWorkflowCheckpointsForTests();

    const response = await generate(
      new NextRequest("http://localhost:3000/api/ai/generate", {
        method: "POST",
        body: JSON.stringify({
          topic: "AI content calendars",
          audience: "founders",
          tone: "clear",
          goal: "educate",
          sources: ["Manual review before publishing."],
          platforms: ["linkedin"]
        })
      })
    );
    const payload = await response.json();
    const approveResponse = await approve(
      new Request(`http://localhost:3000/api/agent-runs/${payload.run.id}/approval`, {
        method: "POST",
        body: JSON.stringify({
          action: "approve",
          contentPack: {
            ...payload.contentPack,
            id: "different_content_pack"
          }
        })
      }),
      {
        params: Promise.resolve({ id: payload.run.id })
      }
    );
    const approvePayload = await approveResponse.json();

    expect(approveResponse.status).toBe(400);
    expect(approvePayload.error).toBe("Edited content pack does not match this workflow.");
  });

  it("returns a 400 for malformed JSON", async () => {
    const { generate, clearAgentStorageForTests, clearContentWorkflowCheckpointsForTests } = await loadApiModules();
    clearAgentStorageForTests();
    clearContentWorkflowCheckpointsForTests();

    const response = await generate(
      new NextRequest("http://localhost:3000/api/ai/generate", {
        method: "POST",
        body: "{bad json"
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Invalid JSON payload.");
  });

  it("atomically consumes AI generation usage for workspace-backed users", async () => {
    vi.resetModules();
    vi.stubEnv("AUTH_LOCAL_PREVIEW", "");
    vi.stubEnv("PLAYWRIGHT_AUTH_LOCAL_PREVIEW", "");

    const consumeUsageForLimit = vi.fn(async () => null);
    const runContentWorkflow = vi.fn(async () => ({
      run: { id: "run_usage_1", status: "succeeded" },
      workflow: { runId: "run_usage_1", status: "succeeded" },
      contentPack: { id: "pack_usage_1", variants: [] },
      draft: null
    }));

    vi.doMock("@/lib/auth/current-user", () => ({
      getCurrentUser: vi.fn(async () => ({
        id: "user_usage_1",
        email: "user@example.com",
        name: "User Usage",
        imageUrl: null,
        initials: "UU",
        isLocalPreview: false
      }))
    }));
    vi.doMock("@/lib/workspaces/personal-workspace", () => ({
      resolvePersonalWorkspaceForUser: vi.fn(async () => ({
        id: "workspace_usage_1",
        role: "owner",
        isLocalPreview: false
      }))
    }));
    vi.doMock("@/lib/billing/usage", () => ({
      UsageLimitExceededError: class UsageLimitExceededError extends Error {},
      consumeUsageForLimit
    }));
    vi.doMock("@/lib/agents/langchain/storage", () => ({
      createAgentStorage: vi.fn(() => ({ mocked: "storage" }))
    }));
    vi.doMock("@/lib/agents/graphs/checkpoints", () => ({
      createContentWorkflowCheckpointStore: vi.fn(() => ({ mocked: "checkpoints" }))
    }));
    vi.doMock("@/lib/agents/graphs/content-workflow", () => ({
      ContentWorkflowExecutionError: class ContentWorkflowExecutionError extends Error {},
      runContentWorkflow
    }));

    const { POST } = await import("@/app/api/ai/generate/route");
    const response = await POST(
      new NextRequest("http://localhost:3000/api/ai/generate", {
        method: "POST",
        body: JSON.stringify({
          topic: "Usage gates",
          audience: "operators",
          tone: "clear",
          goal: "educate",
          platforms: ["linkedin"]
        })
      })
    );

    expect(response.status).toBe(200);
    expect(consumeUsageForLimit).toHaveBeenCalledWith({
      workspaceId: "workspace_usage_1",
      key: "aiGenerationsPerMonth",
      metadata: {
        platforms: ["linkedin"],
        userId: "user_usage_1"
      },
      skip: false
    });
    expect(runContentWorkflow).toHaveBeenCalledOnce();
  });

  it("returns a 429 when AI generation usage is exhausted", async () => {
    vi.resetModules();
    vi.stubEnv("AUTH_LOCAL_PREVIEW", "");
    vi.stubEnv("PLAYWRIGHT_AUTH_LOCAL_PREVIEW", "");

    const metric = {
      key: "aiGenerationsPerMonth",
      label: "AI generations",
      used: 25,
      limit: 25,
      remaining: 0,
      allowed: false,
      cadence: "monthly"
    };
    class UsageLimitExceededError extends Error {
      readonly metric = metric;

      constructor() {
        super("AI generations limit reached for the current plan.");
      }
    }
    const consumeUsageForLimit = vi.fn(async () => {
      throw new UsageLimitExceededError();
    });
    const runContentWorkflow = vi.fn();

    vi.doMock("@/lib/auth/current-user", () => ({
      getCurrentUser: vi.fn(async () => ({
        id: "user_usage_1",
        email: "user@example.com",
        name: "User Usage",
        imageUrl: null,
        initials: "UU",
        isLocalPreview: false
      }))
    }));
    vi.doMock("@/lib/workspaces/personal-workspace", () => ({
      resolvePersonalWorkspaceForUser: vi.fn(async () => ({
        id: "workspace_usage_1",
        role: "owner",
        isLocalPreview: false
      }))
    }));
    vi.doMock("@/lib/billing/usage", () => ({
      UsageLimitExceededError,
      consumeUsageForLimit
    }));
    vi.doMock("@/lib/agents/graphs/content-workflow", () => ({
      ContentWorkflowExecutionError: class ContentWorkflowExecutionError extends Error {},
      runContentWorkflow
    }));

    const { POST } = await import("@/app/api/ai/generate/route");
    const response = await POST(
      new NextRequest("http://localhost:3000/api/ai/generate", {
        method: "POST",
        body: JSON.stringify({
          topic: "Usage gates",
          audience: "operators",
          tone: "clear",
          goal: "educate",
          platforms: ["linkedin"]
        })
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload.error).toBe("AI generations limit reached for the current plan.");
    expect(payload.usage).toEqual(metric);
    expect(runContentWorkflow).not.toHaveBeenCalled();
  });

  it("returns a 404 when an approval checkpoint is missing", async () => {
    const { approve, clearAgentStorageForTests, clearContentWorkflowCheckpointsForTests } = await loadApiModules();
    clearAgentStorageForTests();
    clearContentWorkflowCheckpointsForTests();

    const response = await approve(
      new Request("http://localhost:3000/api/agent-runs/missing_run/approval", {
        method: "POST",
        body: JSON.stringify({
          action: "approve"
        })
      }),
      {
        params: Promise.resolve({ id: "missing_run" })
      }
    );
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toBe("Workflow checkpoint not found.");
  });
});
