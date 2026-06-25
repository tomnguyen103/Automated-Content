import { describe, expect, it } from "vitest";
import {
  buildReleaseReadinessReport,
  formatReleaseReadinessMarkdown,
  requiredReleaseGateCommands,
  type ReleaseGateResult
} from "@/lib/release/readiness";

const completeEnv = {
  AI_PROVIDER: "openai",
  BILLING_CUSTOMER_PORTAL_URL: "https://billing.example.com/portal",
  BILLING_UPGRADE_URL: "https://billing.example.com/checkout",
  CLERK_SECRET_KEY: "clerk-secret",
  CLERK_WEBHOOK_SIGNING_SECRET: "clerk-webhook-secret",
  DATABASE_URL: "postgres://example",
  LINKEDIN_CLIENT_ID: "linkedin-client-id",
  LINKEDIN_CLIENT_SECRET: "linkedin-client-secret",
  LINKEDIN_REDIRECT_URI: "https://app.example.com/api/connections/linkedin/callback",
  NEXT_PUBLIC_APP_URL: "https://app.example.com",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "clerk-publishable",
  N8N_WEBHOOK_SECRET: "n8n-secret",
  N8N_WEBHOOK_URL: "https://n8n.example.com/webhook",
  OPENAI_API_KEY: "openai-secret",
  PROVIDER_TOKEN_ENCRYPTION_KEY: "provider-token-key",
  REDIS_URL: "rediss://example",
  X_CLIENT_ID: "x-client-id",
  X_REDIRECT_URI: "https://app.example.com/api/connections/x/callback"
};

const passingGates: ReleaseGateResult[] = requiredReleaseGateCommands.map((command) => ({
  command,
  status: "pass"
}));

const passedManualChecks = {
  "billing-redirects": "pass",
  "drizzle-migrations": "pass",
  "live-provider-publish": "pass",
  "n8n-callback": "pass",
  "product-smoke": "pass",
  "worker-process": "pass"
} as const;

describe("release readiness", () => {
  it("blocks release when required production configuration is missing", () => {
    const report = buildReleaseReadinessReport({
      env: {
        AI_PROVIDER: "openai"
      },
      gateResults: passingGates,
      now: new Date("2026-06-24T12:00:00.000Z")
    });

    expect(report.ready).toBe(false);
    expect(report.blockerCount).toBeGreaterThan(0);
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "billing-upgrade-url",
          status: "blocked"
        }),
        expect.objectContaining({
          id: "ai-provider-key",
          status: "blocked"
        })
      ])
    );
  });

  it("marks release ready only when gates, env, and manual smoke checks pass", () => {
    const report = buildReleaseReadinessReport({
      env: completeEnv,
      gateResults: passingGates,
      manualChecks: passedManualChecks,
      now: new Date("2026-06-24T12:00:00.000Z")
    });

    expect(report.ready).toBe(true);
    expect(report.blockerCount).toBe(0);
    expect(report.manualCount).toBe(0);
    expect(report.passedCount).toBe(report.checks.length);
  });

  it("blocks unsupported AI provider values instead of falling back to OpenAI", () => {
    const report = buildReleaseReadinessReport({
      env: {
        ...completeEnv,
        AI_PROVIDER: "anthropic",
        GEMINI_API_KEY: "gemini-secret"
      },
      gateResults: passingGates,
      manualChecks: passedManualChecks,
      now: new Date("2026-06-24T12:00:00.000Z")
    });

    expect(report.ready).toBe(false);
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "ai-provider-key",
          label: "AI provider selection",
          status: "blocked",
          detail: "AI_PROVIDER must be either 'openai' or 'gemini'."
        })
      ])
    );
  });

  it("formats an operator report without leaking secret values", () => {
    const report = buildReleaseReadinessReport({
      env: completeEnv,
      gateResults: passingGates,
      now: new Date("2026-06-24T12:00:00.000Z")
    });
    const markdown = formatReleaseReadinessMarkdown(report);

    expect(report.ready).toBe(false);
    expect(report.blockerCount).toBe(0);
    expect(report.manualCount).toBeGreaterThan(0);
    expect(markdown).toContain("# Release Readiness Report");
    expect(markdown).toContain("Billing checkout URL");
    expect(markdown).not.toContain("openai-secret");
    expect(markdown).not.toContain("provider-token-key");
    expect(markdown).not.toContain("n8n-secret");
  });
});
