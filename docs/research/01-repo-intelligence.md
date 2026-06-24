# Repo Intelligence

Confirmed date: 2026-06-24.

Scope: read-only capability map for the current `Automated-Content` checkout. This file describes what exists and what appears absent or unclear; it does not recommend new features.

## Product Shape

This repo is a governed social-content operations SaaS, not a blank starter. The product goal in the archived PRD is to help users research topics, generate social content, tailor platform variants, schedule and publish posts, and manage keyword-based comment replies (`docs/archive/specs/00-product-prd.md:7`, `docs/archive/specs/00-product-prd.md:47-48`). The live implementation matches that direction with dashboard routes for agents, analytics, approvals, auto-replies, billing, brand memory, calendar, connections, create, media, and settings, plus API routes for agent runs, agents, approvals, billing, brand memory, connections, media, operations, posts, replies, and webhooks (Codegraph file tree; source-confirmed by route reads cited below).

The dependency manifest shows a modern Next/React TypeScript app with Clerk, LangChain, LangGraph, OpenAI/Gemini model adapters, Drizzle, Neon, BullMQ, Zod, Playwright, and Vitest (`package.json:19-35`, `package.json:41-56`). Local gates and runtimes are explicit: `dev`, `build`, `worker`, `lint`, `typecheck`, `test`, `build:e2e`, `test:e2e`, Drizzle generate/push/studio (`package.json:5-17`).

## Data Model

The schema is broad and product-specific:

- Workspace, subscription, usage, content, and variant ownership: `workspaces`, `subscriptions`, `usageLedger`, `contentDrafts`, `platformVariants` (`db/schema.ts:175`, `db/schema.ts:217`, `db/schema.ts:243`, `db/schema.ts:362`, `db/schema.ts:400`).
- Media, provider, scheduling, publishing, and retry state: `mediaAssets`, `connectedAccounts`, `scheduledJobs`, `publishAttempts` (`db/schema.ts:292`, `db/schema.ts:435`, `db/schema.ts:490`, `db/schema.ts:533`).
- Comment and reply automation: `commentEvents`, `replyAttempts` (`db/schema.ts:565`, `db/schema.ts:632`).
- Agent and workflow state: `agentRuns`, `workflowCheckpoints`, `agentProfiles`, `agentMissions`, `agentTaskRuns`, `agentPolicyEvents`, `agentMissionSimulations` (`db/schema.ts:331`, `db/schema.ts:707`, `db/schema.ts:746`, `db/schema.ts:776`, `db/schema.ts:816`, `db/schema.ts:864`, `db/schema.ts:907`).
- Brand memory and automation audit: `brandMemoryProposals`, `n8nEvents` (`db/schema.ts:674`, `db/schema.ts:944`).

## Existing AI-Agent Workflows

The content agent runs structured research, brand-profile lookup, past-post retrieval, platform variant generation, policy checks, schedule suggestions, and draft saving (`lib/agents/langchain/content-agent.ts:93-200`). The durable content workflow wraps that in LangGraph, uses `StateGraph`, persists checkpoints, interrupts before save, and resumes after approval (`lib/agents/graphs/content-workflow.ts:286-287`, `lib/agents/graphs/content-workflow.ts:431-451`, `lib/agents/graphs/content-workflow.ts:490-568`, `lib/agents/graphs/content-workflow.ts:600-733`).

Comment automation is also agentic but approval-gated. The comment agent evaluates reply rules, drafts replies, performs safety checks, escalates risky or non-keyword suggestions, and persists run metadata (`lib/agents/langchain/comment-agent.ts:203-343`). The comment reply workflow creates approval items for required review, records attempts, and only sends when the rule/safety path permits it (`lib/agents/graphs/comment-reply-workflow.ts:152-181`, `lib/agents/graphs/comment-reply-workflow.ts:243-278`, `lib/agents/graphs/comment-reply-workflow.ts:386-434`).

The agent control plane is implemented beyond the basic content agent. It has mission types such as `supervised_campaign` and `weekly_report` in the UI (`components/agents/agents-console.tsx:73-80`), presets that explicitly stop for human approval before scheduling or publishing (`components/agents/agents-console.tsx:95-102`), mission create/run/simulate/pause/resume controls (`components/agents/agents-console.tsx:429-515`), profile pause/resume and governance export (`components/agents/agents-console.tsx:520-583`), and simulation/governance panels (`components/agents/agents-console.tsx:931-1032`).

Mission execution evaluates policies before and during a run, records policy events, pauses on denials, emits orchestration events, and supports pause/resume (`lib/agents/orchestration/runner.ts:181-252`, `lib/agents/orchestration/runner.ts:289-333`, `lib/agents/orchestration/runner.ts:444-529`). Simulation plans actions without side effects, records policy events, estimates usage, and persists simulation rows (`lib/agents/orchestration/simulation.ts:505-652`). Executors bridge missions into content generation, scheduling readiness, engagement, and reports (`lib/agents/orchestration/executors.ts:422-475`, `lib/agents/orchestration/executors.ts:543-632`, `lib/agents/orchestration/executors.ts:737-831`, `lib/agents/orchestration/executors.ts:981-1059`).

## Approval Checkpoints

Approvals are a first-class product surface, not just inline buttons. The approval command center normalizes reply approvals, brand-memory proposals, content workflow checkpoints, and agent policy escalations (`lib/approvals/command-center.ts:22-70`, `lib/approvals/command-center.ts:147-212`, `lib/approvals/command-center.ts:212-268`, `lib/approvals/command-center.ts:268-357`). The dashboard page exposes filters for content workflow, reply approval, brand memory, policy escalation, provider block, and budget block (`app/(dashboard)/approvals/page.tsx:19-27`, `app/(dashboard)/approvals/page.tsx:64-114`).

Tests assert the command center aggregates pending decisions without leaking raw source payloads (`tests/approvals/command-center.test.ts:16-127`).

## Publishing And Providers

Providers use an explicit adapter contract. Supported keys are `mock`, `meta`, `linkedin`, `x`, `slack`, and `discord`; provider status can be `mock`, `stub`, or `live`; adapters expose capabilities, connection, token refresh, publish, reply, and error normalization (`lib/providers/types.ts:1-3`, `lib/providers/types.ts:36`, `lib/providers/types.ts:140-151`).

LinkedIn is the only evidenced live provider. It has OAuth/token exchange and refresh, profile fetch, image upload safety checks, capability validation, publish behavior, and a `ProviderAdapter` export (`lib/providers/linkedin.ts:535-591`, `lib/providers/linkedin.ts:599-625`, `lib/providers/linkedin.ts:688-789`, `lib/providers/linkedin.ts:877-973`, `lib/providers/linkedin.ts:1037-1107`). Non-LinkedIn live adapters are scaffolded through skeleton providers, and the connect route returns a scaffold-only error for stubs (`lib/providers/skeleton.ts:30-55`, `app/api/connections/[provider]/connect/route.ts:151-152`).

Scheduling validates provider/platform compatibility, connected accounts, provider health, plan access, and usage before creating a durable schedule and enqueue result (`app/api/posts/[id]/schedule/route.ts:164-311`). Scheduled publishing is BullMQ-backed: the queue uses `social-publishing`, `publish-post`, Redis connection options, three attempts, and stable job IDs (`lib/scheduler/enqueue.ts:8-111`). The worker starts both publishing and agent-mission queues (`workers/social-worker.ts:77-156`). Publish execution validates terminal states, account consistency, provider readiness, then starts an attempt, calls `provider.publish`, marks success, or normalizes failure (`workers/jobs/publish-post.ts:309-436`).

Retry safety is explicit: retries block published jobs, duplicate successful attempts, non-retryable failures, and concurrent retry conflicts (`lib/scheduler/publish-retry.ts:41-234`). Tests cover durable row creation before enqueue, enqueue failure visibility, duplicate avoidance, provider readiness blocking, publish preflight blocking, duplicate send prevention, and retry safety (`tests/scheduler/create-scheduled-post.test.ts:80-206`, `tests/workers/publish-post.test.ts:131-305`, `tests/scheduler/publish-retry.test.ts:81-183`).

## Analytics, Automation, And Observability

Analytics aggregate posting, failures, replies, usage, agent activity, and platform breakdowns (`lib/analytics/metrics.ts:454-489`). Production snapshots query usage totals, agent totals, usage by type/day, platform variants, comments, and replies (`lib/analytics/metrics.ts:657-827`). The dashboard renders posting, failures, replies, usage, agent activity, platform breakdown, usage chart, and recent agent runs (`app/(dashboard)/analytics/page.tsx:49-147`).

n8n integration is signed and audited. Event types include content workflow events, publishing, replies, agent mission/report events, and usage thresholds (`lib/n8n/events.ts:9-26`). The client signs outbound events and records dispatch state (`lib/n8n/client.ts:57-147`), the callback route verifies signature before recording accepted callbacks (`app/api/webhooks/n8n/route.ts:10-67`), and the workflow doc names recommended release automations (`docs/archive/n8n/workflows.md:84-94`).

LangSmith is configured as an optional env key/project (`lib/env.ts:30-33`), and agent runs store trace IDs/tool calls through the agent storage path (`lib/agents/langchain/content-agent.ts:99-116`, `lib/agents/langchain/comment-agent.ts:212-218`).

## Billing And Monetization Surfaces

Billing is modeled and partially activated. Entitlements define free/premium limits and features (`lib/billing/entitlements.ts:29-57`, `lib/billing/entitlements.ts:78-122`). Usage helpers enforce limits, lock consumption, deduplicate source IDs, and read ledger totals (`lib/billing/usage.ts:136-170`, `lib/billing/usage.ts:288-379`, `lib/billing/usage.ts:488-566`). Clerk subscription webhooks sync plan state into `subscriptions` (`lib/billing/clerk-sync.ts:91-147`, `lib/billing/clerk-sync.ts:208-230`).

The billing page exposes checkout/portal buttons only when configured and labels local preview or disabled states (`app/(dashboard)/billing/page.tsx:35-52`, `app/(dashboard)/billing/page.tsx:86-134`). Checkout and portal routes delegate to the billing action handler (`app/api/billing/checkout/route.ts:6-7`, `app/api/billing/portal/route.ts:6-7`).

Tests confirm premium seven-post/day scheduling, feature gates, non-ledger budgets, usage locking, and source-id deduplication (`tests/billing/entitlements.test.ts:17-40`, `tests/billing/usage.test.ts:44-102`).

## Brand Memory

Brand memory exists as a proposal/review/apply loop. Edits produce workspace/platform/profile/campaign proposals with confidence and evidence (`lib/brand-memory/schemas.ts:5-24`, `lib/brand-memory/proposals.ts:240-302`). Database and memory repositories support save/list/review/bulk review (`lib/brand-memory/proposals.ts:385-479`). Accepted proposals are applied to the brand profile path, while rejected rules are excluded (`lib/brand-memory/proposals.ts:572-611`). The workbench supports filters, counts, selection, bulk accept/reject, individual review, and source display (`components/brand-memory/brand-memory-workbench.tsx:65-399`). The create review step can surface and accept/reject generated brand-memory proposals (`components/create/review-step.tsx:180-237`, `components/create/review-step.tsx:327`).

Tests cover proposal generation from edits, accepted-only application, filtering, bulk review, and profile read path (`tests/brand-memory/proposals.test.ts:88-255`).

## High-Leverage Extension Points

- `lib/agents/orchestration/*`: mission policy, simulation, executors, repository, queue, audit, and event emission already form a control plane for new supervised workflows.
- `lib/approvals/command-center.ts`: one place to surface pending human decisions across content, replies, memory, provider/budget/policy blocks.
- `lib/providers/*`: provider adapters expose capability matrices, connection state, health checks, publishing, replies, and scaffold/live status.
- `lib/scheduler/*` and `workers/*`: durable queueing, worker health, retry classification, and recovery affordances exist.
- `lib/analytics/metrics.ts`: snapshot aggregation already joins posting, reply, usage, and agent runs.
- `lib/brand-memory/*`: accepted memory is already generation-visible through the brand profile path.
- `lib/n8n/*`: signed outbound/inbound automation audit exists without exposing an end-user workflow builder.

## Missing Or Unclear Surfaces

- No dedicated scorecard service or scorecard UI was evidenced; analytics aggregate agent run counts/tool calls but not deterministic per-agent quality scoring (`lib/analytics/metrics.ts:442-489`, `components/analytics/agent-run-table.tsx:37-85`).
- No dedicated analytics next-best-action records or recommendation panel were evidenced; report executors emit recommendations, but analytics renders metrics/tables without action approval records (`lib/agents/orchestration/executors.ts:981-989`, `app/(dashboard)/analytics/page.tsx:49-147`).
- n8n has signed events and docs, but no importable workflow pack artifacts or in-app pack manager were evidenced (`lib/n8n/events.ts:9-26`, `docs/archive/n8n/workflows.md:84-94`).
- Provider expansion beyond LinkedIn/mock is scaffold or partial; stubs are explicitly labeled scaffold-only (`lib/providers/skeleton.ts:30-55`, `app/api/connections/[provider]/connect/route.ts:151-152`).
- Production billing is conditional on configured checkout/portal URLs; the page and action helpers handle not-configured/local-preview states (`lib/billing/actions.ts:22-31`, `app/(dashboard)/billing/page.tsx:35-52`).
- Release readiness is not established by this read-only pass; package scripts exist, but this task did not run lint/typecheck/test/build/e2e (`package.json:5-17`).

## Risks And Constraints

- External side effects are real: LinkedIn publishing and provider tokens exist, so future autonomy must stay policy- and approval-gated (`lib/providers/linkedin.ts:1037-1107`, `lib/agents/orchestration/policy.ts:303-311`).
- Queue-backed publishing depends on `REDIS_URL`; the enqueue path throws when Redis is missing, and worker health has explicit local-preview/degraded guidance (`lib/scheduler/enqueue.ts:39-48`, `lib/scheduler/worker-health.ts:121-139`).
- Env-dependent production readiness spans Clerk, billing URLs, database, model keys, ImageKit, LinkedIn, Redis, and n8n (`lib/env.ts:18-47`, `.env.example:7-50`).
- Docs were reorganized in the live worktree: many legacy planning docs now live under `docs/archive`, while `docs/README.md` still references the old `docs/specs`, `docs/phases`, and `docs/next-feature-plans` paths (`docs/README.md:7-36`). Treat current source files and `docs/MASTER_PLAN_v2.md` as more current than the old README map (`docs/MASTER_PLAN_v2.md:11-18`, `docs/MASTER_PLAN_v2.md:170-185`).
