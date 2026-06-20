import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createN8nClient, N8nDispatchError } from "@/lib/n8n/client";
import { createN8nSignature, verifyN8nSignature } from "@/lib/n8n/events";

const secret = "test-n8n-secret";

describe("n8n event integration", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("dispatches signed outbound workflow events", async () => {
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
  });

  it("normalizes outbound transport failures", async () => {
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
  });

  it("validates signed n8n callbacks", async () => {
    vi.stubEnv("N8N_WEBHOOK_SECRET", secret);
    const { POST } = await import("@/app/api/webhooks/n8n/route");
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
