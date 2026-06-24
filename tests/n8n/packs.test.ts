import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildN8nPackSetupChecklist,
  n8nAutomationPacks
} from "@/lib/n8n/packs";
import { n8nEventTypeSchema } from "@/lib/n8n/events";

function readWorkflowTemplate(workflowFile: string) {
  return JSON.parse(readFileSync(join(process.cwd(), workflowFile), "utf8")) as {
    name: string;
    nodes: Array<{ name: string; type: string }>;
    connections: Record<string, unknown>;
  };
}

describe("n8n automation packs", () => {
  it("ships the three supported release workflow packs", () => {
    expect(n8nAutomationPacks.map((pack) => pack.id)).toEqual([
      "publish-failure-alert",
      "reply-approval-reminder",
      "usage-threshold-alert"
    ]);

    for (const pack of n8nAutomationPacks) {
      expect(() => n8nEventTypeSchema.parse(pack.triggerEvent)).not.toThrow();
      expect(pack.requiredAppEnv).toEqual([
        "N8N_WEBHOOK_URL",
        "N8N_WEBHOOK_SECRET",
        "NEXT_PUBLIC_APP_URL"
      ]);
      expect(pack.requiredN8nVariables).toContain("AUTOMATED_CONTENT_WEBHOOK_SECRET");
      expect(pack.requiredN8nVariables).toContain("AUTOMATED_CONTENT_CALLBACK_URL");
      expect(pack.supportedActions.length).toBeGreaterThan(0);
      expect(pack.unsupportedActions).toEqual(
        expect.arrayContaining([expect.stringMatching(/Retry|Approve|Upgrade|Rotating|Change|Reset/)])
      );
    }
  });

  it("keeps registry metadata aligned with importable workflow templates", () => {
    for (const pack of n8nAutomationPacks) {
      const workflow = readWorkflowTemplate(pack.workflowFile);

      expect(workflow.name).toContain("Automated Content");
      expect(workflow.nodes.length).toBeGreaterThanOrEqual(4);
      expect(workflow.nodes.map((node) => node.type)).toEqual(
        expect.arrayContaining([
          "n8n-nodes-base.webhook",
          "n8n-nodes-base.code",
          "n8n-nodes-base.if",
          "n8n-nodes-base.httpRequest",
          "n8n-nodes-base.respondToWebhook"
        ])
      );
      expect(workflow.nodes.map((node) => node.name)).toContain("Validate signature");
      expect(JSON.stringify(workflow)).toContain(pack.triggerEvent);
      expect(JSON.stringify(workflow)).toContain(pack.callbackWorkflow);
      expect(JSON.stringify(workflow)).toContain("AUTOMATED_CONTENT_WEBHOOK_SECRET");
      expect(Object.keys(workflow.connections)).toContain("Receive signed app event");
      expect(Object.keys(workflow.connections)).toContain("Validate signature");
    }
  });

  it("reports setup readiness without exposing secret values", () => {
    const [pack] = n8nAutomationPacks;
    const checks = buildN8nPackSetupChecklist({
      pack,
      appEnv: {
        NEXT_PUBLIC_APP_URL: "https://app.example.com",
        N8N_WEBHOOK_SECRET: "secret-value",
        N8N_WEBHOOK_URL: ""
      },
      n8nVariables: ["AUTOMATED_CONTENT_WEBHOOK_SECRET"]
    });
    const serialized = JSON.stringify(checks);

    expect(checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "app-env-n8n_webhook_url",
          status: "missing"
        }),
        expect.objectContaining({
          id: "app-env-n8n_webhook_secret",
          status: "ready"
        }),
        expect.objectContaining({
          id: "n8n-var-automated_content_callback_url",
          status: "manual"
        })
      ])
    );
    expect(serialized).not.toContain("secret-value");
  });
});
