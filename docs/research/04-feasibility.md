# Feasibility And Risk

Confirmed date: 2026-06-24.

Scope: evaluate the feature ideas in `03-feature-ideation.md` for feasibility without a rewrite. This read-only pass inspected the dependency manifest, archived specs, master plans, database schema, agent/workflow code, scheduler/workers, provider APIs, dashboard/API routes, and tests.

## Architecture Baseline

The app already has the main primitives needed for governed agent features:

- Modern Next/React/TypeScript app with LangChain, LangGraph, OpenAI/Gemini adapters, Drizzle, BullMQ, Clerk, Zod, Playwright, and Vitest (`package.json:19-35`, `package.json:41-56`).
- Durable local gates and worker scripts (`package.json:5-17`).
- Agent workflow state, checkpoints, profile/mission/task/policy/simulation rows, and n8n events (`db/schema.ts:331`, `db/schema.ts:707`, `db/schema.ts:746`, `db/schema.ts:776`, `db/schema.ts:816`, `db/schema.ts:864`, `db/schema.ts:907`, `db/schema.ts:944`).
- Content workflow approval checkpointing and resume (`lib/agents/graphs/content-workflow.ts:490-568`, `lib/agents/graphs/content-workflow.ts:600-733`).
- Agent mission execution, pause/resume, simulation, reports, and policy events (`lib/agents/orchestration/runner.ts:181-529`, `lib/agents/orchestration/simulation.ts:505-652`, `lib/agents/orchestration/executors.ts:981-1059`).
- Unified approval command center across replies, brand memory, content workflow, and agent policy events (`lib/approvals/command-center.ts:147-357`).
- LinkedIn live provider plus scaffold-only provider paths (`lib/providers/linkedin.ts:877-1107`, `lib/providers/skeleton.ts:30-55`, `app/api/connections/[provider]/connect/route.ts:151-152`).
- Durable scheduling, queues, worker runtime, retry safety, and worker health (`lib/scheduler/enqueue.ts:8-111`, `workers/social-worker.ts:77-156`, `lib/scheduler/publish-retry.ts:41-234`, `lib/scheduler/worker-health.ts:331-388`).
- Analytics across posting, failures, replies, usage, agents, and platforms (`lib/analytics/metrics.ts:454-489`, `lib/analytics/metrics.ts:657-827`, `app/(dashboard)/analytics/page.tsx:49-147`).
- Brand memory proposal/review/apply loop (`lib/brand-memory/proposals.ts:240-302`, `lib/brand-memory/proposals.ts:385-479`, `lib/brand-memory/proposals.ts:572-611`).
- Tests are broad enough for incremental work: agent orchestration, approvals, analytics, billing, brand memory, scheduler, workers, providers, API routes, and e2e all have coverage (`tests/agents/orchestration.test.ts:40-2036`, `tests/approvals/command-center.test.ts:16-185`, `tests/analytics/metrics.test.ts:10-266`, `tests/billing/entitlements.test.ts:17-40`, `tests/brand-memory/proposals.test.ts:88-255`, `tests/scheduler/create-scheduled-post.test.ts:80-206`, `tests/workers/publish-post.test.ts:131-305`).

## Scoring Key

- Effort: S = 1-3 days, M = 1-2 weeks, L = multi-week.
- Security/privacy risk: Low, Medium, High.
- Operational cost: Low, Medium, High.
- User value: Low, Medium, High.
- Architecture alignment: Low, Medium, High.
- Verdict: Quick win, Next major bet, Do not build yet.

## Full Decision Matrix

| # | Idea | Effort | Sec/Privacy Risk | Ops Cost | User Value | Alignment | Verdict |
|---|---|---:|---|---|---|---|---|
| 1 | Agent Quality Scorecards | M | Low | Low | High | High | Quick win |
| 2 | Analytics Next-Best-Action Agent | M | Medium | Low | High | High | Quick win, rules-first |
| 3 | Simulation Branch Compare | M | Low | Low | High | High | Next major bet |
| 4 | Provider Readiness Recovery Agent | S-M | Medium | Low | High | High | Quick win |
| 5 | Provider Expansion Activation Wizard | M | Medium | Low | High | High | Quick win for checklist; provider implementation is a separate bet |
| 6 | Brand Voice Memory Curator 2.0 | M | Medium | Low | High | High | Next major bet |
| 7 | Approval SLA And Reminder Agent | S-M | Low | Low | Medium | High | Quick win |
| 8 | Governance Export Narrative Brief | S-M | Low | Low | High | High | Quick win |
| 9 | Cost-Aware Model Router And Budget Forecaster | M | Low | Low | Medium | High | Next major bet |
| 10 | Content Performance Learning Loop | L | Medium | Medium | High | Medium | Next major bet |
| 11 | Supervised Campaign Autopilot Plus | M-L | Medium | Medium | High | High | Next major bet |
| 12 | Reply Risk Triage Enhancer | M | High | Low | High | High | Next major bet |
| 13 | n8n Automation Pack Manager | M | Medium | Medium | Medium | High | Next major bet |
| 14 | Workspace Agent Instruction Packs | M | Medium | Low | High | High | Quick win as preview; next bet when injected into runs |
| 15 | Provider Metrics Sync Agent | L | High | Medium | High | Medium | Do not build yet, except mock/status shell |
| 16 | Safe Social Post Visual QA Agent | S-M | Low | Low | Medium | High | Quick win, metadata-first |
| 17 | Approval-Aware Schedule Optimizer | M | Medium | Low | High | High | Next major bet |
| 18 | Agent Session Timeline Inspector | M | Low | Low | High | High | Quick win |
| 19 | Source-Aware Campaign Research Agent | M-L | High | Medium | High | Medium | Next major bet, manual sources first |
| 20 | Agent Marketplace Readiness Scanner | M | Medium | Low | Medium | Medium | Do not build yet |

## Quick Wins

### Agent Quality Scorecards

Feasible because the data already exists: `agentRuns`, `agentTaskRuns`, `agentPolicyEvents`, `workflowCheckpoints`, publish/reply attempts, and analytics aggregation are all present (`db/schema.ts:331`, `db/schema.ts:707`, `db/schema.ts:816`, `db/schema.ts:864`, `db/schema.ts:533`, `db/schema.ts:632`, `lib/analytics/metrics.ts:442-489`). No new external side effects are needed. The safest MVP is deterministic scoring from existing rows, not LLM grading.

Risks: sparse data, misleading scores, and preview-only rows. Mitigation: display evidence and sample size, make scores explainable, and avoid auto-actions.

### Analytics Next-Best-Action Agent

Feasible as a rules engine because analytics, queue health, approval command center, provider health, and billing state already exist (`lib/analytics/metrics.ts:827-870`, `lib/scheduler/worker-health.ts:331-388`, `lib/approvals/command-center.ts:317-357`, `lib/providers/health.ts:83-193`, `lib/billing/usage.ts:379-414`). MVP should recommend links/actions only; anything that retries, schedules, or sends should still require an explicit approval path.

Risks: recommendations can become hidden automation. Mitigation: output "recommendation records" with reasons, not side effects.

### Provider Readiness Recovery Agent

Feasible because recovery classifiers, retry reservation, worker health, provider health, and calendar retry controls exist (`lib/scheduler/publish-recovery.ts:42-100`, `lib/scheduler/publish-retry.ts:41-234`, `lib/scheduler/worker-health.ts:121-139`, `lib/providers/health.ts:83-193`, `components/calendar/publish-retry-button.tsx:36-78`). MVP is an explanation and routing layer.

Risks: duplicate publishing or unsafe retry. Mitigation: reuse `retryScheduledPublish` guards, never bypass success-attempt checks (`lib/scheduler/publish-retry.ts:73-124`).

### Provider Expansion Activation Wizard

Feasible as a readiness checklist because provider registry, capability maps, scaffold/live statuses, and env config are inspectable (`lib/providers/registry.ts:17-25`, `lib/providers/types.ts:36`, `lib/providers/types.ts:140-151`, `lib/env.ts:38-47`). It should not imply Meta/X/Slack/Discord are production-ready; the wizard can only expose blockers until adapters are implemented.

Risks: stale third-party API assumptions. Mitigation: link provider-specific docs and require source review before implementation.

### Approval SLA And Reminder Agent

Feasible because the command center returns item ages and filters, and n8n signed events already exist (`lib/approvals/command-center.ts:114-133`, `lib/approvals/command-center.ts:317-357`, `lib/n8n/events.ts:9-26`, `lib/n8n/client.ts:57-147`). MVP can add overdue badges and a manual reminder event before automating reminders.

Risks: notification spam. Mitigation: add dedupe and workspace settings before auto-send.

### Governance Export Narrative Brief

Feasible because governance export already gathers missions, brand-memory proposals, reply approvals, usage, billing, task counts, simulations, policy events, provider events, and pending approvals, then redacts sensitive values (`lib/agents/governance-export.ts:19-31`, `lib/agents/governance-export.ts:65-159`). MVP can be deterministic Markdown generated from the same payload.

Risks: leakage through narrative text. Mitigation: generate from redacted payload only and test token-like fields.

### Workspace Agent Instruction Packs

Feasible as preview-only because brand memory, agent profiles/policies, provider capabilities, and billing state are available (`lib/brand-memory/proposals.ts:600-611`, `db/schema.ts:746`, `lib/providers/connections.ts:325-378`, `lib/billing/usage.ts:379-414`). Injecting the packet into actual agent runs should wait until tests cover source freshness and conflict handling.

Risks: stale instructions and over-trust. Mitigation: include generated-at, sources, and human approval before activation.

### Safe Social Post Visual QA Agent

Feasible as metadata QA because platform variants, media assets, platform constraints, and policy warnings already exist (`db/schema.ts:400`, `db/schema.ts:292`, `lib/agents/tools/check-platform-policy.ts`, `tests/agents/tools.test.ts:76-125`). Do not start with provider browser automation.

Risks: false positives on visual layout. Mitigation: MVP uses deterministic platform/media constraints; screenshot QA is optional later.

### Agent Session Timeline Inspector

Feasible because agent audit already collects missions, task runs, policy events, simulations, and n8n events (`lib/agents/orchestration/audit.ts:61-123`), and the console already renders mission detail sections (`components/agents/agents-console.tsx:1081-1236`). MVP is a chronology view.

Risks: noisy UI. Mitigation: default to significant events and expose filters.

## Next Major Bets

### Simulation Branch Compare

Strong fit because simulation is already side-effect-suppressed and persisted (`lib/agents/orchestration/simulation.ts:505-652`, `tests/agents/orchestration.test.ts:1452-1473`). It becomes a major bet because branch inputs, policy overrides, and UI comparison require careful schema and test work.

Recommended sequencing: after scorecards/timeline, because branch comparison benefits from explainable scoring and chronology.

### Brand Voice Memory Curator 2.0

Strong fit because proposals/review/apply already exist (`lib/brand-memory/proposals.ts:240-302`, `lib/brand-memory/proposals.ts:385-479`, `lib/brand-memory/proposals.ts:572-611`). It becomes a major bet because conflict detection and merge suggestions affect future generations and can change brand behavior.

Recommended sequencing: deterministic clustering first; model summaries only after human approval and tests for contradictions.

### Cost-Aware Model Router And Budget Forecaster

Fits the existing policy and usage-estimate structure (`lib/agents/orchestration/policy.ts:259-270`, `lib/agents/orchestration/usage-estimates.ts`, `tests/agents/orchestration.test.ts:454-553`). It needs current model pricing/config discipline, so avoid hardcoding prices into scattered logic.

Recommended sequencing: forecast first, routing second.

### Content Performance Learning Loop

Valuable but dependent on analytics maturity and provider metrics. Internal signals exist (`lib/analytics/metrics.ts:345-421`), but provider reach/engagement is not evidenced as live. Build only an internal-signal MVP until metrics adapters exist.

Recommended sequencing: after scorecards and brand-memory curator, because learnings should produce reviewable proposals.

### Supervised Campaign Autopilot Plus

Aligned with existing supervised campaign preset and tests (`components/agents/agents-console.tsx:95-102`, `tests/agents/orchestration.test.ts:1191-1404`). It is major because it touches create/generate/schedule/report paths and risks duplicating existing UX.

Recommended sequencing: improve the existing mission wizard and approval handoff rather than create a parallel flow.

### Reply Risk Triage Enhancer

High user value, but reply automation is externally visible and sensitive. Existing agent/workflow paths require approval for non-keyword or escalated replies (`lib/agents/langchain/comment-agent.ts:245-312`, `lib/agents/graphs/comment-reply-workflow.ts:386-434`). Any model-assisted triage must fail closed.

Recommended sequencing: deterministic labels and rule-draft suggestions first; no autonomous reply expansion.

### n8n Automation Pack Manager

Fits signed event/callback infrastructure (`lib/n8n/events.ts:9-26`, `app/api/webhooks/n8n/route.ts:10-67`, `docs/archive/n8n/workflows.md:84-94`). It is a major bet because importable workflow packs and setup verification require external n8n compatibility and operational docs.

Recommended sequencing: test event and status UI before importable JSON packs.

### Approval-Aware Schedule Optimizer

Aligned with scheduling preflight checks and durable schedule creation (`app/api/posts/[id]/schedule/route.ts:164-311`, `lib/scheduler/create-scheduled-post.ts:332-383`). It is risky because scheduling is close to publishing side effects. Keep "prepare schedule" separate from "enqueue schedule".

Recommended sequencing: run after Provider Recovery and Visual QA so blockers are easier to explain.

### Source-Aware Campaign Research Agent

Strategically valuable, but source ingestion creates prompt-injection and data-origin risk. The content agent already accepts sources (`lib/agents/langchain/content-agent.ts:131-146`), but there is no source store or source approval model. Start manual and structured.

Recommended sequencing: after Workspace Instruction Packs and approval framework updates.

## Do Not Build Yet

### Provider Metrics Sync Agent

Do not build live metrics sync yet. Provider metrics capability is modeled, but live metric ingestion is not evidenced; LinkedIn live publishing exists, but metrics/reply surfaces are not shown as production-ready (`lib/providers/types.ts:12-13`, `lib/providers/linkedin.ts:1037-1116`, `lib/agents/orchestration/executors.ts:988`). Build a status shell or mock metrics only if needed for UI planning.

Blocking dependencies:

- Provider-specific metric scopes and API terms.
- Persisted metrics data model.
- Rate-limit and freshness strategy.
- Tests proving unsupported providers do not call external APIs.

### Agent Marketplace Readiness Scanner

Do not build yet. Internal templates and role profiles exist (`lib/agents/orchestration/role-templates.ts:16-205`, `components/agents/agents-console.tsx:73-102`), but a marketplace/readiness scanner is premature until the highest-value mission workflows are stable and repeatable.

Blocking dependencies:

- More real templates beyond seeded role defaults.
- Proven campaign/report workflows in production.
- Governance/scorecard/timeline surfaces to make templates auditable.

### Fully Autonomous Social Publishing

Explicitly avoid. Existing specs and code require human review before publishing and fail closed on risky external actions (`docs/archive/specs/04-langchain-agent-system.md:59-62`, `lib/agents/orchestration/policy.ts:303-311`, `app/api/posts/[id]/schedule/route.ts:164-311`). The product can prepare, simulate, and recommend, but should not silently publish.

### Browser-Login Provider Automation

Explicitly avoid. The provider integration spec says to use official APIs and not scraping/login automation that violates provider terms (`docs/archive/specs/06-provider-integrations.md:56`). Browser/computer use can be useful for internal QA and previews, not for provider login workarounds.

## Recommended Build Order

1. Agent Session Timeline Inspector: low side-effect risk; improves every later governance feature.
2. Governance Export Narrative Brief: uses existing export and redaction; creates executive/compliance value quickly.
3. Provider Readiness Recovery Agent: high operational value and reuses existing retry/health logic.
4. Agent Quality Scorecards: unlocks confidence/eval layer for future recommendations.
5. Analytics Next-Best-Action Agent: becomes safer once scorecards and timelines explain the basis.
6. Approval SLA And Reminder Agent: adds workflow hygiene via existing approval/n8n primitives.
7. Safe Social Post Visual QA Agent: improves approval quality without external side effects.
8. Workspace Agent Instruction Packs: improves consistency before deeper memory/research features.
9. Simulation Branch Compare: builds on timeline/scorecards and makes simulations more valuable.
10. Brand Voice Memory Curator 2.0: meaningful premium memory feature after instruction packets.

## Feasibility Conclusion

The roadmap can deliver meaningful paid value without rewriting the stack. The best path is to deepen governance, recovery, scoring, recommendations, and approval ergonomics on top of the existing LangGraph/BullMQ/Drizzle architecture. Avoid near-term work that requires new live provider metrics, open-ended MCP/A2A autonomy, browser-login provider automation, or public agent marketplaces.
