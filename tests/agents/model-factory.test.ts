import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCommentModel, createContentModel } from "@/lib/agents/langchain/model-factory";

describe("model factory", () => {
  beforeEach(() => {
    vi.stubEnv("PLAYWRIGHT_AUTH_LOCAL_PREVIEW", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

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

  it("selects remote comment models through the shared provider factory", () => {
    const model = createCommentModel({
      env: {
        AI_PROVIDER: "openai",
        OPENAI_API_KEY: "sk-test",
        GEMINI_API_KEY: undefined
      }
    });

    expect(model.provider).toBe("openai");
    expect(model.mode).toBe("remote");
  });
});
