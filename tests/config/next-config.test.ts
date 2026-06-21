import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("next config", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("parses opt-in dev origins from the environment", async () => {
    const { parseAllowedDevOrigins } = await import("@/next.config");

    expect(parseAllowedDevOrigins("abc.ngrok-free.dev, preview.local, ,")).toEqual([
      "abc.ngrok-free.dev",
      "preview.local"
    ]);
  });

  it("does not include a committed tunnel hostname by default", async () => {
    vi.stubEnv("NEXT_ALLOWED_DEV_ORIGINS", "");
    const { default: nextConfig } = await import("@/next.config");

    expect(nextConfig.allowedDevOrigins).toEqual(["127.0.0.1"]);
  });

  it("deduplicates configured dev origins", async () => {
    vi.stubEnv("NEXT_ALLOWED_DEV_ORIGINS", "127.0.0.1,preview.local");
    const { default: nextConfig } = await import("@/next.config");

    expect(nextConfig.allowedDevOrigins).toEqual(["127.0.0.1", "preview.local"]);
  });
});
