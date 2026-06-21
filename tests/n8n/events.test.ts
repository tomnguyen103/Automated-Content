import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createN8nSignature, verifyN8nSignature } from "@/lib/n8n/events";
import type { N8nDispatchError } from "@/lib/n8n/client";

const secret = "test-n8n-secret";

async function loadN8nModules() {
  const [{ createN8nClient }, eventLog] = await Promise.all([
    import("@/lib/n8n/client"),
    import("@/lib/n8n/event-log")
  ]);

  return { createN8nClient, eventLog };
}

describe("n8n event integration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("@/lib/n8n/event-log");
    vi.resetModules();
  });

  it("dispatches signed outbound workflow events", async () => {
    const { createN8nClient, eventLog } = await loadN8nModules();
    eventLog.clearN8nEventsForTests();
    const calls: Array<{ input: string | URL; init?: RequestInit }> = [];
    const fetcher = vi.fn(async (input: string | URL, init?: RequestInit) => {
      calls.push({ input, init });
      return new Response(JSON.stringify({ ok: true }), { status: 202 });
    });
    const client = createN8nClient({
      fetcher,
      secret,
      webhookUrl: "https://n8n.example.test/webhook/app-events",
      now: () => new Date("2026-06-20T12:00:00.000Z")
    });

    const result = await client.emit({
      id: "evt_test_1",
      event: "publishing.post.failed",
      workspaceId: "workspace_1",
      data: {
        provider: "linkedin",
        scheduledJobId: "job_1"
      }
    });
    const { init } = calls[0];
    const body = String(init?.body);

    expect(result).toEqual({
      eventId: "evt_test_1",
      responseStatus: 202,
      status: "delivered"
    });
    expect(init?.headers).toMatchObject({
      "content-type": "application/json",
      "x-automated-content-event": "publishing.post.failed",
      "x-automated-content-timestamp": "1781956800000"
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(
      verifyN8nSignature({
        body,
        now: new Date("2026-06-20T12:00:00.000Z"),
        secret,
        signature: (init?.headers as Record<string, string>)["x-automated-content-signature"],
        timestamp: (init?.headers as Record<string, string>)["x-automated-content-timestamp"]
      })
    ).toBe(true);
    expect(JSON.parse(body)).toMatchObject({
      id: "evt_test_1",
      event: "publishing.post.failed",
      workspaceId: "workspace_1"
    });
    expect(eventLog.listN8nEventsForTests()).toEqual([
      expect.objectContaining({
        id: "evt_test_1",
        direction: "outbound",
        eventType: "publishing.post.failed",
        responseStatus: 202,
        status: "delivered",
        workspaceId: "workspace_1"
      })
    ]);
  });

  it("keeps dispatching when audit logging fails", async () => {
    vi.resetModules();
    vi.doMock("@/lib/n8n/event-log", () => ({
      recordN8nEvent: vi.fn(async () => {
        throw new Error("audit unavailable");
      })
    }));

    const { createN8nClient } = await import("@/lib/n8n/client");
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 202 }));
    const client = createN8nClient({
      fetcher,
      secret,
      webhookUrl: "https://n8n.example.test/webhook/app-events",
      now: () => new Date("2026-06-20T12:00:00.000Z")
    });

    await expect(
      client.emit({
        id: "evt_audit_error",
        event: "publishing.post.failed",
        workspaceId: "workspace_1"
      })
    ).resolves.toMatchObject({
      eventId: "evt_audit_error",
      responseStatus: 202,
      status: "delivered"
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("normalizes outbound transport failures", async () => {
    const { createN8nClient, eventLog } = await loadN8nModules();
    eventLog.clearN8nEventsForTests();
    const client = createN8nClient({
      fetcher: vi.fn(async () => {
        throw new Error("Network unavailable");
      }),
      secret,
      webhookUrl: "https://n8n.example.test/webhook/app-events",
      now: () => new Date("2026-06-20T12:00:00.000Z")
    });

    await expect(
      client.emit({
        id: "evt_network_error",
        event: "publishing.post.failed",
        workspaceId: "workspace_1"
      })
    ).rejects.toMatchObject({
      name: "N8nDispatchError",
      status: 0
    } satisfies Partial<N8nDispatchError>);
    expect(eventLog.listN8nEventsForTests()).toEqual([
      expect.objectContaining({
        id: "evt_network_error",
        direction: "outbound",
        responseStatus: 0,
        status: "failed",
        workspaceId: "workspace_1"
      })
    ]);
  });

  it("clears stale failure details when an event retry succeeds", async () => {
    const { eventLog } = await loadN8nModules();
    eventLog.clearN8nEventsForTests();

    await eventLog.recordN8nEvent({
      id: "evt_retry",
      workspaceId: "workspace_1",
      direction: "outbound",
      eventType: "publishing.post.failed",
      status: "failed",
      payload: { id: "evt_retry" },
      responseStatus: 500,
      error: "n8n unavailable"
    });
    await eventLog.recordN8nEvent({
      id: "evt_retry",
      workspaceId: "workspace_1",
      direction: "outbound",
      eventType: "publishing.post.failed",
      status: "delivered",
      payload: { id: "evt_retry" },
      responseStatus: 202
    });

    expect(eventLog.listN8nEventsForTests()).toEqual([
      expect.objectContaining({
        id: "evt_retry",
        status: "delivered",
        responseStatus: 202,
        error: undefined
      })
    ]);
  });

  it("validates signed n8n callbacks", async () => {
    vi.stubEnv("N8N_WEBHOOK_SECRET", secret);
    const [{ POST }, eventLog] = await Promise.all([
      import("@/app/api/webhooks/n8n/route"),
      import("@/lib/n8n/event-log")
    ]);
    eventLog.clearN8nEventsForTests();
    const body = JSON.stringify({
      id: "callback_1",
      workflow: "publish-failure-alert",
      status: "completed",
      eventId: "evt_test_1",
      workspaceId: "workspace_1",
      data: {
        executionId: "42"
      }
    });
    const timestamp = String(Date.now());
    const signature = createN8nSignature({ body, secret, timestamp });
    const response = await POST(
      new NextRequest("http://localhost:3000/api/webhooks/n8n", {
        method: "POST",
        headers: {
          "x-automated-content-signature": signature,
          "x-automated-content-timestamp": timestamp
        },
        body
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      acknowledged: true,
      callback: {
        id: "callback_1",
        status: "completed",
        workflow: "publish-failure-alert"
      }
    });
    expect(eventLog.listN8nEventsForTests()).toEqual([
      expect.objectContaining({
        id: "evt_test_1:callback_1",
        callbackId: "callback_1",
        direction: "callback",
        status: "completed",
        workflow: "publish-failure-alert",
        workspaceId: "workspace_1"
      })
    ]);
  });

  it("rejects unsigned n8n callbacks before parsing payloads", async () => {
    vi.stubEnv("N8N_WEBHOOK_SECRET", secret);
    const { POST } = await import("@/app/api/webhooks/n8n/route");
    const response = await POST(
      new NextRequest("http://localhost:3000/api/webhooks/n8n", {
        method: "POST",
        body: "{bad json"
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toBe("Invalid n8n webhook signature.");
  });

  it("rejects malformed signed callback payloads", async () => {
    vi.stubEnv("N8N_WEBHOOK_SECRET", secret);
    const { POST } = await import("@/app/api/webhooks/n8n/route");
    const body = JSON.stringify({
      id: "callback_2",
      workflow: "publish-failure-alert",
      status: "unknown"
    });
    const timestamp = String(Date.now());
    const signature = createN8nSignature({ body, secret, timestamp });
    const response = await POST(
      new NextRequest("http://localhost:3000/api/webhooks/n8n", {
        method: "POST",
        headers: {
          "x-automated-content-signature": signature,
          "x-automated-content-timestamp": timestamp
        },
        body
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Invalid n8n callback payload.");
  });

  it("rejects stale signed n8n callbacks", async () => {
    vi.stubEnv("N8N_WEBHOOK_SECRET", secret);
    const { POST } = await import("@/app/api/webhooks/n8n/route");
    const body = JSON.stringify({
      id: "callback_stale",
      workflow: "publish-failure-alert",
      status: "completed",
      eventId: "evt_test_1",
      workspaceId: "workspace_1"
    });
    const timestamp = new Date("2020-01-01T00:00:00.000Z").getTime().toString();
    const signature = createN8nSignature({ body, secret, timestamp });
    const response = await POST(
      new NextRequest("http://localhost:3000/api/webhooks/n8n", {
        method: "POST",
        headers: {
          "x-automated-content-signature": signature,
          "x-automated-content-timestamp": timestamp
        },
        body
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toBe("Invalid n8n webhook signature.");
  });
});
