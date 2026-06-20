import { z } from "zod";

export const replyPlatforms = ["linkedin", "x", "instagram", "facebook", "tiktok", "threads"] as const;
export const replyMatchTypes = ["contains", "exact", "starts_with", "regex"] as const;

export const replyPlatformSchema = z.enum(replyPlatforms);
export const replyPlatformScopeSchema = z.union([z.literal("all"), replyPlatformSchema]);
export const replyMatchTypeSchema = z.enum(replyMatchTypes);

export const replyRateLimitSchema = z.object({
  maxReplies: z.number().int().positive().default(5),
  windowMinutes: z.number().int().positive().default(60)
});

export const autoReplyRuleSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(100),
  platformScope: replyPlatformScopeSchema.default("all"),
  matchType: replyMatchTypeSchema.default("contains"),
  keywords: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
  template: z.string().trim().min(1).max(500),
  rateLimit: replyRateLimitSchema.default({ maxReplies: 5, windowMinutes: 60 }),
  enabled: z.boolean().default(true),
  createdAt: z.string().min(1).optional(),
  updatedAt: z.string().min(1).optional()
});

export type ReplyPlatform = z.infer<typeof replyPlatformSchema>;
export type ReplyPlatformScope = z.infer<typeof replyPlatformScopeSchema>;
export type ReplyMatchType = z.infer<typeof replyMatchTypeSchema>;
export type ReplyRateLimit = z.infer<typeof replyRateLimitSchema>;
export type AutoReplyRule = z.infer<typeof autoReplyRuleSchema>;

export function normalizeKeyword(keyword: string) {
  return keyword.trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeReplyRule(rule: AutoReplyRule): AutoReplyRule {
  const parsed = autoReplyRuleSchema.parse(rule);
  const seen = new Set<string>();
  const keywords = parsed.keywords
    .map((keyword) => keyword.trim().replace(/\s+/g, " "))
    .filter((keyword) => {
      const normalized = normalizeKeyword(keyword);

      if (seen.has(normalized)) {
        return false;
      }

      seen.add(normalized);
      return true;
    });

  return autoReplyRuleSchema.parse({
    ...parsed,
    keywords
  });
}

export function ruleAppliesToPlatform(rule: AutoReplyRule, platform: ReplyPlatform) {
  return rule.platformScope === "all" || rule.platformScope === platform;
}
