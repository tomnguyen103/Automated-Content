import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => {
  class FeatureAccessError extends Error {
    readonly feature = "keywordAutoReplies";
    readonly plan = "free";
    readonly requiredPlan = "premium";

    constructor() {
      super("This feature requires a Premium plan.");
      this.name = "FeatureAccessError";
    }
  }

  return {
    FeatureAccessError,
    ensureFeatureAllowed: vi.fn(),
    resolveReplyServerContext: vi.fn()
  };
});

vi.mock("@/lib/billing/usage", () => ({
  ensureFeatureAllowed: routeMocks.ensureFeatureAllowed,
  FeatureAccessError: routeMocks.FeatureAccessError
}));

vi.mock("@/lib/replies/server", () => ({
  resolveReplyServerContext: routeMocks.resolveReplyServerContext
}));

const validRule = {
  name: "Pricing helper",
  platformScope: "all",
  matchType: "contains",
  keywords: ["pricing"],
  template: "Thanks for asking. We will send pricing details shortly.",
  rateLimit: {
    maxReplies: 3,
    windowMinutes: 60
  },
  enabled: true
};

function buildContext({ isLocalPreview = false } = {}) {
  const repository = {
    createRule: vi.fn(async () => ({ id: "rule_1", ...validRule })),
    updateRuleEnabled: vi.fn(async () => ({ id: "rule_1", ...validRule })),
    getConsoleState: vi.fn(async () => ({
      rules: [],
      inbox: [],
      approvals: [],
      logs: []
    }))
  };

  return {
    context: {
      user: {
        id: "user_1"
      },
      workspace: {
        id: "workspace_1",
        isLocalPreview
      },
      repository
    },
    repository
  };
}

async function loadCreateRoute() {
  const { POST } = await import("@/app/api/replies/rules/route");
  return { POST };
}

async function loadUpdateRoute() {
  const { PATCH } = await import("@/app/api/replies/rules/[id]/route");
  return { PATCH };
}

describe("reply rule billing gates", () => {
  beforeEach(() => {
    vi.resetModules();
    routeMocks.ensureFeatureAllowed.mockReset();
    routeMocks.resolveReplyServerContext.mockReset();
    routeMocks.ensureFeatureAllowed.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("requires the keyword auto-replies feature before creating rules", async () => {
    const { context, repository } = buildContext();
    routeMocks.resolveReplyServerContext.mockResolvedValue(context);
    routeMocks.ensureFeatureAllowed.mockRejectedValue(new routeMocks.FeatureAccessError());
    const { POST } = await loadCreateRoute();

    const response = await POST(
      new Request("http://localhost:3000/api/replies/rules", {
        method: "POST",
        body: JSON.stringify(validRule)
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(402);
    expect(payload).toEqual({
      error: "This feature requires a Premium plan.",
      code: "upgrade_required",
      feature: "keywordAutoReplies",
      requiredPlan: "premium"
    });
    expect(routeMocks.ensureFeatureAllowed).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      feature: "keywordAutoReplies",
      skip: false
    });
    expect(repository.createRule).not.toHaveBeenCalled();
  });

  it("validates rule payloads before checking paid feature access", async () => {
    const { context, repository } = buildContext();
    routeMocks.resolveReplyServerContext.mockResolvedValue(context);
    const { POST } = await loadCreateRoute();

    const response = await POST(
      new Request("http://localhost:3000/api/replies/rules", {
        method: "POST",
        body: JSON.stringify({
          ...validRule,
          keywords: []
        })
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Invalid reply rule.");
    expect(routeMocks.ensureFeatureAllowed).not.toHaveBeenCalled();
    expect(repository.createRule).not.toHaveBeenCalled();
  });

  it("skips the paid feature check for local preview rule creation", async () => {
    const { context, repository } = buildContext({ isLocalPreview: true });
    routeMocks.resolveReplyServerContext.mockResolvedValue(context);
    const { POST } = await loadCreateRoute();

    const response = await POST(
      new Request("http://localhost:3000/api/replies/rules", {
        method: "POST",
        body: JSON.stringify(validRule)
      })
    );

    expect(response.status).toBe(201);
    expect(routeMocks.ensureFeatureAllowed).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      feature: "keywordAutoReplies",
      skip: true
    });
    expect(repository.createRule).toHaveBeenCalledOnce();
  });

  it("requires the keyword auto-replies feature before enabling rules", async () => {
    const { context, repository } = buildContext();
    routeMocks.resolveReplyServerContext.mockResolvedValue(context);
    routeMocks.ensureFeatureAllowed.mockRejectedValue(new routeMocks.FeatureAccessError());
    const { PATCH } = await loadUpdateRoute();

    const response = await PATCH(
      new Request("http://localhost:3000/api/replies/rules/rule_1", {
        method: "PATCH",
        body: JSON.stringify({ enabled: true })
      }),
      {
        params: Promise.resolve({ id: "rule_1" })
      }
    );
    const payload = await response.json();

    expect(response.status).toBe(402);
    expect(payload.code).toBe("upgrade_required");
    expect(payload.feature).toBe("keywordAutoReplies");
    expect(repository.updateRuleEnabled).not.toHaveBeenCalled();
  });

  it("allows disabled rule updates without the paid feature", async () => {
    const { context, repository } = buildContext();
    routeMocks.resolveReplyServerContext.mockResolvedValue(context);
    const { PATCH } = await loadUpdateRoute();

    const response = await PATCH(
      new Request("http://localhost:3000/api/replies/rules/rule_1", {
        method: "PATCH",
        body: JSON.stringify({ enabled: false })
      }),
      {
        params: Promise.resolve({ id: "rule_1" })
      }
    );

    expect(response.status).toBe(200);
    expect(routeMocks.ensureFeatureAllowed).not.toHaveBeenCalled();
    expect(repository.updateRuleEnabled).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      ruleId: "rule_1",
      enabled: false
    });
  });
});
