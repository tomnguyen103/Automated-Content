"use client";

import { useState, type FormEvent } from "react";
import { PauseCircle, PlayCircle, Plus, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CreateReplyRuleRequest } from "@/lib/replies/console";
import {
  replyMatchTypes,
  replyPlatforms,
  type AutoReplyRule,
  type ReplyMatchType,
  type ReplyPlatformScope
} from "@/lib/replies/rules";

type RuleBuilderProps = {
  rules: AutoReplyRule[];
  onCreateRule: (rule: CreateReplyRuleRequest) => Promise<{ ok: true } | { ok: false; error: string }>;
  onToggleRule: (ruleId: string) => Promise<void> | void;
  submitting?: boolean;
};

const matchTypeLabels: Record<ReplyMatchType, string> = {
  contains: "Contains",
  exact: "Exact comment",
  starts_with: "Starts with",
  regex: "Regex"
};

function parsePositiveInteger(value: FormDataEntryValue | null, fallback: number) {
  const raw = String(value ?? "").trim();
  const parsed = raw ? Number(raw) : fallback;

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function RuleBuilder({ rules, onCreateRule, onToggleRule, submitting = false }: RuleBuilderProps) {
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const keywords = String(form.get("keywords") ?? "")
      .split(/[\n,]/)
      .map((keyword) => keyword.trim())
      .filter(Boolean);
    const name = String(form.get("name") ?? "").trim();
    const template = String(form.get("template") ?? "").trim();
    const maxReplies = parsePositiveInteger(form.get("maxReplies"), 5);
    const windowMinutes = parsePositiveInteger(form.get("windowMinutes"), 60);

    if (!name || keywords.length === 0 || !template) {
      setError("Name, keywords, and template are required.");
      return;
    }

    if (!maxReplies || !windowMinutes) {
      setError("Replies and window minutes must be positive whole numbers.");
      return;
    }

    const result = await onCreateRule({
      name,
      platformScope: String(form.get("platformScope") ?? "all") as ReplyPlatformScope,
      matchType: String(form.get("matchType") ?? "contains") as ReplyMatchType,
      keywords,
      template,
      rateLimit: {
        maxReplies,
        windowMinutes
      },
      enabled: true
    });

    if (!result.ok) {
      setError(result.error);
      return;
    }

    formElement.reset();
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
      <form
        className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-5"
        onSubmit={handleSubmit}
      >
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-rose-50 text-[var(--color-primary)]">
            <ShieldCheck size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-semibold">Keyword rule</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
              Create safe template replies for comments that match explicit keywords.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4">
          <label className="grid gap-2 text-sm font-medium" htmlFor="reply-rule-name">
            Rule name
            <input
              className="h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-sm outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-rose-100"
              id="reply-rule-name"
              name="name"
              placeholder="Pricing questions"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium" htmlFor="reply-rule-platform">
              Platform
              <select
                className="h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white px-3 text-sm outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-rose-100"
                id="reply-rule-platform"
                name="platformScope"
                defaultValue="all"
              >
                <option value="all">All platforms</option>
                {replyPlatforms.map((platform) => (
                  <option key={platform} value={platform}>
                    {platform}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-medium" htmlFor="reply-rule-match">
              Match type
              <select
                className="h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white px-3 text-sm outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-rose-100"
                id="reply-rule-match"
                name="matchType"
                defaultValue="contains"
              >
                {replyMatchTypes.map((matchType) => (
                  <option key={matchType} value={matchType}>
                    {matchTypeLabels[matchType]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="grid gap-2 text-sm font-medium" htmlFor="reply-rule-keywords">
            Keywords
            <input
              className="h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-sm outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-rose-100"
              id="reply-rule-keywords"
              name="keywords"
              placeholder="pricing, plan, cost"
            />
          </label>

          <label className="grid gap-2 text-sm font-medium" htmlFor="reply-rule-template">
            Reply template
            <textarea
              className="min-h-24 resize-y rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm leading-6 outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-rose-100"
              id="reply-rule-template"
              name="template"
              placeholder="Thanks {firstName}. Premium includes keyword auto replies and seven scheduled posts per day."
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium" htmlFor="reply-rule-max">
              Replies
              <input
                className="h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-sm outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-rose-100"
                defaultValue="5"
                id="reply-rule-max"
                min="1"
                name="maxReplies"
                type="number"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium" htmlFor="reply-rule-window">
              Window minutes
              <input
                className="h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-sm outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-rose-100"
                defaultValue="60"
                id="reply-rule-window"
                min="1"
                name="windowMinutes"
                type="number"
              />
            </label>
          </div>

          {error ? <p className="text-sm font-medium text-[var(--color-error)]">{error}</p> : null}

          <Button type="submit" disabled={submitting}>
            <Plus size={16} aria-hidden="true" />
            {submitting ? "Creating" : "Create rule"}
          </Button>
        </div>
      </form>

      <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Active rules</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">Enabled rules can send template replies.</p>
          </div>
          <Badge tone="neutral">{rules.length} rules</Badge>
        </div>

        <div className="mt-4 grid gap-3">
          {rules.length === 0 ? (
            <div className="rounded-[var(--radius-md)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-muted)]">
              No rules yet. Create one to unlock keyword automation.
            </div>
          ) : (
            rules.map((rule) => (
              <article key={rule.id} className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">{rule.name}</h3>
                      <Badge tone={rule.enabled ? "success" : "neutral"}>{rule.enabled ? "Enabled" : "Paused"}</Badge>
                      <Badge tone="premium">{rule.platformScope}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                      {matchTypeLabels[rule.matchType]}: {rule.keywords.join(", ")}
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm leading-6">{rule.template}</p>
                  </div>
                  <Button
                    aria-label={`${rule.enabled ? "Pause" : "Enable"} ${rule.name}`}
                    onClick={() => onToggleRule(rule.id)}
                    size="sm"
                    variant="outline"
                  >
                    {rule.enabled ? <PauseCircle size={15} aria-hidden="true" /> : <PlayCircle size={15} aria-hidden="true" />}
                    {rule.enabled ? "Pause" : "Enable"}
                  </Button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </section>
  );
}
