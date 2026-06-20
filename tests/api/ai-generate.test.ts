import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadApiModules() {
  const [
    { POST: generate },
    { GET },
    { POST: approve },
    { clearAgentStorageForTests },
    { clearContentWorkflowCheckpointsForTests }
  ] = await Promise.all([
    import("@/app/api/ai/generate/route"),
    import("@/app/api/agent-runs/[id]/route"),
    import("@/app/api/agent-runs/[id]/approval/route"),
    import("@/lib/agents/langchain/storage"),
    import("@/lib/agents/graphs/checkpoints")
  ]);

  return { generate, GET, approve, clearAgentStorageForTests, clearContentWorkflowCheckpointsForTests };
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
    vi.resetModules();
  });

  it("generates a content pack and exposes the agent run", async () => {
    const { generate, GET, approve, clearAgentStorageForTests, clearContentWorkflowCheckpointsForTests } = await loadApiModules();
    clearAgentStorageForTests();
    clearContentWorkflowCheckpointsForTests();

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
