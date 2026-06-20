import { describe, expect, it } from "vitest";
import { createReplyAuditEntry } from "@/lib/replies/audit";
import { evaluateReplyRules } from "@/lib/replies/matcher";
import type { AutoReplyRule } from "@/lib/replies/rules";

const baseRule: AutoReplyRule = {
  id: "rule_pricing",
  name: "Pricing",
  platformScope: "linkedin",
  matchType: "contains",
  keywords: ["pricing", "cost"],
  template: "Thanks {firstName}. Premium includes keyword replies.",
  rateLimit: {
    maxReplies: 2,
    windowMinutes: 60
  },
  enabled: true
};

describe("reply rule matching", () => {
  it("matches platform-scoped keywords and creates audit output", () => {
    const evaluation = evaluateReplyRules({
      comment: {
        id: "comment_1",
        text: "Can you send pricing?",
        platform: "linkedin",
        authorName: "Rina Patel"
      },
      rules: [baseRule],
      now: new Date("2026-06-20T12:00:00.000Z")
    });

    expect(evaluation.selected?.rule.id).toBe("rule_pricing");
    expect(evaluation.selected?.keyword).toBe("pricing");
    expect(evaluation.selected?.replyText).toBe("Thanks Rina. Premium includes keyword replies.");

    const audit = createReplyAuditEntry({
      action: "auto_reply_approved",
      commentId: "comment_1",
      match: evaluation.selected,
      platform: "linkedin",
      now: new Date("2026-06-20T12:00:00.000Z")
    });

    expect(audit.ruleId).toBe("rule_pricing");
    expect(audit.notes[0]).toContain("Matched contains keyword");
  });

  it("skips disabled rules and rules scoped to another platform", () => {
    const evaluation = evaluateReplyRules({
      comment: {
        id: "comment_1",
        text: "pricing",
        platform: "instagram"
      },
      rules: [
        {
          ...baseRule,
          platformScope: "linkedin"
        },
        {
          ...baseRule,
          id: "disabled",
          platformScope: "all",
          enabled: false
        }
      ]
    });

    expect(evaluation.selected).toBeNull();
    expect(evaluation.matches).toHaveLength(0);
  });

  it("blocks a matching rule when the rate limit is exhausted", () => {
    const evaluation = evaluateReplyRules({
      comment: {
        id: "comment_1",
        text: "What is the cost?",
        platform: "linkedin"
      },
      rules: [baseRule],
      recentAttempts: [
        {
          ruleId: "rule_pricing",
          attemptedAt: "2026-06-20T11:30:00.000Z",
          status: "sent"
        },
        {
          ruleId: "rule_pricing",
          attemptedAt: "2026-06-20T11:45:00.000Z",
          status: "sent"
        }
      ],
      now: new Date("2026-06-20T12:00:00.000Z")
    });

    expect(evaluation.selected).toBeNull();
    expect(evaluation.blocked[0].rule.id).toBe("rule_pricing");
    expect(evaluation.blocked[0].rateLimit.allowed).toBe(false);
  });

  it("supports exact and regex match types", () => {
    const exact = evaluateReplyRules({
      comment: {
        id: "comment_exact",
        text: "demo please",
        platform: "x"
      },
      rules: [
        {
          ...baseRule,
          id: "rule_exact",
          platformScope: "x",
          matchType: "exact",
          keywords: ["demo please"]
        }
      ]
    });
    const regex = evaluateReplyRules({
      comment: {
        id: "comment_regex",
        text: "I need a demo this week",
        platform: "x"
      },
      rules: [
        {
          ...baseRule,
          id: "rule_regex",
          platformScope: "x",
          matchType: "regex",
          keywords: ["demo\\s+this\\s+week"]
        }
      ]
    });

    expect(exact.selected?.rule.id).toBe("rule_exact");
    expect(regex.selected?.rule.id).toBe("rule_regex");
  });
});
