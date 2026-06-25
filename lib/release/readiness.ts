export const requiredReleaseGateCommands = [
  "npm run lint",
  "npm run typecheck",
  "npm run test",
  "npm run build",
  "npm run test:e2e"
] as const;

export type ReleaseGateCommand = (typeof requiredReleaseGateCommands)[number];
export type ReleaseCheckStatus = "pass" | "warn" | "blocked" | "manual";

export type ReleaseGateResult = {
  command: ReleaseGateCommand;
  status: "pass" | "fail";
  detail?: string;
};

export type ReleaseReadinessCheck = {
  id: string;
  category: "local_gate" | "environment" | "automation" | "billing" | "provider" | "smoke";
  label: string;
  status: ReleaseCheckStatus;
  detail: string;
};

export type ReleaseReadinessReport = {
  generatedAt: string;
  ready: boolean;
  passedCount: number;
  warningCount: number;
  blockerCount: number;
  manualCount: number;
  checks: ReleaseReadinessCheck[];
};

type EnvMap = Record<string, string | undefined>;

const productionEnvChecks: Array<{
  id: string;
  category: ReleaseReadinessCheck["category"];
  key: string;
  label: string;
  detail: string;
}> = [
  {
    id: "app-url",
    category: "environment",
    key: "NEXT_PUBLIC_APP_URL",
    label: "Production app URL",
    detail: "Required for redirects, OAuth callbacks, and n8n callbacks."
  },
  {
    id: "clerk-client",
    category: "environment",
    key: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    label: "Clerk publishable key",
    detail: "Required for production sign-in and sign-up flows."
  },
  {
    id: "clerk-secret",
    category: "environment",
    key: "CLERK_SECRET_KEY",
    label: "Clerk secret key",
    detail: "Required for server-side auth and workspace resolution."
  },
  {
    id: "clerk-webhook",
    category: "environment",
    key: "CLERK_WEBHOOK_SIGNING_SECRET",
    label: "Clerk webhook signing secret",
    detail: "Required for user and workspace sync."
  },
  {
    id: "database-url",
    category: "environment",
    key: "DATABASE_URL",
    label: "Database URL",
    detail: "Required for production persistence."
  },
  {
    id: "provider-token-key",
    category: "provider",
    key: "PROVIDER_TOKEN_ENCRYPTION_KEY",
    label: "Provider token encryption key",
    detail: "Required before storing live provider OAuth tokens."
  },
  {
    id: "redis-url",
    category: "environment",
    key: "REDIS_URL",
    label: "Redis URL",
    detail: "Required for BullMQ publishing and agent mission workers."
  },
  {
    id: "n8n-webhook-url",
    category: "automation",
    key: "N8N_WEBHOOK_URL",
    label: "n8n event webhook URL",
    detail: "Required before outbound automation events can dispatch."
  },
  {
    id: "n8n-webhook-secret",
    category: "automation",
    key: "N8N_WEBHOOK_SECRET",
    label: "n8n webhook signing secret",
    detail: "Required for signed outbound events and callbacks."
  },
  {
    id: "billing-upgrade-url",
    category: "billing",
    key: "BILLING_UPGRADE_URL",
    label: "Billing checkout URL",
    detail: "Required for live upgrade redirects."
  },
  {
    id: "billing-portal-url",
    category: "billing",
    key: "BILLING_CUSTOMER_PORTAL_URL",
    label: "Billing customer portal URL",
    detail: "Required for live customer portal redirects."
  },
  {
    id: "linkedin-client-id",
    category: "provider",
    key: "LINKEDIN_CLIENT_ID",
    label: "LinkedIn client id",
    detail: "Required for LinkedIn OAuth."
  },
  {
    id: "linkedin-client-secret",
    category: "provider",
    key: "LINKEDIN_CLIENT_SECRET",
    label: "LinkedIn client secret",
    detail: "Required for LinkedIn OAuth exchange."
  },
  {
    id: "linkedin-redirect-uri",
    category: "provider",
    key: "LINKEDIN_REDIRECT_URI",
    label: "LinkedIn redirect URI",
    detail: "Required for OAuth callback validation."
  },
  {
    id: "x-client-id",
    category: "provider",
    key: "X_CLIENT_ID",
    label: "X client id",
    detail: "Required for X OAuth 2.0 PKCE."
  },
  {
    id: "x-redirect-uri",
    category: "provider",
    key: "X_REDIRECT_URI",
    label: "X redirect URI",
    detail: "Required for X OAuth callback validation."
  }
];

const manualSmokeChecks: Array<Omit<ReleaseReadinessCheck, "status">> = [
  {
    id: "drizzle-migrations",
    category: "smoke",
    label: "Production migrations applied",
    detail: "Confirm Drizzle migrations are applied before routing production traffic."
  },
  {
    id: "worker-process",
    category: "smoke",
    label: "Worker process is running",
    detail: "Confirm npm run worker uses the same DATABASE_URL and REDIS_URL as the web app."
  },
  {
    id: "billing-redirects",
    category: "billing",
    label: "Billing checkout and portal redirect",
    detail: "Open live checkout and portal actions with a real authenticated account."
  },
  {
    id: "live-provider-publish",
    category: "provider",
    label: "LinkedIn and X live publish smoke",
    detail: "Connect LinkedIn and X, schedule safe test posts, and confirm provider response/audit rows."
  },
  {
    id: "n8n-callback",
    category: "automation",
    label: "n8n callback smoke",
    detail: "Emit a test n8n event and confirm /api/webhooks/n8n records the signed callback."
  },
  {
    id: "product-smoke",
    category: "smoke",
    label: "Production product smoke",
    detail: "Open Dashboard, Create, Calendar, Media, Auto Replies, Billing, and Analytics without console errors."
  }
];

export const releaseReadinessCliFlags = {
  confirmGatesPassed: "--confirm-gates-passed",
  confirmManualSmokePassed: "--confirm-manual-smoke-passed"
} as const;

export const releaseReadinessEnvFlags = {
  confirmGatesPassed: "RELEASE_CONFIRM_GATES_PASSED",
  confirmManualSmokePassed: "RELEASE_CONFIRM_MANUAL_SMOKE_PASSED"
} as const;

function hasValue(env: EnvMap, key: string) {
  const value = env[key];
  return typeof value === "string" && value.trim().length > 0;
}

function hasConfirmation(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

export function buildPassingReleaseGateResults(): ReleaseGateResult[] {
  return requiredReleaseGateCommands.map((command) => ({
    command,
    status: "pass"
  }));
}

export function buildPassingManualSmokeChecks(): Partial<Record<string, ReleaseCheckStatus>> {
  return Object.fromEntries(manualSmokeChecks.map((check) => [check.id, "pass"]));
}

export function getReleaseReadinessInputsFromCli({
  args,
  env
}: {
  args: string[];
  env: Record<string, string | undefined>;
}) {
  const flags = new Set(args);

  return {
    gateResults:
      flags.has(releaseReadinessCliFlags.confirmGatesPassed) ||
      hasConfirmation(env[releaseReadinessEnvFlags.confirmGatesPassed])
        ? buildPassingReleaseGateResults()
        : [],
    manualChecks:
      flags.has(releaseReadinessCliFlags.confirmManualSmokePassed) ||
      hasConfirmation(env[releaseReadinessEnvFlags.confirmManualSmokePassed])
        ? buildPassingManualSmokeChecks()
        : {}
  };
}

function aiProviderCheck(env: EnvMap): ReleaseReadinessCheck {
  const provider = env.AI_PROVIDER;

  if (provider !== "openai" && provider !== "gemini") {
    return {
      id: "ai-provider-key",
      category: "environment",
      label: "AI provider selection",
      status: "blocked",
      detail: "AI_PROVIDER must be either 'openai' or 'gemini'."
    };
  }

  const key = provider === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY";

  return {
    id: "ai-provider-key",
    category: "environment",
    label: `${provider} API key`,
    status: hasValue(env, key) ? "pass" : "blocked",
    detail: `${key} is required for the selected AI provider.`
  };
}

function gateChecks(gateResults: ReleaseGateResult[]): ReleaseReadinessCheck[] {
  const resultByCommand = new Map(gateResults.map((result) => [result.command, result]));

  return requiredReleaseGateCommands.map((command) => {
    const result = resultByCommand.get(command);

    if (!result) {
      return {
        id: `gate-${command.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
        category: "local_gate",
        label: command,
        status: "manual",
        detail: "Run this gate and record the result before release."
      };
    }

    return {
      id: `gate-${command.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
      category: "local_gate",
      label: command,
      status: result.status === "pass" ? "pass" : "blocked",
      detail: result.detail ?? (result.status === "pass" ? "Gate passed." : "Gate failed.")
    };
  });
}

export function buildReleaseReadinessReport({
  env,
  gateResults = [],
  manualChecks = {},
  now = new Date()
}: {
  env: EnvMap;
  gateResults?: ReleaseGateResult[];
  manualChecks?: Partial<Record<string, ReleaseCheckStatus>>;
  now?: Date;
}): ReleaseReadinessReport {
  const checks: ReleaseReadinessCheck[] = [
    ...gateChecks(gateResults),
    ...productionEnvChecks.map((check): ReleaseReadinessCheck => ({
      id: check.id,
      category: check.category,
      label: check.label,
      status: hasValue(env, check.key) ? "pass" : "blocked",
      detail: check.detail
    })),
    aiProviderCheck(env),
    ...manualSmokeChecks.map((check): ReleaseReadinessCheck => ({
      ...check,
      status: manualChecks[check.id] ?? "manual"
    }))
  ];
  const passedCount = checks.filter((check) => check.status === "pass").length;
  const warningCount = checks.filter((check) => check.status === "warn").length;
  const blockerCount = checks.filter((check) => check.status === "blocked").length;
  const manualCount = checks.filter((check) => check.status === "manual").length;

  return {
    generatedAt: now.toISOString(),
    ready: blockerCount === 0 && manualCount === 0,
    passedCount,
    warningCount,
    blockerCount,
    manualCount,
    checks
  };
}

export function formatReleaseReadinessMarkdown(report: ReleaseReadinessReport) {
  const lines = [
    `# Release Readiness Report`,
    ``,
    `Generated: ${report.generatedAt}`,
    `Ready: ${report.ready ? "yes" : "no"}`,
    `Summary: ${report.passedCount} passed, ${report.warningCount} warnings, ${report.blockerCount} blockers, ${report.manualCount} manual checks.`,
    ``,
    `| Status | Category | Check | Detail |`,
    `| --- | --- | --- | --- |`
  ];

  for (const check of report.checks) {
    lines.push(`| ${check.status} | ${check.category} | ${check.label} | ${check.detail} |`);
  }

  return `${lines.join("\n")}\n`;
}
