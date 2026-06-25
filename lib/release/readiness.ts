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
  valueKind: "string" | "url";
  allowedSchemes?: string[];
}> = [
  {
    id: "app-url",
    category: "environment",
    key: "NEXT_PUBLIC_APP_URL",
    label: "Production app URL",
    detail: "Required for redirects, OAuth callbacks, and n8n callbacks.",
    valueKind: "url",
    allowedSchemes: ["https"]
  },
  {
    id: "clerk-client",
    category: "environment",
    key: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    label: "Clerk publishable key",
    detail: "Required for production sign-in and sign-up flows.",
    valueKind: "string"
  },
  {
    id: "clerk-secret",
    category: "environment",
    key: "CLERK_SECRET_KEY",
    label: "Clerk secret key",
    detail: "Required for server-side auth and workspace resolution.",
    valueKind: "string"
  },
  {
    id: "clerk-webhook",
    category: "environment",
    key: "CLERK_WEBHOOK_SIGNING_SECRET",
    label: "Clerk webhook signing secret",
    detail: "Required for user and workspace sync.",
    valueKind: "string"
  },
  {
    id: "database-url",
    category: "environment",
    key: "DATABASE_URL",
    label: "Database URL",
    detail: "Required for production persistence.",
    valueKind: "url",
    allowedSchemes: ["postgres", "postgresql"]
  },
  {
    id: "langsmith-api-key",
    category: "environment",
    key: "LANGSMITH_API_KEY",
    label: "LangSmith API key",
    detail: "Required for production agent tracing and release observability.",
    valueKind: "string"
  },
  {
    id: "langsmith-project",
    category: "environment",
    key: "LANGSMITH_PROJECT",
    label: "LangSmith project",
    detail: "Required to route production traces into the expected LangSmith project.",
    valueKind: "string"
  },
  {
    id: "imagekit-public-key",
    category: "environment",
    key: "IMAGEKIT_PUBLIC_KEY",
    label: "ImageKit public key",
    detail: "Required for production media upload authentication.",
    valueKind: "string"
  },
  {
    id: "imagekit-private-key",
    category: "environment",
    key: "IMAGEKIT_PRIVATE_KEY",
    label: "ImageKit private key",
    detail: "Required for production media upload signatures.",
    valueKind: "string"
  },
  {
    id: "imagekit-url-endpoint",
    category: "environment",
    key: "IMAGEKIT_URL_ENDPOINT",
    label: "ImageKit URL endpoint",
    detail: "Required to verify production media asset provenance.",
    valueKind: "url",
    allowedSchemes: ["https"]
  },
  {
    id: "provider-token-key",
    category: "provider",
    key: "PROVIDER_TOKEN_ENCRYPTION_KEY",
    label: "Provider token encryption key",
    detail: "Required before storing live provider OAuth tokens.",
    valueKind: "string"
  },
  {
    id: "redis-url",
    category: "environment",
    key: "REDIS_URL",
    label: "Redis URL",
    detail: "Required for BullMQ publishing and agent mission workers.",
    valueKind: "url",
    allowedSchemes: ["redis", "rediss"]
  },
  {
    id: "n8n-webhook-url",
    category: "automation",
    key: "N8N_WEBHOOK_URL",
    label: "n8n event webhook URL",
    detail: "Required before outbound automation events can dispatch.",
    valueKind: "url",
    allowedSchemes: ["https"]
  },
  {
    id: "n8n-webhook-secret",
    category: "automation",
    key: "N8N_WEBHOOK_SECRET",
    label: "n8n webhook signing secret",
    detail: "Required for signed outbound events and callbacks.",
    valueKind: "string"
  },
  {
    id: "billing-upgrade-url",
    category: "billing",
    key: "BILLING_UPGRADE_URL",
    label: "Billing checkout URL",
    detail: "Required for live upgrade redirects.",
    valueKind: "url",
    allowedSchemes: ["https"]
  },
  {
    id: "billing-portal-url",
    category: "billing",
    key: "BILLING_CUSTOMER_PORTAL_URL",
    label: "Billing customer portal URL",
    detail: "Required for live customer portal redirects.",
    valueKind: "url",
    allowedSchemes: ["https"]
  },
  {
    id: "linkedin-client-id",
    category: "provider",
    key: "LINKEDIN_CLIENT_ID",
    label: "LinkedIn client id",
    detail: "Required for LinkedIn OAuth.",
    valueKind: "string"
  },
  {
    id: "linkedin-client-secret",
    category: "provider",
    key: "LINKEDIN_CLIENT_SECRET",
    label: "LinkedIn client secret",
    detail: "Required for LinkedIn OAuth exchange.",
    valueKind: "string"
  },
  {
    id: "linkedin-redirect-uri",
    category: "provider",
    key: "LINKEDIN_REDIRECT_URI",
    label: "LinkedIn redirect URI",
    detail: "Required for OAuth callback validation.",
    valueKind: "url",
    allowedSchemes: ["https"]
  },
  {
    id: "x-client-id",
    category: "provider",
    key: "X_CLIENT_ID",
    label: "X client id",
    detail: "Required for X OAuth 2.0 PKCE.",
    valueKind: "string"
  },
  {
    id: "x-redirect-uri",
    category: "provider",
    key: "X_REDIRECT_URI",
    label: "X redirect URI",
    detail: "Required for X OAuth callback validation.",
    valueKind: "url",
    allowedSchemes: ["https"]
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

const placeholderTokens = [
  "placeholder",
  "change-me",
  "changeme",
  "todo",
  "dummy",
  "fake",
  "example",
  "localhost",
  "local",
  "test"
];

function requiredValue(env: EnvMap, key: string) {
  const value = env[key];

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isPlaceholderValue(value: string) {
  const normalized = value.trim().toLowerCase();
  const parts = normalized.split(/[^a-z0-9]+/).filter(Boolean);

  return placeholderTokens.some((token) => normalized === token || parts.includes(token));
}

function isReservedHostname(hostname: string) {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();

  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "0.0.0.0" ||
    normalized === "::1" ||
    normalized.endsWith(".localhost") ||
    normalized === "example.com" ||
    normalized.endsWith(".example.com") ||
    normalized === "example.net" ||
    normalized.endsWith(".example.net") ||
    normalized === "example.org" ||
    normalized.endsWith(".example.org") ||
    normalized.endsWith(".example") ||
    normalized.endsWith(".invalid") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".test")
  );
}

function blockedEnvCheck(
  check: (typeof productionEnvChecks)[number],
  reason: string
): ReleaseReadinessCheck {
  return {
    id: check.id,
    category: check.category,
    label: check.label,
    status: "blocked",
    detail: `${check.detail} ${reason}`
  };
}

function productionEnvCheckResult(
  env: EnvMap,
  check: (typeof productionEnvChecks)[number]
): ReleaseReadinessCheck {
  const value = requiredValue(env, check.key);

  if (!value) {
    return blockedEnvCheck(check, `${check.key} is missing.`);
  }

  if (isPlaceholderValue(value)) {
    return blockedEnvCheck(check, `${check.key} must be replaced with a production value.`);
  }

  if (check.valueKind === "url") {
    let url: URL;

    try {
      url = new URL(value);
    } catch {
      return blockedEnvCheck(check, `${check.key} must be a valid URL.`);
    }

    const scheme = url.protocol.replace(":", "");
    if (check.allowedSchemes && !check.allowedSchemes.includes(scheme)) {
      return blockedEnvCheck(
        check,
        `${check.key} must use ${check.allowedSchemes.join(" or ")}.`
      );
    }

    if (isReservedHostname(url.hostname)) {
      return blockedEnvCheck(
        check,
        `${check.key} must not point at localhost or reserved placeholder domains.`
      );
    }
  }

  return {
    id: check.id,
    category: check.category,
    label: check.label,
    status: "pass",
    detail: check.detail
  };
}

function hasConfirmation(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

export function buildPassingReleaseGateResults(): ReleaseGateResult[] {
  return requiredReleaseGateCommands.map((command) => ({
    command,
    status: "pass",
    detail: "Gate marked passed via operator confirmation."
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
  const confirmedGates =
    flags.has(releaseReadinessCliFlags.confirmGatesPassed) ||
    hasConfirmation(env[releaseReadinessEnvFlags.confirmGatesPassed]);
  const confirmedManualSmoke =
    flags.has(releaseReadinessCliFlags.confirmManualSmokePassed) ||
    hasConfirmation(env[releaseReadinessEnvFlags.confirmManualSmokePassed]);

  return {
    gateResults: confirmedGates ? buildPassingReleaseGateResults() : [],
    manualChecks: confirmedManualSmoke ? buildPassingManualSmokeChecks() : {},
    confirmationMessages: [
      confirmedGates ? "Local gates marked passed via operator confirmation." : null,
      confirmedManualSmoke ? "Manual smoke checks marked passed via operator confirmation." : null
    ].filter((message): message is string => Boolean(message))
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
  const value = requiredValue(env, key);

  return {
    id: "ai-provider-key",
    category: "environment",
    label: `${provider} API key`,
    status: value && !isPlaceholderValue(value) ? "pass" : "blocked",
    detail:
      value && !isPlaceholderValue(value)
        ? `${key} is required for the selected AI provider.`
        : `${key} is required for the selected AI provider. ${key} must be set to a production value.`
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
    ...productionEnvChecks.map((check) => productionEnvCheckResult(env, check)),
    aiProviderCheck(env),
    ...manualSmokeChecks.map((check): ReleaseReadinessCheck => {
      const status = manualChecks[check.id] ?? "manual";

      return {
        ...check,
        status,
        detail:
          status === "pass" && manualChecks[check.id] === "pass"
            ? `${check.detail} Operator confirmed this manual smoke check passed.`
            : check.detail
      };
    })
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
