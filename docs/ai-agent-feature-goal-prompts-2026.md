# AI-Agent Feature `/goal` Prompt Pack 2026

Created: 2026-06-23

Purpose: provide copy-pasteable `/goal` prompts for implementing the 2026 AI-agent roadmap in a safe order, with local verification, GitHub PR review, CodeRabbit cleanup, and merge-to-main closeout built into each batch.

Use this with `docs/ai-agent-feature-roadmap-2026.md`. Do not rerun the original diagnostic, research, ideation, and feasibility workflow unless the product direction has materially changed.

## Run Order

Run the goals in this order to avoid breaking core logic:

1. Platform Publishing Intelligence Agent
2. Supervised Campaign Strategist Swarm
3. Approval Command Center
4. Brand Voice Memory Curator 2.0
5. Agent Quality Scorecards
6. Brief-to-Calendar Campaign Planner
7. LinkedIn Live Publisher Coach
8. Analytics Next-Best-Action Agent
9. n8n Automation Agent Packs
10. Comment Triage and Reply Copilot Plus

Batching rule:

- Batch 1: goals 1-3, then PR review and merge.
- Batch 2: goals 4-6, then PR review and merge.
- Batch 3: goals 7-9, then PR review and merge.
- Batch 4: goal 10 split into three internal safety subgoals, then PR review and merge.

Do not start a later batch from an old feature branch. After each batch merges, sync local `main`, verify `main == origin/main`, then create the next branch from fresh `main`.

## Global Rules For Every Batch

Every batch prompt should preserve these rules:

- Work from the Automated-Content repository root.
- Read `docs/ai-agent-feature-roadmap-2026.md` first.
- Verify live state before editing:
  - `git status --short`
  - `git rev-parse --abbrev-ref HEAD`
  - `git fetch origin`
  - `git rev-parse HEAD`
  - `git rev-parse origin/main`
  - `gh pr list --state open`
- Use the existing repo architecture. Do not bypass provider, scheduler, worker, billing, policy, approval, audit, redaction, or workspace boundaries.
- Keep irreversible external actions behind provider health checks, policy checks, usage/feature gates, and explicit approval where required.
- Do not present scaffold providers as live.
- Do not commit secrets, credentials, `.env` files, or raw provider tokens.
- If UI changes are made, apply the `design-taste-frontend` skill guidance and verify the affected UI with browser/e2e evidence where practical.
- Use a small number of meaningful local commits. Do not push after each small fix.
- Push to GitHub only after at least three goals or three internal subgoals in the batch are complete and local gates are green.
- Open PRs as non-draft so CodeRabbit auto-reviews.
- Do not stop at "PR opened." Wait for CI and CodeRabbit, fix findings, and merge to `main` when clean.

Suggested full verification stack:

```powershell
npm run db:generate # only if schema/migrations changed
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e # required when dashboard/create/connections/billing/agents/navigation UI changed
npm audit --omit=dev --audit-level=high
git diff --check
```

Worker smoke when worker/provider/scheduler code changes:

```powershell
npm run worker
```

If local Redis is not configured, the acceptable worker smoke result is the expected `REDIS_URL` queue configuration error. It must not fail from import resolution, missing `server-only`, path aliases, or module loading.

PR and CodeRabbit closeout loop:

```powershell
git diff main...HEAD
git status --short
git push -u origin <branch-name>
gh pr create --base main --head <branch-name> --title "<title>" --body "<body>"
gh pr checks <pr-number> --watch
gh pr view <pr-number> --json latestReviews,mergeStateStatus,statusCheckRollup,comments
gh api repos/<owner>/<repo>/pulls/<pr-number>/comments
```

If CodeRabbit reports actionable findings:

1. Fix findings locally.
2. Rerun the relevant focused tests and the full gates.
3. Push one corrected commit or a small set of meaningful commits.
4. Comment exactly once:

```powershell
gh pr comment <pr-number> --body "@coderabbitai review"
```

5. Wait and poll again. Do not repeatedly request reviews.
6. Merge only when CI is green, CodeRabbit findings are fixed or explicitly dismissed with a reason, and `mergeStateStatus` is clean.

After merge:

```powershell
git checkout main
git pull --ff-only origin main
git status --short
git rev-parse HEAD
git rev-parse origin/main
```

## Batch 1 Prompt: Provider Truth, Campaign Swarm, Approval Center

```text
/goal Implement AI-Agent Feature Roadmap 2026 Batch 1 for Automated-Content: goals 1-3 from docs/ai-agent-feature-roadmap-2026.md, then drive the work through local verification, GitHub PR, CodeRabbit review, fixes, and merge to main.

Start by reading docs/ai-agent-feature-roadmap-2026.md and docs/ai-agent-feature-goal-prompts-2026.md. Verify current live state with git status --short, git rev-parse --abbrev-ref HEAD, git fetch origin, git rev-parse HEAD, git rev-parse origin/main, and gh pr list --state open. If main is behind origin/main or there is an open PR that affects this scope, resolve/sync before editing. Create a branch named codex/agent-roadmap-batch-1-provider-campaign-approval from fresh main.

Goal 1: Platform Publishing Intelligence Agent.
Tasks:
1. Read lib/providers/health.ts, lib/providers/registry.ts, lib/providers/capabilities.ts, lib/providers/connections.ts, lib/providers/linkedin.ts, lib/providers/skeleton.ts, lib/scheduler/create-scheduled-post.ts, lib/scheduler/enqueue.ts, lib/agents/orchestration/simulation.ts, workers/jobs/publish-post.ts, components/connections/provider-actions.tsx, components/agents/agents-console.tsx, and relevant provider/scheduler/worker tests.
2. Normalize provider readiness so every surface distinguishes live, mock, scaffold/stub, missing credentials, missing account, missing scope, and unsupported capability.
3. Enforce provider/account/capability/scope readiness before scheduling or publishing while preserving DB-first scheduling and BullMQ enqueue-after-commit behavior.
4. Add provider readiness warnings to mission simulation without side effects. Simulation must not create task runs, scheduled jobs, queue jobs, provider calls, reply sends, or usage ledger writes.
5. Surface actionable readiness labels in Connections, Agents, Calendar/Create surfaces as needed.
6. Add or update focused tests for provider contracts, LinkedIn readiness, scheduler blocking, worker failure classification, and simulation warnings.

Goal 2: Supervised Campaign Strategist Swarm.
Tasks:
1. Read lib/agents/orchestration/planner.ts, role-templates.ts, executors.ts, policy.ts, runner.ts, simulation.ts, repository.ts, usage-estimates.ts, lib/agents/graphs/mission-workflow.ts, components/agents/agents-console.tsx, app/api/agents/missions/*, and tests/agents/orchestration.test.ts.
2. Add or harden a supervised_campaign mission preset that coordinates researcher, strategist, remixer, publisher, and reporter roles.
3. Ensure campaign missions produce research, strategy, platform variants, schedule suggestions, policy events, usage estimates, and report-ready summary.
4. Keep publish/schedule actions approval-gated and provider-readiness-gated.
5. Extend Agents console mission creation/detail UI only as needed to inspect the campaign plan, simulation, tasks, approvals, and outcome.
6. Add focused orchestration/API/UI tests.

Goal 3: Approval Command Center.
Tasks:
1. Audit current approval sources: content workflow checkpoints, reply approvals, brand-memory proposals, policy escalations, mission pause/resume, and budget/provider blocks.
2. Build a unified approval queue/read model using existing tables first; add schema only if there is a clear need.
3. Add filters by decision type, severity, platform/provider, mission, and age.
4. Provide deep links or detail drawers back to the owning workflow.
5. Enforce workspace scoping, RBAC, and redaction. Do not expose raw tokens, webhook signatures, or provider secrets.
6. Add API/component tests for aggregation, filters, auth, and redaction.

After all three goals are complete, run focused tests, then the full verification stack: npm run db:generate if schema changed, npm run lint, npm run typecheck, npm test, npm run build, npm run test:e2e if UI changed, npm audit --omit=dev --audit-level=high, and git diff --check. Run npm run worker if worker/scheduler/provider code changed; if Redis is absent, the only acceptable failure is the expected REDIS_URL queue configuration error.

Self-review git diff main...HEAD and fix issues before pushing. Push only after local gates are green. Open a non-draft PR. Wait for CI and CodeRabbit. Read CodeRabbit review body and inline comments, not just the check status. Fix actionable findings locally, rerun gates, push once, then comment @coderabbitai review exactly once. Repeat until CI is green and CodeRabbit is clean. Merge to main at the end, then sync local main and verify main matches origin/main.
```

## Batch 2 Prompt: Brand Memory, Scorecards, Calendar Planner

```text
/goal Implement AI-Agent Feature Roadmap 2026 Batch 2 for Automated-Content: goals 4-6 from docs/ai-agent-feature-roadmap-2026.md, then drive the work through local verification, GitHub PR, CodeRabbit review, fixes, and merge to main.

Start from fresh main after Batch 1 has merged. Read docs/ai-agent-feature-roadmap-2026.md and docs/ai-agent-feature-goal-prompts-2026.md. Verify current state with git status --short, git rev-parse --abbrev-ref HEAD, git fetch origin, git rev-parse HEAD, git rev-parse origin/main, and gh pr list --state open. Create branch codex/agent-roadmap-batch-2-memory-scorecards-calendar.

Goal 4: Brand Voice Memory Curator 2.0.
Tasks:
1. Read lib/brand-memory/proposals.ts, lib/brand-memory/schemas.ts, components/brand-memory/brand-memory-workbench.tsx, lib/agents/tools/read-brand-profile.ts, lib/agents/graphs/content-workflow.ts, and tests/brand-memory/proposals.test.ts.
2. Add proposal clustering, merge suggestions, and contradiction/conflict warnings where useful.
3. Keep memory human-reviewed. Agents may propose memory changes but must not self-activate, self-delete, or silently mutate active brand rules.
4. Feed accepted memory back into generation through existing brand-profile/tool paths.
5. Add tests for cluster/merge/conflict behavior, approval/rejection, and generation read paths.

Goal 5: Agent Quality Scorecards.
Tasks:
1. Read lib/observability/agent-events.ts, lib/analytics/metrics.ts, components/analytics/agent-run-table.tsx, components/analytics/usage-chart.tsx, lib/agents/governance-export.ts, db/schema.ts, and tests/analytics/* plus tests/agents/governance-export.test.ts.
2. Add deterministic scorecards from existing agent runs, task runs, policy events, approvals, usage ledger, provider outcomes, and failures.
3. Show cost, status, policy blocks, approval rate, failure cause, and quality flags in Agents/Analytics surfaces.
4. Label deterministic scores clearly and avoid pretending local estimated cost is real billed spend.
5. Redact sensitive content in exports/traces.
6. Add analytics, orchestration, and governance export tests.

Goal 6: Brief-to-Calendar Campaign Planner.
Tasks:
1. Read app/api/agent-runs/[id]/approval/route.ts, app/api/posts/[id]/schedule/route.ts, lib/scheduler/create-scheduled-post.ts, lib/scheduler/enqueue.ts, app/(dashboard)/calendar/page.tsx, components/create/approval-panel.tsx, components/create/review-step.tsx, and tests/api/schedule-post.test.ts.
2. Add a post-approval schedule proposal flow for approved variants.
3. Let users edit platform/account/time before confirming schedule.
4. Reuse provider readiness from Batch 1 and block unsupported providers/accounts/platforms.
5. Preserve durable-first behavior and duplicate-send protection.
6. Add tests for approval completion, schedule proposals, invalid provider/account/platform states, enqueue failure handling, and Calendar display.

After all three goals are complete, run focused tests and the full verification stack. Run e2e because this batch touches dashboard/create/calendar UI. Push only after local gates are green. Open a non-draft PR, wait for CI and CodeRabbit, fix all actionable findings, request one CodeRabbit re-review after pushing fixes, and merge to main when green and clean. Sync local main afterward.
```

## Batch 3 Prompt: LinkedIn Coach, Analytics Agent, n8n Packs

```text
/goal Implement AI-Agent Feature Roadmap 2026 Batch 3 for Automated-Content: goals 7-9 from docs/ai-agent-feature-roadmap-2026.md, then drive the work through local verification, GitHub PR, CodeRabbit review, fixes, and merge to main.

Start from fresh main after Batch 2 has merged. Read docs/ai-agent-feature-roadmap-2026.md and docs/ai-agent-feature-goal-prompts-2026.md. Verify current state with git status --short, git rev-parse --abbrev-ref HEAD, git fetch origin, git rev-parse HEAD, git rev-parse origin/main, and gh pr list --state open. Create branch codex/agent-roadmap-batch-3-linkedin-analytics-n8n.

Goal 7: LinkedIn Live Publisher Coach.
Tasks:
1. Read lib/providers/linkedin.ts, lib/providers/health.ts, lib/providers/connections.ts, tests/providers/linkedin-provider.test.ts, tests/providers/provider-contract.test.ts, workers/jobs/publish-post.ts, and components/connections/provider-actions.tsx.
2. Add LinkedIn-specific readiness score/fix list for credentials, scopes, account status, text/image capability, trusted image source constraints, and unsupported comment/metrics operations.
3. Mirror adapter truth exactly. Do not claim comment ingest, comment reply, metrics sync, video, carousel, or organization publishing support unless implemented and tested.
4. Surface LinkedIn-specific preflight in Connections/Create/Calendar/Agents where useful.
5. Add tests for missing credentials, missing scopes, invalid media, unsupported capabilities, and retryable vs non-retryable provider failures.

Goal 8: Analytics Next-Best-Action Agent.
Tasks:
1. Read lib/analytics/metrics.ts, app/(dashboard)/analytics/page.tsx, components/analytics/*, lib/billing/usage.ts, lib/scheduler/publish-recovery.ts, and relevant analytics tests.
2. Add evidence-backed recommendations from local data: provider fixes, retry/reschedule actions, campaign follow-ups, high-cost/low-output warnings, approval bottlenecks, and content cadence gaps.
3. Each recommendation must cite the local evidence used and show confidence/limitations.
4. Do not invent provider performance metrics that are not synced.
5. Add analytics tests and UI tests.

Goal 9: n8n Automation Agent Packs.
Tasks:
1. Read lib/n8n/events.ts, lib/n8n/client.ts, lib/n8n/event-log.ts, app/api/webhooks/n8n/route.ts, docs/n8n/workflows.md, and tests/n8n/events.test.ts.
2. Add curated packs for publish failure, approval reminder, usage alert, and weekly/operator report events.
3. Keep packs signed, redacted, workspace-scoped, and auditable.
4. Add UI/config only if it fits existing settings/connections patterns.
5. Add tests for event payloads, signatures, callbacks, redaction, failures, and retry behavior.

After all three goals are complete, run focused tests and the full verification stack. Run e2e if dashboard/connections/analytics UI changed. Push only after local gates are green. Open a non-draft PR, wait for CI and CodeRabbit, fix all actionable findings, request one CodeRabbit re-review after pushing fixes, and merge to main when green and clean. Sync local main afterward.
```

## Batch 4 Prompt: Comment Triage and Reply Copilot Plus

```text
/goal Implement AI-Agent Feature Roadmap 2026 Batch 4 for Automated-Content: goal 10, Comment Triage and Reply Copilot Plus, split into three internal safety subgoals, then drive the work through local verification, GitHub PR, CodeRabbit review, fixes, and merge to main.

Start from fresh main after Batch 3 has merged. Read docs/ai-agent-feature-roadmap-2026.md and docs/ai-agent-feature-goal-prompts-2026.md. Verify current state with git status --short, git rev-parse --abbrev-ref HEAD, git fetch origin, git rev-parse HEAD, git rev-parse origin/main, and gh pr list --state open. Create branch codex/agent-roadmap-batch-4-comment-triage.

Internal Goal 10A: Comment triage taxonomy and policy.
Tasks:
1. Read lib/agents/langchain/comment-agent.ts, lib/agents/graphs/comment-reply-workflow.ts, lib/replies/*, components/replies/*, db/schema.ts, and tests/agents/comment-workflow.test.ts.
2. Define or extend labels for safe, lead, support, crisis, spam/abuse, and approval-needed comments.
3. Ensure crisis, unsafe, low-confidence, and non-keyword replies require approval.
4. Keep provider capability checks in place. Do not enable live comment ingest/reply for providers that do not support it.
5. Add tests for classification, policy blocks, approval requirements, and provider capability blocks.

Internal Goal 10B: Reply Copilot Plus inbox and workflow.
Tasks:
1. Add richer inbox filters, labels, draft context, and approval actions in the existing Auto-Replies/Replies surfaces.
2. Preserve workspace scoping, role checks, audit trail, and redaction.
3. Make safe keyword replies fast to review while keeping risky replies explicit.
4. Add API/component tests for filters, approval actions, audit records, and UI states.

Internal Goal 10C: Safety, evals, observability, and release hardening.
Tasks:
1. Add triage metrics to analytics/scorecards where appropriate: auto-send rate, approval rate, escalation rate, blocked reason, user override rate.
2. Add governance export coverage for comment triage and reply decisions without leaking raw provider secrets or webhook signatures.
3. Run a safety-focused self-review of all reply send paths. Confirm non-keyword/crisis/risky comments cannot send without approval.
4. Add or update docs only where behavior changed.
5. Add regression tests for no-approval no-send guarantees.

After all three internal subgoals are complete, run focused tests and the full verification stack. Because this touches risky user-facing automation, run e2e if reply UI changed and include a manual review of send paths in the PR body. Push only after local gates are green. Open a non-draft PR, wait for CI and CodeRabbit, fix all actionable findings, request one CodeRabbit re-review after pushing fixes, and merge to main when green and clean. Sync local main afterward.
```

## Short Resume Prompt

Use this if you are not sure which batch is next:

```text
/goal Continue the AI-Agent Feature Roadmap 2026 implementation for Automated-Content. Read docs/ai-agent-feature-roadmap-2026.md and docs/ai-agent-feature-goal-prompts-2026.md. Verify the live branch, origin/main, open PRs, and which roadmap goals are already implemented. Do not rerun the original diagnostic/research workflow. Start from the next unmerged batch in the prompt pack. Implement at least three goals or three internal subgoals before pushing. Run local gates, open a non-draft PR, wait for CI and CodeRabbit, fix findings, request one CodeRabbit re-review after fixes, and merge to main when clean.
```

## Suggested PR Titles

- Batch 1: `Add provider intelligence, campaign missions, and approval center`
- Batch 2: `Add brand memory curation, agent scorecards, and calendar planning`
- Batch 3: `Add LinkedIn coaching, analytics recommendations, and n8n packs`
- Batch 4: `Add safe comment triage and reply copilot`

## Suggested PR Body Checklist

```markdown
## Summary
-

## Goals Completed
- [ ] Goal 1/4/7/10A
- [ ] Goal 2/5/8/10B
- [ ] Goal 3/6/9/10C

## Safety and Guardrails
- [ ] Provider readiness checks preserved
- [ ] Approval gates preserved
- [ ] Workspace scoping preserved
- [ ] Usage/billing checks preserved
- [ ] Secrets/tokens/webhook signatures redacted
- [ ] Scaffold providers are not presented as live

## Verification
- [ ] npm run db:generate, if schema changed
- [ ] npm run lint
- [ ] npm run typecheck
- [ ] npm test
- [ ] npm run build
- [ ] npm run test:e2e, if UI changed
- [ ] npm audit --omit=dev --audit-level=high
- [ ] git diff --check
- [ ] npm run worker smoke, if worker/scheduler/provider code changed

## CodeRabbit
- [ ] Non-draft PR opened after local gates passed
- [ ] CodeRabbit review read
- [ ] Actionable findings fixed or explicitly dismissed with reason
- [ ] Re-review requested exactly once after fix push, if needed
```
