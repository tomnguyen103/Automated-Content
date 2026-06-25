import { describe, expect, it } from "vitest";
import {
  buildReleaseReadinessReport,
  formatReleaseReadinessMarkdown,
  getReleaseReadinessInputsFromCli,
  requiredReleaseGateCommands,
  type ReleaseGateResult
} from "@/lib/release/readiness";

const completeEnv = {
  AI_PROVIDER: "openai",
  BILLING_CUSTOMER_PORTAL_URL: "https://billing.automatedcontent.dev/portal",
  BILLING_UPGRADE_URL: "https://billing.automatedcontent.dev/checkout",
  CLERK_SECRET_KEY: "sk_live_clerk_123",
  CLERK_WEBHOOK_SIGNING_SECRET: "whsec_prod_123",
  DATABASE_URL: "postgres://app_user:prod_password@db.automatedcontent.dev:5432/app",
  ARCJET_KEY: "arcjet_prod_123",
  ARCJET_MODE: "protect",
  DEEPGRAM_API_KEY: "deepgram-prod-123",
  IMAGEKIT_PRIVATE_KEY: "private_prod_123",
  IMAGEKIT_PUBLIC_KEY: "public_prod_123",
  IMAGEKIT_URL_ENDPOINT: "https://ik.imagekit.io/automatedcontent",
  LANGSMITH_API_KEY: "lsv2_prod_123",
  LANGSMITH_PROJECT: "automated-content-production",
  LINKEDIN_CLIENT_ID: "linkedin-prod-client-123",
  LINKEDIN_CLIENT_SECRET: "linkedin-prod-client-value-123",
  LINKEDIN_REDIRECT_URI: "https://app.automatedcontent.dev/api/connections/linkedin/callback",
  NEXT_PUBLIC_APP_URL: "https://app.automatedcontent.dev",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_clerk_123",
  N8N_WEBHOOK_SECRET: "n8n-prod-webhook-value-123",
  N8N_WEBHOOK_URL: "https://n8n.automatedcontent.dev/webhook",
  LUMA_API_KEY: "luma-prod-123",
  OBJECT_STORAGE_ACCESS_KEY_ID: "storage-prod-access-key",
  OBJECT_STORAGE_BUCKET: "automated-content-prod-video",
  OBJECT_STORAGE_PROVIDER: "s3",
  OBJECT_STORAGE_PUBLIC_BASE_URL: "https://media.automatedcontent.dev",
  OBJECT_STORAGE_REGION: "us-east-1",
  OBJECT_STORAGE_SECRET_ACCESS_KEY: "storage-prod-secret-key",
  OBJECT_STORAGE_SIGNED_UPLOAD_MAX_BYTES: "5368709120",
  OPENAI_API_KEY: "sk-prod-123",
  PROVIDER_TOKEN_ENCRYPTION_KEY: "6e22b57d97484b67920c2f1b83e7db50",
  REDIS_URL: "rediss://redis.automatedcontent.dev:6379",
  REMOTION_RENDERER_MODE: "lambda",
  TRIGGER_PROJECT_REF: "proj_prod_automated_content",
  TRIGGER_SECRET_KEY: "tr_prod_123",
  TRIGGER_VERSION: "20260625.1",
  X_CLIENT_ID: "x-prod-client-123",
  X_REDIRECT_URI: "https://app.automatedcontent.dev/api/connections/x/callback"
};

const passingGates: ReleaseGateResult[] = requiredReleaseGateCommands.map((command) => ({
  command,
  status: "pass"
}));

const passedManualChecks = {
  "billing-redirects": "pass",
  "drizzle-migrations": "pass",
  "live-provider-publish": "pass",
  "media-job-smoke": "pass",
  "n8n-callback": "pass",
  "object-storage-upload-read": "pass",
  "product-smoke": "pass",
  "render-artifact-fetch": "pass",
  "trigger-smoke-task": "pass",
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
        }),
        expect.objectContaining({
          id: "imagekit-private-key",
          status: "blocked"
        }),
        expect.objectContaining({
          id: "langsmith-api-key",
          status: "blocked"
        }),
        expect.objectContaining({
          id: "trigger-secret-key",
          status: "blocked"
        }),
        expect.objectContaining({
          id: "object-storage-bucket",
          status: "blocked"
        }),
        expect.objectContaining({
          id: "deepgram-api-key",
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

  it("blocks placeholder and local production configuration values", () => {
    const report = buildReleaseReadinessReport({
      env: {
        ...completeEnv,
        BILLING_UPGRADE_URL: "https://billing.example.com/checkout",
        DATABASE_URL: "postgres://app_user:password@localhost:5432/app",
        NEXT_PUBLIC_APP_URL: "http://localhost:3000",
        OBJECT_STORAGE_PUBLIC_BASE_URL: "https://media.example.com",
        OPENAI_API_KEY: "sk-local-placeholder",
        REDIS_URL: "redis://127.0.0.1:6379"
      },
      gateResults: passingGates,
      manualChecks: passedManualChecks,
      now: new Date("2026-06-24T12:00:00.000Z")
    });

    expect(report.ready).toBe(false);
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "app-url",
          status: "blocked"
        }),
        expect.objectContaining({
          id: "billing-upgrade-url",
          status: "blocked"
        }),
        expect.objectContaining({
          id: "database-url",
          status: "blocked"
        }),
        expect.objectContaining({
          id: "redis-url",
          status: "blocked"
        }),
        expect.objectContaining({
          id: "object-storage-public-base-url",
          status: "blocked"
        }),
        expect.objectContaining({
          id: "ai-provider-key",
          status: "blocked"
        })
      ])
    );
  });

  it("blocks production URL checks with unsupported schemes", () => {
    const report = buildReleaseReadinessReport({
      env: {
        ...completeEnv,
        N8N_WEBHOOK_URL: "http://n8n.automatedcontent.dev/webhook"
      },
      gateResults: passingGates,
      manualChecks: passedManualChecks,
      now: new Date("2026-06-24T12:00:00.000Z")
    });

    expect(report.ready).toBe(false);
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "n8n-webhook-url",
          status: "blocked",
          detail: expect.stringContaining("N8N_WEBHOOK_URL must use https.")
        })
      ])
    );
  });

  it("allows placeholder-like words in production URL paths and query strings", () => {
    const report = buildReleaseReadinessReport({
      env: {
        ...completeEnv,
        N8N_WEBHOOK_URL: "https://n8n.automatedcontent.dev/webhooks/test?mode=local"
      },
      gateResults: passingGates,
      manualChecks: passedManualChecks,
      now: new Date("2026-06-24T12:00:00.000Z")
    });

    expect(report.ready).toBe(true);
    expect(report.blockerCount).toBe(0);
  });

  it("accepts explicit CLI confirmations for completed gates and manual smoke checks", () => {
    const cliInputs = getReleaseReadinessInputsFromCli({
      args: ["--confirm-gates-passed", "--confirm-manual-smoke-passed"],
      env: {}
    });
    const report = buildReleaseReadinessReport({
      env: completeEnv,
      ...cliInputs,
      now: new Date("2026-06-24T12:00:00.000Z")
    });

    expect(cliInputs.confirmationMessages).toEqual([
      "Local gates marked passed via operator confirmation.",
      "Manual smoke checks marked passed via operator confirmation."
    ]);
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "npm run lint",
          detail: "Gate marked passed via operator confirmation."
        }),
        expect.objectContaining({
          label: "Production product smoke",
          detail:
            "Open Dashboard, Create, Calendar, Media, Auto Replies, Billing, and Analytics without console errors. Operator confirmed this manual smoke check passed."
        })
      ])
    );
    expect(report.ready).toBe(true);
    expect(report.blockerCount).toBe(0);
    expect(report.manualCount).toBe(0);
    expect(report.passedCount).toBe(report.checks.length);
  });

  it("accepts env confirmations for completed gates and manual smoke checks", () => {
    const cliInputs = getReleaseReadinessInputsFromCli({
      args: [],
      env: {
        RELEASE_CONFIRM_GATES_PASSED: "1",
        RELEASE_CONFIRM_MANUAL_SMOKE_PASSED: " true "
      }
    });
    const report = buildReleaseReadinessReport({
      env: completeEnv,
      ...cliInputs,
      now: new Date("2026-06-24T12:00:00.000Z")
    });

    expect(cliInputs.confirmationMessages).toEqual([
      "Local gates marked passed via operator confirmation.",
      "Manual smoke checks marked passed via operator confirmation."
    ]);
    expect(report.ready).toBe(true);
    expect(report.blockerCount).toBe(0);
    expect(report.manualCount).toBe(0);
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

  it("blocks invalid signed upload limits and enabled Sentry without a DSN", () => {
    const report = buildReleaseReadinessReport({
      env: {
        ...completeEnv,
        OBJECT_STORAGE_SIGNED_UPLOAD_MAX_BYTES: "0",
        SENTRY_ENABLED: "1",
        SENTRY_DSN: ""
      },
      gateResults: passingGates,
      manualChecks: passedManualChecks,
      now: new Date("2026-06-24T12:00:00.000Z")
    });

    expect(report.ready).toBe(false);
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "object-storage-signed-upload-max-bytes",
          status: "blocked"
        }),
        expect.objectContaining({
          id: "sentry-dsn",
          status: "blocked"
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
    expect(markdown).not.toContain("sk-prod-123");
    expect(markdown).not.toContain("6e22b57d97484b67920c2f1b83e7db50");
    expect(markdown).not.toContain("n8n-prod-webhook-value-123");
    expect(markdown).not.toContain("private_prod_123");
    expect(markdown).not.toContain("lsv2_prod_123");
  });
});
