import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/agent-runs/[id]/route";
import { POST } from "@/app/api/ai/generate/route";
import { clearAgentStorageForTests } from "@/lib/agents/langchain/storage";

describe("AI generate API", () => {
  it("generates a content pack and exposes the agent run", async () => {
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
});
