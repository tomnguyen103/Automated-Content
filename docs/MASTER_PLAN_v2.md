# Master Implementation Plan (v2)
_Consolidated from 31 source docs. Supersedes: docs/MASTER_PLAN.md. Status reflects a fresh codebase scan, not aspiration._
_Last updated: 2026-06-24 (run #2)._

## Status legend
- [x] Done  · [~] Partial  · [ ] Not started  · [?] Needs verification

## Summary
- Source docs merged: 31
- Items: 35 total / 27 done / 6 partial / 1 not started / 1 unclear
- Headline: The repo is well past initial planning: the app shell, auth/workspace model, content generation, LangGraph approval flow, media library, LinkedIn publishing, scheduling worker, replies, analytics, n8n events, brand-memory base flow, and agent control plane all have code and tests. The remaining plan value is concentrated in production activation, expanding providers beyond LinkedIn/mock, packaging automation workflows, and turning existing agent telemetry into richer recommendation and scorecard products.

## Plan (grouped by theme or phase)

### Foundation, Product Shell, And Release Surface
- [x] **Repository foundation, scripts, environment contract, and app configuration** — Next app scripts, environment validation, and runtime config are present.
  - Evidence: `package.json:6-14`, `.env.example:21`, `.env.example:36-50`, `lib/env.ts:16-47`, `lib/env.ts:94-107`.
  - Sources: `docs/archive/phases/phase-01-foundation.md`, `docs/archive/specs/01-architecture.md`, `docs/archive/specs/02-ui-design-system.md`, `docs/MASTER_PLAN.md`.

- [x] **Dashboard shell, navigation, marketing entry, and route structure** — The app has a real dashboard shell and route set for the planned product surfaces.
  - Evidence: `app/layout.tsx:3`, `app/layout.tsx:18`, `lib/design/tokens.ts:17-33`, `components/layout/app-sidebar.tsx:6`, `components/layout/top-bar.tsx:10`, `app/(dashboard)/layout.tsx:8-15`, `e2e/phase-01.spec.ts:28-65`.
  - Sources: `docs/archive/specs/00-product-prd.md`, `docs/archive/specs/02-ui-design-system.md`, `docs/archive/phases/phase-01-foundation.md`, `docs/MASTER_PLAN.md`.

- [x] **Core data model and migrations** — The database schema covers workspaces, billing, content, media, providers, publishing, replies, brand memory, workflows, n8n, and agents.
  - Evidence: `db/schema.ts:17-158`, `db/schema.ts:165-944`.
  - Sources: `docs/archive/specs/03-data-model.md`, `docs/archive/phases/phase-02-auth-db-billing.md`, `docs/archive/ai-agent-feature-master-update-plan.md`, `docs/MASTER_PLAN.md`.

- [x] **Clerk auth, user sync, and personal workspace provisioning** — Current-user resolution, Clerk webhook sync, and workspace repair/provisioning are implemented.
  - Evidence: `lib/auth/current-user.ts:38-65`, `app/api/webhooks/clerk/route.ts:9-30`, `lib/billing/clerk-sync.ts:67-230`, `lib/workspaces/personal-workspace.ts:26-136`, `tests/auth/current-user.test.ts:19-135`.
  - Sources: `docs/archive/phases/phase-02-auth-db-billing.md`, `docs/archive/specs/07-billing-usage.md`, `docs/MASTER_PLAN.md`.

- [x] **Usage ledger, entitlements, and billing domain model** — Usage and plan limits are modeled, enforced, and covered by tests.
  - Evidence: `db/schema.ts:217-257`, `lib/billing/entitlements.ts:78-121`, `lib/billing/usage.ts:118-550`, `app/(dashboard)/billing/page.tsx:90-109`, `tests/billing/entitlements.test.ts:10-54`, `tests/billing/usage.test.ts:21-102`.
  - Sources: `docs/archive/phases/phase-02-auth-db-billing.md`, `docs/archive/specs/07-billing-usage.md`, `docs/archive/next-feature-plans/04-billing-activation-path.md`, `docs/MASTER_PLAN.md`.

- [~] **Billing checkout and customer portal production activation** — Routes and UI exist, but real production activation still depends on provider URLs/secrets and live redirect verification.
  - Missing: production billing provider verification, real checkout/portal smoke, and webhook/plan-change proof.
  - Evidence: `lib/billing/actions.ts:5-60`, `lib/billing/action-route.ts:23-30`, `app/api/billing/checkout/route.ts:6-7`, `app/api/billing/portal/route.ts:6-7`, `app/(dashboard)/billing/page.tsx:35-43`, `tests/api/billing-actions.test.ts:54-145`.
  - Sources: `docs/archive/next-feature-plans/04-billing-activation-path.md`, `docs/archive/specs/07-release-checklist.md`, `docs/MASTER_PLAN.md`.

### Content Generation And Approval Workflow
- [x] **LangChain content agent, typed schemas, tools, create API, and create UI** — Topic generation through content pack and platform variants is implemented.
  - Evidence: `lib/agents/schemas/content-pack.ts:11-53`, `lib/agents/schemas/platform-variant.ts:4-33`, `lib/agents/langchain/content-agent.ts:57-200`, `app/api/ai/generate/route.ts:19-60`, `components/create/brief-form.tsx:75`, `tests/api/ai-generate.test.ts:227-306`.
  - Sources: `docs/archive/phases/phase-03-langchain-content-agent.md`, `docs/archive/specs/04-langchain-agent-system.md`, `docs/MASTER_PLAN.md`.

- [x] **LangGraph draft workflow with checkpointing and approval resume** — The generation workflow pauses for human review, persists checkpoints, and resumes save behavior after approval.
  - Evidence: `lib/agents/graphs/content-workflow.ts:286-287`, `lib/agents/graphs/content-workflow.ts:428-451`, `lib/agents/graphs/content-workflow.ts:498-580`, `lib/agents/graphs/content-workflow.ts:604-733`, `lib/agents/graphs/checkpoints.ts:168-177`, `tests/agents/content-workflow.test.ts:38-90`.
  - Sources: `docs/archive/phases/phase-04-langgraph-content-workflow.md`, `docs/archive/specs/05-langgraph-workflows.md`, `docs/MASTER_PLAN.md`.

- [x] **Human review UI with previews, approval controls, and brand-memory proposal handoff** — The create review surface is wired into approval, schedule display, and brand-memory proposal review.
  - Evidence: `components/create/review-step.tsx:111-170`, `components/create/review-step.tsx:177-237`, `components/create/review-step.tsx:324-332`, `components/create/approval-panel.tsx:18-82`, `tests/components/review-step.test.ts:115-145`.
  - Sources: `docs/archive/phases/phase-04-langgraph-content-workflow.md`, `docs/archive/ai-agent-feature-roadmap-2026.md`, `docs/MASTER_PLAN.md`.

- [x] **Schedule approved variants from review into calendar publishing** — Scheduling validates timing, connected account readiness, provider compatibility, usage, and durable job creation.
  - Evidence: `app/api/posts/[id]/schedule/route.ts:164-285`, `components/create/review-step.tsx:111-170`, `tests/api/schedule-post.test.ts:452-576`, `tests/api/schedule-post.test.ts:584-746`.
  - Sources: `docs/archive/phases/phase-04-langgraph-content-workflow.md`, `docs/archive/phases/phase-06-provider-publishing.md`, `docs/MASTER_PLAN.md`.

### Media, Providers, Publishing, And Runtime Operations
- [x] **Media asset library, ImageKit integration, upload auth, and variant attachment** — Media upload, persistence, ownership, transform constraints, and UI are implemented.
  - Evidence: `db/schema.ts:292-327`, `db/schema.ts:414-415`, `lib/media/imagekit.ts:20-82`, `lib/media/upload.ts:91-188`, `lib/media/assets.ts:238-355`, `components/media/media-library.tsx:21-149`, `tests/api/media-assets.test.ts:57-314`.
  - Sources: `docs/archive/phases/phase-05-media-platform-variants.md`, `docs/MASTER_PLAN.md`.

- [x] **Provider adapter contract, registry, token vault, capability model, and scaffold honesty** — Provider interfaces, mock, stubs, registry, and token storage are in place.
  - Evidence: `lib/providers/types.ts:1-153`, `lib/providers/registry.ts:11-30`, `lib/providers/mock.ts:30-101`, `lib/providers/skeleton.ts:37-87`, `lib/providers/token-vault.ts:49-251`, `tests/providers/provider-contract.test.ts:15-180`.
  - Sources: `docs/archive/phases/phase-06-provider-publishing.md`, `docs/archive/specs/06-provider-integrations.md`, `docs/MASTER_PLAN.md`.

- [x] **LinkedIn live provider productionization** — LinkedIn has OAuth, token refresh, profile fetch, media upload, scope gating, capability checks, and publish behavior.
  - Evidence: `lib/providers/linkedin.ts:36-43`, `lib/providers/linkedin.ts:121-158`, `lib/providers/linkedin.ts:535-591`, `lib/providers/linkedin.ts:688-789`, `lib/providers/linkedin.ts:877-973`, `lib/providers/linkedin.ts:1021-1107`, `tests/providers/linkedin-provider.test.ts:46-264`.
  - Sources: `docs/archive/next-feature-plans/01-linkedin-provider-productionization.md`, `docs/archive/ai-agent-feature-roadmap-2026.md`, `docs/MASTER_PLAN.md`.

- [x] **Connections control center with lifecycle routes and provider health** — Connect, callback, health refresh, disconnect, and structured provider errors are implemented.
  - Evidence: `app/(dashboard)/connections/page.tsx:59-122`, `app/api/connections/[provider]/connect/route.ts:82-229`, `app/api/connections/[provider]/callback/route.ts:80-190`, `app/api/connections/[provider]/health/route.ts:35-122`, `app/api/connections/[provider]/disconnect/route.ts:31-82`, `tests/api/connections.test.ts:35-186`.
  - Sources: `docs/archive/next-feature-plans/02-connections-control-center.md`, `docs/MASTER_PLAN.md`.

- [~] **Provider expansion beyond mock and LinkedIn** — The abstractions are ready and stubs are explicit, but only LinkedIn is evidenced as a live non-mock provider.
  - Missing: production OAuth/publish/media/metrics/reply implementations for additional channels.
  - Evidence: `lib/providers/skeleton.ts:37-87`, `lib/providers/platform-compatibility.ts:22-26`, `lib/providers/linkedin.ts:877-883`.
  - Sources: `docs/archive/phases/phase-06-provider-publishing.md`, `docs/archive/specs/06-provider-integrations.md`, `docs/archive/ai-agent-feature-master-update-plan.md`, `docs/MASTER_PLAN.md`.

- [x] **Durable scheduling, BullMQ enqueue, social worker, and publish attempt tracking** — Scheduling is durable and executed through the worker path.
  - Evidence: `lib/scheduler/enqueue.ts:8-111`, `app/api/posts/[id]/schedule/route.ts:164-285`, `workers/social-worker.ts:77-156`, `workers/jobs/publish-post.ts:120-223`, `workers/jobs/publish-post.ts:309-436`, `tests/workers/publish-post.test.ts:131-302`.
  - Sources: `docs/archive/phases/phase-06-provider-publishing.md`, `docs/archive/next-feature-plans/03-worker-runtime-readiness.md`, `docs/archive/worker-runtime-readiness.md`, `docs/MASTER_PLAN.md`.

- [x] **Worker runtime readiness, queue health, operations visibility, and retry controls** — Runtime readiness and retry affordances exist in API and UI.
  - Evidence: `lib/scheduler/worker-health.ts:121-388`, `app/api/operations/worker-health/route.ts:3-16`, `app/(dashboard)/calendar/page.tsx:42-57`, `app/(dashboard)/calendar/page.tsx:147-187`, `tests/scheduler/worker-health.test.ts:16-33`.
  - Sources: `docs/archive/next-feature-plans/03-worker-runtime-readiness.md`, `docs/archive/worker-runtime-readiness.md`, `docs/MASTER_PLAN.md`.

- [x] **Publish failure recovery and duplicate-safe retry behavior** — Retryability classification and duplicate-safe re-enqueue behavior are implemented.
  - Evidence: `lib/scheduler/publish-recovery.ts:42-100`, `lib/scheduler/publish-retry.ts:41-210`, `app/api/operations/publish-retry/route.ts:16`, `components/calendar/publish-retry-button.tsx:36-78`, `tests/scheduler/publish-retry.test.ts`.
  - Sources: `docs/archive/next-feature-plans/03-worker-runtime-readiness.md`, `docs/archive/phases/phase-06-provider-publishing.md`, `docs/MASTER_PLAN.md`.

### Comments, Replies, Brand Memory, And Approvals
- [x] **Comment reply agent, auto-reply rules, approval queue, and safe autonomous send guardrails** — Comment triage and reply approval workflows are implemented with guardrails.
  - Evidence: `lib/agents/schemas/comment-reply.ts:39-50`, `lib/agents/langchain/comment-agent.ts:203-311`, `lib/agents/graphs/comment-reply-workflow.ts:79-105`, `lib/replies/repository.ts:981-1148`, `app/api/replies/run/route.ts:7-54`, `tests/agents/comment-workflow.test.ts:50-343`.
  - Sources: `docs/archive/phases/phase-07-comment-reply-agent.md`, `docs/archive/ai-agent-feature-roadmap-2026.md`, `docs/MASTER_PLAN.md`.

- [x] **Brand memory base workflow: proposals, dashboard workbench, review, and accepted-memory application** — The base brand-memory lifecycle is implemented and generation-visible.
  - Evidence: `db/schema.ts:674`, `lib/brand-memory/proposals.ts:240-302`, `lib/brand-memory/proposals.ts:305-376`, `lib/brand-memory/proposals.ts:572-611`, `app/(dashboard)/brand-memory/page.tsx:90-149`, `components/brand-memory/brand-memory-workbench.tsx:65-399`, `tests/brand-memory/proposals.test.ts:88-252`.
  - Sources: `docs/archive/next-feature-plans/05-brand-memory-management-page.md`, `docs/archive/ai-agent-feature-roadmap-2026.md`, `docs/MASTER_PLAN.md`.

- [ ] **Brand Voice Memory Curator 2.0 clustering, merge suggestions, and contradiction warnings** — No meaningful code evidence was found for the advanced clustering/conflict layer.
  - Sources: `docs/archive/ai-agent-feature-roadmap-2026.md`, `docs/archive/ai-agent-feature-goal-prompts-2026.md`, `docs/MASTER_PLAN.md`.
  - Notes: The base brand-memory proposal/review/apply loop is done; this is the extra roadmap scope.

- [x] **Unified Approval Command Center across replies, brand memory, content workflows, and agent policies** — Approval items are normalized and filterable through an API and dashboard page.
  - Evidence: `lib/approvals/command-center.ts:20-351`, `app/api/approvals/route.ts:9-85`, `app/(dashboard)/approvals/page.tsx:19-114`, `components/approvals/approval-command-center.tsx:30-208`, `tests/approvals/command-center.test.ts:16-185`.
  - Sources: `docs/archive/ai-agent-feature-roadmap-2026.md`, `docs/archive/ai-agent-feature-goal-prompts-2026.md`, `docs/MASTER_PLAN.md`.

### Analytics, Automation, And Observability
- [x] **Analytics dashboard for posting, usage, agents, platform breakdown, and operations** — Analytics snapshots and dashboard views are implemented.
  - Evidence: `lib/analytics/metrics.ts:90-873`, `app/(dashboard)/analytics/page.tsx:49-147`, `components/analytics/usage-chart.tsx:12-61`, `components/analytics/agent-run-table.tsx:37-85`, `tests/analytics/metrics.test.ts:10-266`.
  - Sources: `docs/archive/phases/phase-08-analytics-n8n-release.md`, `docs/archive/specs/07-release-checklist.md`, `docs/MASTER_PLAN.md`.

- [~] **Agent Quality Scorecards** — Agent telemetry exists, but no dedicated scorecard service or scorecard panel was found.
  - Missing: deterministic score dimensions, scorecard generation, history, explanations, and tests.
  - Evidence: `db/schema.ts:816-907`, `lib/analytics/metrics.ts:442-489`, `components/analytics/agent-run-table.tsx:37-85`.
  - Sources: `docs/archive/ai-agent-feature-roadmap-2026.md`, `docs/archive/ai-agent-feature-goal-prompts-2026.md`, `docs/MASTER_PLAN.md`.

- [~] **Analytics Next-Best-Action Agent** — Some recommendations exist in reports/recovery, but no dedicated analytics recommendation workflow or panel was evidenced.
  - Missing: recommendation records, prioritized analytics UI, explainable inputs, and approval-safe actions.
  - Evidence: `lib/scheduler/publish-recovery.ts:14-19`, `lib/agents/orchestration/executors.ts:981-989`, `app/(dashboard)/analytics/page.tsx:49-147`.
  - Sources: `docs/archive/ai-agent-feature-roadmap-2026.md`, `docs/archive/ai-agent-feature-goal-prompts-2026.md`, `docs/MASTER_PLAN.md`.

- [x] **Signed n8n outbound events, inbound callback verification, and event log persistence** — Signed events and callback verification are implemented with tests.
  - Evidence: `lib/n8n/events.ts:9-102`, `lib/n8n/client.ts:30-139`, `lib/n8n/event-log.ts:79-163`, `app/api/webhooks/n8n/route.ts:10-67`, `tests/n8n/events.test.ts:29-344`.
  - Sources: `docs/archive/phases/phase-08-analytics-n8n-release.md`, `docs/archive/n8n/workflows.md`, `docs/MASTER_PLAN.md`.

- [~] **n8n Automation Agent Packs** — The event substrate and docs exist, but importable workflow packs and in-app pack management were not evidenced.
  - Missing: importable n8n JSON/templates, pack setup checks, secrets/callback setup flow, and supported-action docs.
  - Evidence: `docs/archive/n8n/workflows.md:84-86`, `lib/n8n/events.ts:9-26`.
  - Sources: `docs/archive/n8n/workflows.md`, `docs/archive/ai-agent-feature-roadmap-2026.md`, `docs/MASTER_PLAN.md`.

- [~] **Observability and release gates** — Runtime health and logs exist, but full current release-gate proof was not run as part of this docs consolidation.
  - Missing: current lint/typecheck/test/build/e2e output, production secrets verification, live provider/database/Redis/n8n/billing smoke.
  - Evidence: `package.json:6-14`, `lib/agents/orchestration/repository.ts:535-584`, `lib/n8n/event-log.ts:79-163`, `lib/scheduler/worker-health.ts:121-388`.
  - Sources: `docs/archive/phases/phase-08-analytics-n8n-release.md`, `docs/archive/specs/07-release-checklist.md`, `docs/archive/worker-runtime-readiness.md`, `docs/MASTER_PLAN.md`.

### Agent Control Plane And Autonomous Workflows
- [x] **Agent profiles, missions, role templates, policy evaluation, queue execution, and Agents console** — The governed agent control plane is implemented.
  - Evidence: `lib/agents/schemas/orchestration.ts:6-263`, `lib/agents/orchestration/role-templates.ts:16-205`, `lib/agents/orchestration/repository.ts:431-663`, `lib/agents/orchestration/runner.ts:183-529`, `components/agents/agents-console.tsx:47-1242`, `tests/agents/orchestration.test.ts:45-454`.
  - Sources: `docs/archive/ai-agent-feature-master-update-plan.md`, `docs/archive/ai-agent-feature-roadmap-2026.md`, `docs/archive/ai-agent-feature-goal-prompts-2026.md`, `docs/MASTER_PLAN.md`.

- [x] **Safe autonomy defaults, model budget guards, and confidence threshold controls** — Policy defaults and denials are enforced in execution and simulation.
  - Evidence: `lib/agents/schemas/orchestration.ts:80-114`, `lib/agents/orchestration/policy.ts:259-270`, `lib/agents/orchestration/runner.ts:183-333`, `components/agents/agents-console.tsx:250-296`, `tests/api/agent-mission-run.test.ts:246-269`, `tests/agents/orchestration.test.ts:295-553`.
  - Sources: `docs/archive/ai-agent-feature-master-update-plan.md`, `docs/archive/ai-agent-feature-goal-prompts-2026.md`, `docs/MASTER_PLAN.md`.

- [x] **Mission simulation mode with no side effects and governance visibility** — Simulation runs are persisted and visible without requiring queue side effects.
  - Evidence: `db/schema.ts:907`, `lib/agents/orchestration/repository.ts:603-650`, `components/agents/agents-console.tsx:200-234`, `components/agents/agents-console.tsx:924-1028`, `app/api/agents/missions/[id]/simulate/route.ts:16-27`, `tests/api/agent-mission-run.test.ts:179-239`.
  - Sources: `docs/archive/ai-agent-feature-master-update-plan.md`, `docs/archive/ai-agent-feature-goal-prompts-2026.md`, `docs/MASTER_PLAN.md`.

- [x] **Supervised campaign mission workflow** — Supervised campaign missions are modeled and surfaced in the Agents console.
  - Evidence: `db/schema.ts:57-66`, `components/agents/agents-console.tsx:70-98`, `lib/agents/orchestration/executors.ts:403-1059`, `tests/agents/orchestration.test.ts:1221-1290`.
  - Sources: `docs/archive/ai-agent-feature-master-update-plan.md`, `docs/archive/ai-agent-feature-roadmap-2026.md`, `docs/MASTER_PLAN.md`.

- [x] **Weekly operator report workflow** — Report generation and `agent.report.generated` event support are implemented.
  - Evidence: `lib/agents/orchestration/executors.ts:981-989`, `lib/agents/orchestration/executors.ts:1054-1059`, `lib/n8n/events.ts:9-26`, `components/agents/agents-console.tsx:569-583`, `tests/agents/orchestration.test.ts:379-454`, `tests/n8n/events.test.ts:93-121`.
  - Sources: `docs/archive/ai-agent-feature-roadmap-2026.md`, `docs/archive/ai-agent-feature-goal-prompts-2026.md`, `docs/MASTER_PLAN.md`.

- [x] **Governance export for agent decisions with redaction and degraded fallback** — Workspace-scoped governance export exists and redacts sensitive fields.
  - Evidence: `lib/agents/governance-export.ts:13-159`, `app/api/agents/governance-export/route.ts:11-53`, `components/agents/agents-console.tsx:569-583`, `tests/agents/governance-export.test.ts:19-135`.
  - Sources: `docs/archive/ai-agent-feature-roadmap-2026.md`, `docs/archive/ai-agent-feature-goal-prompts-2026.md`, `docs/MASTER_PLAN.md`.

- [?] **Production release readiness and live smoke verification** — Code and checklists exist, but external services and full gates need current human/environment verification.
  - Evidence: `docs/archive/specs/07-release-checklist.md`, `package.json:6-14`, `lib/scheduler/worker-health.ts:121-388`, `lib/providers/linkedin.ts:877-883`, `lib/n8n/client.ts:30-139`.
  - Sources: `docs/archive/specs/07-release-checklist.md`, `docs/archive/phases/phase-08-analytics-n8n-release.md`, `docs/archive/worker-runtime-readiness.md`, `docs/MASTER_PLAN.md`.
  - Notes: Needs current lint, typecheck, tests, build, e2e, and live service smoke against database, Redis, Clerk, ImageKit, LinkedIn, n8n, billing, worker, and callback URLs.

## Conflicts & decisions needed
- Provider status: `docs/archive/next-feature-plans/README.md` describes live provider adapters as scaffold-level except mock, while current code has a live LinkedIn provider in `lib/providers/linkedin.ts:877-883`. Recommend treating LinkedIn as the canonical first live provider and leaving other providers as expansion work.
- Billing activation: older plan text says billing controls are disabled, while current code has checkout/portal action routes and gated UI. Recommend marking billing as partial until provider URLs/secrets and live redirects are verified.
- First real provider selection: `docs/archive/ai-agent-feature-master-update-plan.md` still frames the first provider as an open decision, but implementation selected LinkedIn. Recommend closing the decision and sequencing future work as provider expansion.
- n8n scope: some docs imply broader automation packs, while current code implements signed events, callbacks, and workflow docs. Recommend keeping signed audit/reminder automation as canonical until importable packs exist.
- Brand memory scope: next-feature plan 05 is satisfied by the workbench/review/apply flow, but the roadmap asks for clustering, merge suggestions, and contradiction handling. Recommend keeping these as separate items.

## Deduplication log
- Merged "foundation and app shell" from `docs/archive/phases/phase-01-foundation.md`, `docs/archive/specs/01-architecture.md`, `docs/archive/specs/02-ui-design-system.md`, and `docs/MASTER_PLAN.md` (partial overlap).
- Merged "auth, database, workspace, billing, and usage" from `docs/archive/phases/phase-02-auth-db-billing.md`, `docs/archive/specs/03-data-model.md`, `docs/archive/specs/07-billing-usage.md`, and `docs/archive/next-feature-plans/04-billing-activation-path.md` (partial overlap).
- Merged "content generation agent" from `docs/archive/phases/phase-03-langchain-content-agent.md`, `docs/archive/specs/04-langchain-agent-system.md`, and the prior master plan (exact duplicate plus evidence refresh).
- Merged "LangGraph approval workflow" from `docs/archive/phases/phase-04-langgraph-content-workflow.md`, `docs/archive/specs/05-langgraph-workflows.md`, and approval-related roadmap items (partial overlap).
- Merged "media and platform variants" from `docs/archive/phases/phase-05-media-platform-variants.md` and the prior master plan (exact duplicate).
- Merged "provider contracts, LinkedIn, connections, scheduling, worker readiness, retry, and queue health" from phase 06, provider specs, next-feature plans 01-03, and `docs/archive/worker-runtime-readiness.md` (partial overlap).
- Merged "comment triage, auto replies, reply approvals, and safety labels" from phase 07 and AI-agent roadmap/goal prompt docs (partial overlap).
- Merged "analytics, n8n, observability, and release" from phase 08, `docs/archive/n8n/workflows.md`, release checklist, and AI-agent roadmap items (partial overlap).
- Split "brand memory" into base workflow done and Brand Voice Memory Curator 2.0 not started because code supports proposal review/apply but not clustering/merge/conflict warnings.
- Split "analytics" into implemented dashboard, partial scorecards, and partial next-best-action agent because telemetry exists but dedicated product surfaces do not.
- Carried forward `docs/MASTER_PLAN.md` as a source plan and re-derived statuses from live code evidence instead of copying v1 blindly.

## Source documents
| Doc | Last updated | Status |
|-----|-------------|--------|
| `docs/ai-agent-feature-goal-prompts-2026.md` | 2026-06-23 19:04:56 -0500 | superseded by this plan; archived to `docs/archive/ai-agent-feature-goal-prompts-2026.md` |
| `docs/ai-agent-feature-master-update-plan.md` | 2026-06-22 11:13:18 -0500 | superseded by this plan; archived to `docs/archive/ai-agent-feature-master-update-plan.md` |
| `docs/ai-agent-feature-roadmap-2026.md` | 2026-06-23 19:04:56 -0500 | superseded by this plan; archived to `docs/archive/ai-agent-feature-roadmap-2026.md` |
| `docs/ai-workflow.md` | 2026-06-19 15:41:00 -0500 | superseded by this plan; archived to `docs/archive/ai-workflow.md` |
| `docs/MASTER_PLAN.md` | untracked, fs 2026-06-24 09:39:48 -0500 | prior master plan; kept in place |
| `docs/n8n/workflows.md` | 2026-06-20 16:50:55 -0500 | superseded by this plan; archived to `docs/archive/n8n/workflows.md` |
| `docs/next-feature-plans/01-linkedin-provider-productionization.md` | 2026-06-22 18:45:46 -0500 | superseded by this plan; archived to `docs/archive/next-feature-plans/01-linkedin-provider-productionization.md` |
| `docs/next-feature-plans/02-connections-control-center.md` | 2026-06-22 18:45:46 -0500 | superseded by this plan; archived to `docs/archive/next-feature-plans/02-connections-control-center.md` |
| `docs/next-feature-plans/03-worker-runtime-readiness.md` | 2026-06-22 18:45:46 -0500 | superseded by this plan; archived to `docs/archive/next-feature-plans/03-worker-runtime-readiness.md` |
| `docs/next-feature-plans/04-billing-activation-path.md` | 2026-06-22 18:45:46 -0500 | superseded by this plan; archived to `docs/archive/next-feature-plans/04-billing-activation-path.md` |
| `docs/next-feature-plans/05-brand-memory-management-page.md` | 2026-06-22 18:45:46 -0500 | superseded by this plan; archived to `docs/archive/next-feature-plans/05-brand-memory-management-page.md` |
| `docs/next-feature-plans/README.md` | 2026-06-22 18:45:46 -0500 | superseded by this plan; archived to `docs/archive/next-feature-plans/README.md` |
| `docs/phases/phase-01-foundation.md` | 2026-06-19 15:41:00 -0500 | superseded by this plan; archived to `docs/archive/phases/phase-01-foundation.md` |
| `docs/phases/phase-02-auth-db-billing.md` | 2026-06-19 15:41:00 -0500 | superseded by this plan; archived to `docs/archive/phases/phase-02-auth-db-billing.md` |
| `docs/phases/phase-03-langchain-content-agent.md` | 2026-06-19 15:41:00 -0500 | superseded by this plan; archived to `docs/archive/phases/phase-03-langchain-content-agent.md` |
| `docs/phases/phase-04-langgraph-content-workflow.md` | 2026-06-19 15:41:00 -0500 | superseded by this plan; archived to `docs/archive/phases/phase-04-langgraph-content-workflow.md` |
| `docs/phases/phase-05-media-platform-variants.md` | 2026-06-19 15:41:00 -0500 | superseded by this plan; archived to `docs/archive/phases/phase-05-media-platform-variants.md` |
| `docs/phases/phase-06-provider-publishing.md` | 2026-06-19 15:41:00 -0500 | superseded by this plan; archived to `docs/archive/phases/phase-06-provider-publishing.md` |
| `docs/phases/phase-07-comment-reply-agent.md` | 2026-06-19 15:41:00 -0500 | superseded by this plan; archived to `docs/archive/phases/phase-07-comment-reply-agent.md` |
| `docs/phases/phase-08-analytics-n8n-release.md` | 2026-06-19 15:41:00 -0500 | superseded by this plan; archived to `docs/archive/phases/phase-08-analytics-n8n-release.md` |
| `docs/README.md` | 2026-06-23 18:46:44 -0500 | docs index/reference; not archived |
| `docs/specs/00-product-prd.md` | 2026-06-19 15:41:00 -0500 | superseded by this plan; archived to `docs/archive/specs/00-product-prd.md` |
| `docs/specs/01-architecture.md` | 2026-06-19 15:41:00 -0500 | superseded by this plan; archived to `docs/archive/specs/01-architecture.md` |
| `docs/specs/02-ui-design-system.md` | 2026-06-19 15:41:00 -0500 | superseded by this plan; archived to `docs/archive/specs/02-ui-design-system.md` |
| `docs/specs/03-data-model.md` | 2026-06-19 15:41:00 -0500 | superseded by this plan; archived to `docs/archive/specs/03-data-model.md` |
| `docs/specs/04-langchain-agent-system.md` | 2026-06-19 15:41:00 -0500 | superseded by this plan; archived to `docs/archive/specs/04-langchain-agent-system.md` |
| `docs/specs/05-langgraph-workflows.md` | 2026-06-19 15:41:00 -0500 | superseded by this plan; archived to `docs/archive/specs/05-langgraph-workflows.md` |
| `docs/specs/06-provider-integrations.md` | 2026-06-19 15:41:00 -0500 | superseded by this plan; archived to `docs/archive/specs/06-provider-integrations.md` |
| `docs/specs/07-billing-usage.md` | 2026-06-19 15:41:00 -0500 | superseded by this plan; archived to `docs/archive/specs/07-billing-usage.md` |
| `docs/specs/07-release-checklist.md` | 2026-06-20 16:50:55 -0500 | superseded by this plan; archived to `docs/archive/specs/07-release-checklist.md` |
| `docs/worker-runtime-readiness.md` | 2026-06-23 00:29:26 -0500 | superseded by this plan; archived to `docs/archive/worker-runtime-readiness.md` |

## Changelog
- 2026-06-24 (run #2) - Wrote v2 after material source consolidation, refreshed evidence, archived consolidated source docs, and corrected the n8n evidence range during verification.
- 2026-06-24 (run #1) - Created `docs/MASTER_PLAN.md`.
