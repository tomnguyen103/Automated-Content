# Master Implementation Plan (v1)

_Consolidated from 30 source docs on 2026-06-24. Supersedes: none. Status reflects a fresh codebase scan, not aspiration._

## Status legend

- [x] Done | [~] Partial | [ ] Not started | [?] Needs verification

## Summary

- Source documents consolidated: 30.
- Existing master plans found: 0.
- Canonical work items after deduplication: 35.
- Status counts: 33 done, 1 partial, 0 not started, 1 needs verification.
- Canonical direction: the product is no longer at foundation/planning stage. Most phase docs and next-feature plans are already implemented in code. Remaining roadmap value is concentrated in production billing activation and live production smoke verification.

## Plan

### Foundation, Product Shell, And Release Surface

1. [x] Repository foundation, scripts, environment contract, and app configuration.
   - Evidence: `package.json:6-14` defines dev/build/worker/lint/typecheck/test/e2e scripts; `.env.example:21-56` documents database, LinkedIn, X, Redis, and n8n settings; `lib/env.ts:16-53` validates env shape and `lib/env.ts:100-113` exposes database readiness helpers.
   - Sources: `docs/phases/phase-01-foundation.md`, `docs/specs/01-architecture.md`, `docs/specs/02-ui-design-system.md`, `docs/README.md`.

2. [x] Premium dashboard shell, navigation, marketing entry, and route structure.
   - Evidence: `app/layout.tsx:3` and `app/layout.tsx:18` configure fonts/metadata; `lib/design/tokens.ts:17-33` defines product/nav tokens; `components/layout/app-sidebar.tsx:6`, `components/layout/top-bar.tsx:10`, and `app/(dashboard)/layout.tsx:8-15` implement shell structure; dashboard routes exist for Dashboard, Create, Calendar, Media, Connections, Agents, Approvals, Brand Memory, Auto Replies, Analytics, and Billing.
   - Tests: `e2e/phase-01.spec.ts:28-65`, `tests/components/nav-links.test.ts:4-8`, `tests/components/sub-nav.test.ts:6-21`.
   - Sources: `docs/specs/00-product-prd.md`, `docs/specs/02-ui-design-system.md`, `docs/phases/phase-01-foundation.md`.

3. [x] Core data model and migrations for workspaces, billing, content, media, providers, scheduling, replies, brand memory, n8n, and agents.
   - Evidence: `db/schema.ts:165-944` includes users, workspaces, memberships, subscriptions, usage ledger, content topics, media assets, drafts, variants, connected accounts, token vault entries, scheduled jobs, publish attempts, comment/reply tables, brand-memory proposals, workflow checkpoints, agent profiles/missions/task runs/policy events/simulations, and n8n events.
   - Sources: `docs/specs/03-data-model.md`, all phase docs, AI-agent roadmap docs.

4. [x] Clerk auth, user sync, personal workspace provisioning, and membership-aware current-user behavior.
   - Evidence: `lib/auth/current-user.ts:38-65` resolves the current user/workspace; `app/api/webhooks/clerk/route.ts:9-30` handles Clerk webhook verification; `lib/billing/clerk-sync.ts:67-230` syncs users/workspaces/memberships; `lib/workspaces/personal-workspace.ts:26-136` creates and repairs personal workspaces.
   - Tests: `tests/auth/current-user.test.ts:19-135`, `tests/api/clerk-webhook.test.ts:5-16`.
   - Sources: `docs/phases/phase-02-auth-db-billing.md`, `docs/specs/07-billing-usage.md`.

5. [x] Usage ledger, entitlements, and plan-aware billing domain model.
   - Evidence: `db/schema.ts:217-257` defines subscriptions and usage ledger checks; `lib/billing/entitlements.ts:78-121` calculates plan limits; `lib/billing/usage.ts:118-550` records/checks usage with source ids; `app/(dashboard)/billing/page.tsx:90-109` renders plan and usage state.
   - Tests: `tests/billing/entitlements.test.ts:10-54`, `tests/billing/usage.test.ts:21-102`, `tests/api/billing-actions.test.ts:54-145`.
   - Sources: `docs/phases/phase-02-auth-db-billing.md`, `docs/next-feature-plans/04-billing-activation-path.md`.

6. [~] Billing checkout and customer portal production activation.
   - Current status: routes, UI, subscription webhook syncing, and active-status entitlement reads are present, but activation is environment/provider dependent and local preview is intentionally disabled.
   - Evidence: `lib/billing/actions.ts:5-68` builds checkout/portal actions; `lib/billing/action-route.ts:23-70` gates billing action redirects; `app/api/billing/checkout/route.ts:6-7` and `app/api/billing/portal/route.ts:6-7` expose routes; `app/(dashboard)/billing/page.tsx:35-43` defines local-preview disabled messaging; `lib/billing/subscription-state.ts:1-51`, `lib/billing/clerk-sync.ts:48-219`, and `lib/billing/usage.ts:189-401` ensure only active billing status grants paid entitlements; `app/api/replies/rules/route.ts:1-68` and `app/api/replies/rules/[id]/route.ts:1-87` gate keyword auto-reply rule changes.
   - Tests: `tests/api/billing-actions.test.ts:71-146`, `tests/billing/subscription-state.test.ts:8-24`, `tests/billing/clerk-sync.test.ts:22-151`, `tests/api/reply-rules.test.ts:1-236`.
   - Remaining work: verify production billing provider URLs/secrets and real checkout/portal redirects in a live environment.
   - Sources: `docs/next-feature-plans/04-billing-activation-path.md`, `docs/specs/07-release-checklist.md`.

### Content Generation And Approval Workflow

7. [x] LangChain content agent, typed content-pack schemas, tool suite, create API, and create UI.
   - Evidence: `lib/agents/schemas/content-pack.ts:11-53`, `lib/agents/schemas/platform-variant.ts:4-33`, and `lib/agents/schemas/schedule-suggestion.ts:13-24` define outputs; `lib/agents/langchain/content-agent.ts:57-200` runs research, brand, retrieval, variant generation, policy, schedule, and save tools; `app/api/ai/generate/route.ts:19-60` exposes generation; `components/create/brief-form.tsx:75` and create-step components render the experience.
   - Tests: `tests/agents/schemas.test.ts:21-65`, `tests/api/ai-generate.test.ts:227-306`, `e2e/phase-03.spec.ts:28-47`.
   - Sources: `docs/phases/phase-03-langchain-content-agent.md`, `docs/specs/04-langchain-agent-system.md`.

8. [x] LangGraph draft workflow with checkpointing, approval pause, resume, and save semantics.
   - Evidence: `lib/agents/graphs/content-workflow.ts:286-287` builds the StateGraph; `lib/agents/graphs/content-workflow.ts:428-451` pauses for review and gates saving on approval; `lib/agents/graphs/content-workflow.ts:498-580` persists paused workflows; `lib/agents/graphs/content-workflow.ts:604-733` resumes approval; `lib/agents/graphs/checkpoints.ts:168-177` stores DB checkpoints.
   - Tests: `tests/agents/content-workflow.test.ts:38-90`, `tests/agents/content-workflow.test.ts:124-177`, `tests/agents/content-workflow.test.ts:223-297`, `tests/components/review-step.test.ts:115-145`.
   - Sources: `docs/phases/phase-04-langgraph-content-workflow.md`, `docs/specs/05-langgraph-workflows.md`.

9. [x] Human review UI with platform previews, approval controls, and brand-memory proposal handoff.
   - Evidence: `components/create/review-step.tsx:111-170` shows approved schedule variants after approval; `components/create/review-step.tsx:177-237` renders brand memory proposals; `components/create/review-step.tsx:324-332` coordinates approval, scheduling, and proposals; `components/create/approval-panel.tsx:18-82` handles approval actions.
   - Sources: `docs/phases/phase-04-langgraph-content-workflow.md`, `docs/ai-agent-feature-roadmap-2026.md`.

10. [x] Schedule-approved-variants path from draft review to calendar scheduling.
    - Evidence: `app/api/posts/[id]/schedule/route.ts:164-285` validates future schedule time, provider/platform compatibility, connected account health, live-provider usage gates, and durable scheduled post creation; `components/create/review-step.tsx:111-170` surfaces schedule decisions in review.
    - Tests: `tests/api/schedule-post.test.ts:452-576`, `tests/api/schedule-post.test.ts:584-746`.
    - Sources: `docs/phases/phase-04-langgraph-content-workflow.md`, `docs/phases/phase-06-provider-publishing.md`.

### Media, Platform Variants, And Publishing

11. [x] Media asset library, ImageKit integration, upload auth, metadata persistence, and variant attachment.
    - Evidence: `db/schema.ts:292-327` defines media assets; `db/schema.ts:414-415` attaches media to platform variants; `lib/media/imagekit.ts:20-82`, `lib/media/upload.ts:91-188`, and `lib/media/assets.ts:238-355` cover upload, mapping, list, save, dedupe, and ownership; `components/media/media-library.tsx:21-149` and `components/media/upload-dropzone.tsx:13-50` implement the UI.
    - Tests: `tests/api/media-upload-auth.test.ts:36-68`, `tests/api/media-assets.test.ts:57-314`, `e2e/phase-05.spec.ts:32-76`.
    - Sources: `docs/phases/phase-05-media-platform-variants.md`.

12. [x] Provider adapter contract, registry, token vault, capability model, and explicit scaffold behavior.
    - Evidence: `lib/providers/types.ts:1-153` defines provider contracts; `lib/providers/registry.ts:11-30` registers providers; `lib/providers/mock.ts:30-101` implements mock behavior; `lib/providers/skeleton.ts:37-87` returns explicit scaffold errors; `lib/providers/token-vault.ts:49-251` handles token persistence and workspace isolation.
    - Tests: `tests/providers/provider-contract.test.ts:15-180`, `tests/providers/token-vault.test.ts:25-70`.
    - Sources: `docs/phases/phase-06-provider-publishing.md`, `docs/specs/06-provider-integrations.md`.

13. [x] LinkedIn live provider productionization.
    - Evidence: `lib/providers/linkedin.ts:36-43` declares LinkedIn capabilities; `lib/providers/linkedin.ts:121-158` builds OAuth and gates scopes; `lib/providers/linkedin.ts:535-591` exchanges and refreshes tokens; `lib/providers/linkedin.ts:599-625` fetches profile data; `lib/providers/linkedin.ts:688-789` handles image upload; `lib/providers/linkedin.ts:877-973` reports live status and connects; `lib/providers/linkedin.ts:1021-1107` validates capabilities and publishes.
    - Tests: `tests/providers/linkedin-provider.test.ts:46-264`, `tests/providers/linkedin-provider.test.ts:318-455`.
    - Sources: `docs/next-feature-plans/01-linkedin-provider-productionization.md`, `docs/ai-agent-feature-roadmap-2026.md`.

14. [x] Connections control center with connect, callback, health refresh, disconnect, and structured provider errors.
    - Evidence: `app/(dashboard)/connections/page.tsx:59-122` renders provider readiness; `app/api/connections/[provider]/connect/route.ts:81-274`, `app/api/connections/[provider]/callback/route.ts:78-226`, `app/api/connections/[provider]/health/route.ts:35-122`, and `app/api/connections/[provider]/disconnect/route.ts:31-82` implement lifecycle routes.
    - Tests: `tests/api/connections.test.ts:35-337`, `e2e/phase-09.spec.ts:74-85`.
    - Sources: `docs/next-feature-plans/02-connections-control-center.md`.

15. [x] Provider expansion beyond mock and LinkedIn.
    - Evidence: `lib/providers/x.ts:28-44` declares X text-publishing capabilities and explicit media/reply/metrics boundaries; `lib/providers/x.ts:93-149` implements OAuth 2.0 PKCE URL construction; `lib/providers/x.ts:512-594` connects and stores X user tokens without exposing raw secrets; `lib/providers/x.ts:661-731` publishes text posts through X; `lib/providers/oauth-cookies.ts:1-8` centralizes OAuth cookie names; `app/api/connections/[provider]/connect/route.ts:169-240` stores the X PKCE verifier in HTTP-only cookies; `app/api/connections/[provider]/callback/route.ts:101-180` completes X callbacks.
    - Tests: `tests/providers/x-provider.test.ts:45-355`, `tests/api/connections.test.ts:232-337`, `tests/providers/provider-contract.test.ts:71-92`.
    - Note: Meta, Slack, and Discord remain explicit future stubs, but Master Plan v1's next live-provider expansion beyond LinkedIn is now satisfied by X.
    - Sources: `docs/phases/phase-06-provider-publishing.md`, `docs/ai-agent-feature-master-update-plan.md`, `docs/ai-agent-feature-roadmap-2026.md`.

16. [x] Durable scheduling, BullMQ enqueue, social worker, and publish attempt tracking.
    - Evidence: `lib/scheduler/enqueue.ts:8-111` defines queue names and enqueue behavior; `app/api/posts/[id]/schedule/route.ts:164-285` creates durable schedule rows and queue jobs; `workers/social-worker.ts:77-156` starts publishing and agent mission workers; `workers/jobs/publish-post.ts:120-223` records publish attempts; `workers/jobs/publish-post.ts:309-436` executes eligible scheduled jobs.
    - Tests: `tests/api/schedule-post.test.ts:39-66`, `tests/workers/publish-post.test.ts:131-302`, `tests/workers/social-worker.test.ts:15-52`.
    - Sources: `docs/next-feature-plans/03-worker-runtime-readiness.md`, `docs/worker-runtime-readiness.md`.

17. [x] Worker runtime readiness, queue health, operations dashboard visibility, and retry controls.
    - Evidence: `lib/scheduler/worker-health.ts:121-388` inspects Redis, queues, workers, recommended actions, and preview health; `app/api/operations/worker-health/route.ts:3-16` exposes status; `app/(dashboard)/calendar/page.tsx:42-57` and `app/(dashboard)/calendar/page.tsx:147-187` surface readiness and retry actions.
    - Tests: `tests/scheduler/worker-health.test.ts:16-33`, `tests/scheduler/queue-overview.test.ts:17-94`.
    - Sources: `docs/next-feature-plans/03-worker-runtime-readiness.md`, `docs/worker-runtime-readiness.md`.

18. [x] Publish failure recovery and duplicate-safe retry behavior.
    - Evidence: `lib/scheduler/publish-recovery.ts:42-100` classifies retryability; `lib/scheduler/publish-retry.ts:41-210` blocks unsafe duplicate sends, reserves retry attempts, and re-enqueues retryable jobs; `app/api/operations/publish-retry/route.ts:16` exposes retries; `components/calendar/publish-retry-button.tsx:36-78` renders the control.
    - Tests: `tests/scheduler/publish-retry.test.ts`, `tests/workers/publish-post.test.ts:131-302`.
    - Sources: `docs/next-feature-plans/03-worker-runtime-readiness.md`, `docs/phases/phase-06-provider-publishing.md`.

### Comments, Replies, Brand Memory, And Approvals

19. [x] Comment reply agent, auto-reply rules, approval queue, and safe autonomous send guardrails.
    - Evidence: `lib/agents/schemas/comment-reply.ts:39-50` defines triage output; `lib/agents/langchain/comment-agent.ts:203-311` runs the comment agent; `lib/agents/graphs/comment-reply-workflow.ts:79-105` enforces safe-rule autonomy and audit labels; `lib/replies/repository.ts:981-1148` claims approvals and persists provider send results; `app/api/replies/run/route.ts:7-54` and `app/api/replies/approvals/[id]/route.ts:14-145` expose reply workflows.
    - Tests: `tests/agents/comment-workflow.test.ts:50-343`, `tests/api/reply-approval.test.ts:86-161`, `e2e/phase-07.spec.ts:28-53`.
    - Sources: `docs/phases/phase-07-comment-reply-agent.md`, `docs/ai-agent-feature-roadmap-2026.md`.

20. [x] Brand memory base workflow: proposal extraction, dashboard workbench, review, and accepted-memory application.
    - Evidence: `db/schema.ts:674` defines proposal storage; `lib/brand-memory/proposals.ts:240-302` builds proposals from edits; `lib/brand-memory/proposals.ts:305-376` saves/lists/reviews proposals; `lib/brand-memory/proposals.ts:572-611` applies accepted memory; `app/(dashboard)/brand-memory/page.tsx:90-149` and `components/brand-memory/brand-memory-workbench.tsx:65-399` render review workflows; `components/create/review-step.tsx:177-237` integrates proposal handoff after content review.
    - Tests: `tests/brand-memory/proposals.test.ts:88-252`, `e2e/phase-02.spec.ts:48-59`.
    - Sources: `docs/next-feature-plans/05-brand-memory-management-page.md`, `docs/ai-agent-feature-roadmap-2026.md`.

21. [x] Brand Voice Memory Curator 2.0 clustering, merge suggestions, and contradiction/conflict warnings.
    - Evidence: `lib/brand-memory/curator.ts:30-273` builds curation summaries, clusters related proposals, suggests merge candidates, and flags contradiction warnings; `app/(dashboard)/brand-memory/page.tsx:122-157` passes curation data into the workbench; `components/brand-memory/brand-memory-workbench.tsx:248-313` surfaces Curator 2.0 clusters, merges, and conflicts.
    - Tests: `tests/brand-memory/proposals.test.ts:280-353`.
    - Sources: `docs/ai-agent-feature-roadmap-2026.md`, `docs/ai-agent-feature-goal-prompts-2026.md`.

22. [x] Unified Approval Command Center across replies, brand memory, content workflows, and agent policies.
    - Evidence: `lib/approvals/command-center.ts:20-351` normalizes approval items, stats, filters, and source types; `app/api/approvals/route.ts:9-85` exposes filtered data; `app/(dashboard)/approvals/page.tsx:19-114` renders the page; `components/approvals/approval-command-center.tsx:30-208` renders quick filters and rows.
    - Tests: `tests/approvals/command-center.test.ts:16-185`.
    - Sources: `docs/ai-agent-feature-roadmap-2026.md`, `docs/ai-agent-feature-goal-prompts-2026.md`.

### Analytics, Automation, And Observability

23. [x] Analytics dashboard for posting, usage, agents, platform breakdown, and operational summaries.
    - Evidence: `lib/analytics/metrics.ts:90-873` builds analytics snapshots from usage, agent runs, scheduled jobs, comment events, and reply attempts; `app/(dashboard)/analytics/page.tsx:49-147` renders analytics; `components/analytics/usage-chart.tsx:12-61`, `components/analytics/agent-run-table.tsx:37-85`, and `components/analytics/platform-breakdown.tsx:8-52` provide charts/tables.
    - Tests: `tests/analytics/metrics.test.ts:10-266`, `tests/analytics/snapshot-fallback.test.ts:17-38`, `tests/analytics/usage-chart.test.ts:5-9`, `e2e/phase-08.spec.ts:28-44`.
    - Sources: `docs/phases/phase-08-analytics-n8n-release.md`, `docs/specs/07-release-checklist.md`.

24. [x] Agent Quality Scorecards.
    - Evidence: `lib/analytics/scorecards.ts:1-131` defines deterministic score dimensions, grades, and evidence; `lib/analytics/metrics.ts:430-509` attaches scorecards to recent agent runs and analytics snapshots; `components/analytics/agent-run-table.tsx:65-91` renders quality badges; `app/(dashboard)/analytics/page.tsx:92-137` surfaces the scorecard panel.
    - Tests: `tests/analytics/metrics.test.ts:161-178`, `tests/analytics/metrics.test.ts:288-291`, `tests/agents/orchestration.test.ts:567-653`.
    - Sources: `docs/ai-agent-feature-roadmap-2026.md`, `docs/ai-agent-feature-goal-prompts-2026.md`.

25. [x] Analytics Next-Best-Action Agent.
    - Evidence: `lib/analytics/recommendations.ts:1-110` ranks explainable, side-effect-free recommendations from analytics signals; `lib/analytics/metrics.ts:504-509` attaches recommendations to snapshots; `app/(dashboard)/analytics/page.tsx:61-89` renders the next-best-action panel with evidence links.
    - Tests: `tests/analytics/metrics.test.ts:170-183`, `tests/analytics/metrics.test.ts:327-333`.
    - Sources: `docs/ai-agent-feature-roadmap-2026.md`, `docs/ai-agent-feature-goal-prompts-2026.md`.

26. [x] Signed n8n outbound events, inbound callback verification, and event log persistence.
    - Evidence: `lib/n8n/events.ts:9-139` defines event types, signatures, and callback verification; `lib/n8n/client.ts:30-139` signs and sends outbound events; `lib/n8n/event-log.ts:79-163` persists event logs; `app/api/webhooks/n8n/route.ts:10-67` verifies inbound callbacks.
    - Tests: `tests/n8n/events.test.ts:29-344`.
    - Sources: `docs/phases/phase-08-analytics-n8n-release.md`, `docs/n8n/workflows.md`.

27. [x] n8n Automation Agent Packs.
    - Evidence: `lib/n8n/packs.ts:30-205` defines the three supported automation packs, setup checks, required app env, required n8n variables, supported actions, and unsupported actions; `docs/n8n/automation-packs.md:1-57` documents import/setup; `docs/n8n/packs/publish-failure-alert.json`, `docs/n8n/packs/reply-approval-reminder.json`, and `docs/n8n/packs/usage-threshold-alert.json` provide importable workflow templates.
    - Tests: `tests/n8n/packs.test.ts:47-150`.
    - Sources: `docs/archive/n8n/workflows.md`, `docs/archive/ai-agent-feature-roadmap-2026.md`.

28. [x] Observability and release gates.
    - Evidence: `package.json:6-15` defines local gates and the release readiness script; `lib/release/readiness.ts:41-390` defines production env readiness checks and validators; `lib/release/readiness.ts:489-531` builds release readiness reports across local gates, production env, billing, provider, n8n, worker, and smoke checks; `scripts/release-readiness.ts:1-26` emits the operator report; existing runtime evidence remains in `lib/agents/orchestration/repository.ts:535-584`, `lib/n8n/event-log.ts:79-163`, and `lib/scheduler/worker-health.ts:121-388`.
    - Tests: `tests/release/readiness.test.ts:1-279`, plus required local gates before PR.
    - Note: live production smoke remains separate in item 35 because it requires real production services and credentials.
    - Sources: `docs/archive/phases/phase-08-analytics-n8n-release.md`, `docs/archive/specs/07-release-checklist.md`, `docs/archive/worker-runtime-readiness.md`.

### Agent Control Plane And Autonomous Workflows

29. [x] Agent profiles, missions, role templates, policy evaluation, queue execution, and Agents console.
    - Evidence: `lib/agents/schemas/orchestration.ts:6-263` defines roles, autonomy policy, profiles, missions, task runs, policy events, and simulations; `lib/agents/orchestration/role-templates.ts:16-205` defines roles; `lib/agents/orchestration/repository.ts:431-663` persists missions/policy/simulations; `lib/agents/orchestration/runner.ts:183-529` executes, pauses, resumes, and fail-closes missions; `components/agents/agents-console.tsx:47-1242` renders control-plane UI.
    - Tests: `tests/agents/orchestration.test.ts:45-454`, `tests/api/agent-mission-run.test.ts:95-269`.
    - Sources: `docs/ai-agent-feature-master-update-plan.md`, `docs/ai-agent-feature-roadmap-2026.md`, `docs/ai-agent-feature-goal-prompts-2026.md`.

30. [x] Safe autonomy defaults, model budget guards, and confidence threshold policy controls.
    - Evidence: `lib/agents/schemas/orchestration.ts:80-114` defines autonomy defaults; `lib/agents/orchestration/policy.ts:259-270` evaluates model budget/confidence limits; `lib/agents/orchestration/runner.ts:183-333` fail-closes or pauses on policy denials; `components/agents/agents-console.tsx:250-296` renders policy/simulation summaries.
    - Tests: `tests/api/agent-mission-run.test.ts:246-269`, `tests/agents/orchestration.test.ts:295-364`, `tests/agents/orchestration.test.ts:454-553`.
    - Sources: `docs/ai-agent-feature-master-update-plan.md`, `docs/ai-agent-feature-goal-prompts-2026.md`.

31. [x] Mission simulation mode with no side effects, persisted simulated actions, and governance visibility.
    - Evidence: `db/schema.ts:907` stores agent mission simulations; `lib/agents/orchestration/repository.ts:603-650` persists simulation runs; `components/agents/agents-console.tsx:200-234` and `components/agents/agents-console.tsx:924-1028` show simulation and governance sections; `app/api/agents/missions/[id]/simulate/route.ts:16-27` exposes simulation.
    - Tests: `tests/api/agent-mission-run.test.ts:179-239`, `tests/agents/orchestration.test.ts:492-514`.
    - Sources: `docs/ai-agent-feature-master-update-plan.md`, `docs/ai-agent-feature-goal-prompts-2026.md`.

32. [x] Supervised campaign mission workflow.
    - Evidence: `db/schema.ts:57-66` includes `supervised_campaign`; `components/agents/agents-console.tsx:70-98` includes preset actions/brief; `lib/agents/orchestration/executors.ts:403-1059` supports review gates, scheduling confidence, recommendations, and report summaries.
    - Tests: `tests/agents/orchestration.test.ts:1221-1290`.
    - Sources: `docs/ai-agent-feature-master-update-plan.md`, `docs/ai-agent-feature-roadmap-2026.md`.

33. [x] Weekly operator report workflow.
    - Evidence: `lib/agents/orchestration/executors.ts:981-989` builds report recommendations; `lib/agents/orchestration/executors.ts:1054-1059` summarizes reports; `lib/n8n/events.ts:9-26` supports `agent.report.generated`; `components/agents/agents-console.tsx:569-583` and `components/agents/agents-console.tsx:1014-1028` expose governance/report surfaces.
    - Tests: `tests/agents/orchestration.test.ts:379-454`, `tests/n8n/events.test.ts:93-121`.
    - Sources: `docs/ai-agent-feature-roadmap-2026.md`, `docs/ai-agent-feature-goal-prompts-2026.md`.

34. [x] Governance export for agent decisions with redaction and degraded fallback.
    - Evidence: `lib/agents/governance-export.ts:13-159` redacts sensitive fields and builds workspace-scoped export payloads; `app/api/agents/governance-export/route.ts:11-53` exposes the JSON attachment; `components/agents/agents-console.tsx:569-583` surfaces export.
    - Tests: `tests/agents/governance-export.test.ts:19-135`.
    - Sources: `docs/ai-agent-feature-roadmap-2026.md`, `docs/ai-agent-feature-goal-prompts-2026.md`, `docs/specs/01-architecture.md`.

35. [?] Production release readiness and live smoke verification.
    - Current status: release readiness tooling now exists, but external production services still require live verification by an operator with credentials.
    - Evidence available: `.env.production.example:1-58` lists the production env contract without secrets; `docs/archive/specs/07-release-checklist.md:19-40` links the template and release-readiness env-shape rules; `lib/release/readiness.ts:41-390` blocks missing, local, placeholder-host, reserved-domain, and wrong-scheme production config; `lib/release/readiness.ts:489-531` assembles the readiness report; `tests/release/readiness.test.ts:1-279` covers ready, missing, placeholder/local, wrong-scheme, and URL path/query-token readiness states; `scripts/release-readiness.ts:1-26`, `package.json:6-15`, `lib/scheduler/worker-health.ts:121-388`, `lib/providers/linkedin.ts:877-883`, `lib/providers/x.ts:512-731`, `lib/n8n/client.ts:30-139`.
    - Verification needed: run `npm run release:readiness -- --confirm-gates-passed --confirm-manual-smoke-passed` with production-shaped env after the local gates and manual smoke checks have actually passed; verify database, Redis, Clerk, ImageKit, LinkedIn, X, n8n, billing provider URLs, worker process, callback URLs, and product smoke across Dashboard, Create, Calendar, Media, Auto Replies, Billing, and Analytics.
    - Sources: `docs/archive/specs/07-release-checklist.md`, `docs/archive/phases/phase-08-analytics-n8n-release.md`, `docs/archive/worker-runtime-readiness.md`.

## Conflicts & Decisions Needed

1. Provider status conflict.
   - Conflict: `docs/next-feature-plans/README.md` says live provider adapters remain scaffold-level except mock, while current code has a live LinkedIn provider and the AI-agent roadmap also references LinkedIn live.
   - Decision: trust current code and newer roadmap direction. Canonical status is LinkedIn live, mock available, other providers scaffold/partial.

2. Billing activation drift.
   - Conflict: the next-feature README frames billing controls as disabled, while current code has checkout/portal routes and gated UI behavior.
   - Decision: canonical status is partial/conditional. The implementation exists, but production billing requires live provider URL/secret verification.

3. First provider selection is no longer open.
   - Conflict: the AI-agent master update plan asks which first real provider to support.
   - Decision: current implementation chose LinkedIn. Future provider work should be treated as expansion, not initial selection.

4. n8n scope should stay audit/reminder first.
   - Conflict: older plan language ranges from simple audit/reminder workflows to broader automation control plane ideas.
   - Decision: current code supports signed events, callbacks, and docs for workflows. Keep this as canonical until importable packs or user-managed automation surfaces are added.

5. Brand memory has two scopes.
   - Conflict: next-feature plan 05 is satisfied by the current brand-memory workbench, while AI-agent roadmap asks for clustering, merge suggestions, and contradiction handling.
   - Decision: split the item. Base brand-memory review/apply is done, and Brand Voice Memory Curator 2.0 is now implemented by the curation summary and workbench surface.

## Deduplication Log

- Merged foundation, routing, design shell, package scripts, and environment setup from phase 01, specs 01/02, and `docs/README.md`.
- Merged auth, database, workspace, billing, and usage work from phase 02, data, billing, and provider specs, and the billing activation plan.
- Merged content generation requirements from phase 03, the PRD, agent workflow specs, and AI-agent roadmap items into the LangChain content-agent item.
- Merged LangGraph approval/checkpoint/resume requirements from phase 04, workflow specs, and approval-related roadmap items.
- Merged media library, media upload, platform constraints, and composer media attachment from phase 05.
- Merged provider contracts, LinkedIn productionization, connections center, publishing, scheduling, worker readiness, retry, and queue-health plans from phase 06 and next-feature plans 01-03.
- Merged comment triage, auto replies, reply approvals, and safety labels from phase 07 and AI-agent roadmap batch items.
- Merged analytics, n8n, observability, and release checklist items from phase 08, `docs/n8n/workflows.md`, and release specs.
- Merged AI-agent roadmap/master/goal prompt items into agent control plane, mission simulation, supervised campaign, weekly report, governance export, approval command center, scorecards, next-best actions, and brand-memory 2.0.
- Split inflated roadmap items when code evidence showed one part done and another part missing, especially brand memory base vs 2.0, analytics dashboard vs recommendations, n8n events vs automation packs, and LinkedIn provider vs provider expansion.

## Source Documents

| # | Source document | Last modified | Consolidation status |
|---:|---|---|---|
| 1 | `docs/ai-agent-feature-goal-prompts-2026.md` | 2026-06-24 00:07:29 -0500 | Superseded by this master plan |
| 2 | `docs/ai-agent-feature-master-update-plan.md` | 2026-06-22 11:13:19 -0500 | Superseded by this master plan |
| 3 | `docs/ai-agent-feature-roadmap-2026.md` | 2026-06-24 00:07:29 -0500 | Superseded by this master plan |
| 4 | `docs/ai-workflow.md` | 2026-06-19 15:22:08 -0500 | Superseded by this master plan |
| 5 | `docs/n8n/workflows.md` | 2026-06-20 16:50:56 -0500 | Superseded by this master plan |
| 6 | `docs/next-feature-plans/01-linkedin-provider-productionization.md` | 2026-06-22 18:45:49 -0500 | Superseded by this master plan |
| 7 | `docs/next-feature-plans/02-connections-control-center.md` | 2026-06-22 18:45:49 -0500 | Superseded by this master plan |
| 8 | `docs/next-feature-plans/03-worker-runtime-readiness.md` | 2026-06-22 18:45:49 -0500 | Superseded by this master plan |
| 9 | `docs/next-feature-plans/04-billing-activation-path.md` | 2026-06-22 18:45:49 -0500 | Superseded by this master plan |
| 10 | `docs/next-feature-plans/05-brand-memory-management-page.md` | 2026-06-22 18:45:49 -0500 | Superseded by this master plan |
| 11 | `docs/next-feature-plans/README.md` | 2026-06-22 18:45:49 -0500 | Superseded by this master plan |
| 12 | `docs/phases/phase-01-foundation.md` | 2026-06-19 15:22:08 -0500 | Superseded by this master plan |
| 13 | `docs/phases/phase-02-auth-db-billing.md` | 2026-06-19 15:22:08 -0500 | Superseded by this master plan |
| 14 | `docs/phases/phase-03-langchain-content-agent.md` | 2026-06-19 15:22:08 -0500 | Superseded by this master plan |
| 15 | `docs/phases/phase-04-langgraph-content-workflow.md` | 2026-06-19 15:22:08 -0500 | Superseded by this master plan |
| 16 | `docs/phases/phase-05-media-platform-variants.md` | 2026-06-19 15:22:08 -0500 | Superseded by this master plan |
| 17 | `docs/phases/phase-06-provider-publishing.md` | 2026-06-19 15:22:08 -0500 | Superseded by this master plan |
| 18 | `docs/phases/phase-07-comment-reply-agent.md` | 2026-06-19 15:22:08 -0500 | Superseded by this master plan |
| 19 | `docs/phases/phase-08-analytics-n8n-release.md` | 2026-06-19 15:22:08 -0500 | Superseded by this master plan |
| 20 | `docs/README.md` | 2026-06-24 00:07:29 -0500 | Superseded by this master plan |
| 21 | `docs/specs/00-product-prd.md` | 2026-06-19 15:22:08 -0500 | Superseded by this master plan |
| 22 | `docs/specs/01-architecture.md` | 2026-06-19 15:22:08 -0500 | Superseded by this master plan |
| 23 | `docs/specs/02-ui-design-system.md` | 2026-06-19 15:22:08 -0500 | Superseded by this master plan |
| 24 | `docs/specs/03-data-model.md` | 2026-06-19 15:22:08 -0500 | Superseded by this master plan |
| 25 | `docs/specs/04-langchain-agent-system.md` | 2026-06-19 15:22:08 -0500 | Superseded by this master plan |
| 26 | `docs/specs/05-langgraph-workflows.md` | 2026-06-19 15:22:08 -0500 | Superseded by this master plan |
| 27 | `docs/specs/06-provider-integrations.md` | 2026-06-19 15:22:08 -0500 | Superseded by this master plan |
| 28 | `docs/specs/07-billing-usage.md` | 2026-06-19 15:22:08 -0500 | Superseded by this master plan |
| 29 | `docs/specs/07-release-checklist.md` | 2026-06-20 16:50:56 -0500 | Superseded by this master plan |
| 30 | `docs/worker-runtime-readiness.md` | 2026-06-23 00:29:27 -0500 | Superseded by this master plan |
