import { describe, expect, it } from "vitest";
import { createContentModel } from "@/lib/agents/langchain/model-factory";

describe("model factory", () => {
  it("selects OpenAI from AI_PROVIDER", () => {
    const model = createContentModel({
      env: {
        AI_PROVIDER: "openai",
        OPENAI_API_KEY: "sk-test",
        GEMINI_API_KEY: undefined
      }
    });

    expect(model.provider).toBe("openai");
    expect(model.mode).toBe("remote");
  });

  it("selects Gemini from AI_PROVIDER", () => {
    const model = createContentModel({
      env: {
        AI_PROVIDER: "gemini",
        OPENAI_API_KEY: undefined,
        GEMINI_API_KEY: "test-key"
      }
    });

    expect(model.provider).toBe("gemini");
    expect(model.model).toBe("gemini-2.5-flash");
  });

  it("uses local structured generation without provider keys", () => {
    const model = createContentModel({
      env: {
        AI_PROVIDER: "openai",
        OPENAI_API_KEY: undefined,
        GEMINI_API_KEY: undefined
      }
    });

    expect(model.mode).toBe("local");
  });
});
