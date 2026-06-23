import { describe, expect, it, vi } from "vitest";
import {
  registerWorkerShutdownHandlers,
  startSocialWorkerRuntime
} from "@/workers/social-worker";

function createWorkerStub() {
  return {
    close: vi.fn(async () => undefined)
  };
}

describe("social worker runtime", () => {
  it("starts publishing and agent mission workers with shared Redis configuration", async () => {
    const publishingWorker = createWorkerStub();
    const missionWorker = createWorkerStub();
    const createPublishingWorker = vi.fn(() => publishingWorker as never);
    const createMissionWorker = vi.fn(() => missionWorker as never);
    const logger = {
      error: vi.fn(),
      log: vi.fn()
    };

    const runtime = startSocialWorkerRuntime({
      agentMissionConcurrency: 3,
      createMissionWorker,
      createPublishingWorker,
      logger,
      publishingConcurrency: 7,
      redisUrl: "redis://localhost:6379/0"
    });

    expect(createPublishingWorker).toHaveBeenCalledWith({
      concurrency: 7,
      redisUrl: "redis://localhost:6379/0"
    });
    expect(createMissionWorker).toHaveBeenCalledWith({
      concurrency: 3,
      redisUrl: "redis://localhost:6379/0"
    });
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining("Social worker runtime started")
    );

    await runtime.close();

    expect(publishingWorker.close).toHaveBeenCalledOnce();
    expect(missionWorker.close).toHaveBeenCalledOnce();
  });

  it("closes a created publishing worker when mission worker creation fails", () => {
    const publishingWorker = createWorkerStub();
    const createPublishingWorker = vi.fn(() => publishingWorker as never);
    const createMissionWorker = vi.fn(() => {
      throw new Error("mission worker failed");
    });

    expect(() =>
      startSocialWorkerRuntime({
        createMissionWorker,
        createPublishingWorker,
        logger: {
          error: vi.fn(),
          log: vi.fn()
        },
        redisUrl: "redis://localhost:6379/0"
      })
    ).toThrow("mission worker failed");
    expect(publishingWorker.close).toHaveBeenCalledOnce();
  });

  it("unregisters shutdown handlers without closing workers", () => {
    const runtime = {
      close: vi.fn(async () => undefined),
      workers: []
    };
    const offSpy = vi.spyOn(process, "off");
    const onceSpy = vi.spyOn(process, "once");

    const unregister = registerWorkerShutdownHandlers({
      logger: {
        error: vi.fn(),
        log: vi.fn()
      },
      runtime
    });
    unregister();

    expect(onceSpy).toHaveBeenCalledWith("SIGINT", expect.any(Function));
    expect(onceSpy).toHaveBeenCalledWith("SIGTERM", expect.any(Function));
    expect(offSpy).toHaveBeenCalledWith("SIGINT", expect.any(Function));
    expect(offSpy).toHaveBeenCalledWith("SIGTERM", expect.any(Function));
    expect(runtime.close).not.toHaveBeenCalled();

    onceSpy.mockRestore();
    offSpy.mockRestore();
  });
});
