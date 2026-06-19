import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadApiModules() {
  const [{ POST }, { GET }, { clearAgentStorageForTests }] = await Promise.all([
    import("@/app/api/ai/generate/route"),
    import("@/app/api/agent-runs/[id]/route"),
    import("@/lib/agents/langchain/storage")
  ]);

  return { POST, GET, clearAgentStorageForTests };
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
    const { POST, GET, clearAgentStorageForTests } = await loadApiModules();
    clearAgentStorageForTests();

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
    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.contentPack.variants).toHaveLength(2);
    expect(payload.run.status).toBe("succeeded");

    const getResponse = await GET(new Request(`http://localhost:3000/api/agent-runs/${payload.run.id}`), {
      params: Promise.resolve({ id: payload.run.id })
    });
    const getPayload = await getResponse.json();

    expect(getResponse.status).toBe(200);
    expect(getPayload.run.id).toBe(payload.run.id);
  });

  it("returns a 400 for malformed JSON", async () => {
    const { POST, clearAgentStorageForTests } = await loadApiModules();
    clearAgentStorageForTests();

    const response = await POST(
      new NextRequest("http://localhost:3000/api/ai/generate", {
        method: "POST",
        body: "{bad json"
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Invalid JSON payload.");
  });
});
