# AI-Agent Feature Roadmap

Confirmed date: 2026-06-24.

Scope: this is a read-only roadmap for `C:\Users\huuth\Desktop\Automated-Content`. It synthesizes the four ordered research outputs:

- `docs/research/01-repo-intelligence.md`
- `docs/research/02-trends.md`
- `docs/research/03-feature-ideation.md`
- `docs/research/04-feasibility.md`

Only documentation files were produced. The roadmap does not recommend rewriting the stack, bypassing approvals, adding unofficial provider automation, or shipping autonomous external actions.

## Executive Summary

`Automated-Content` is already closer to a governed agent operations platform than a generic social scheduler. The strongest roadmap is not "add a chatbot." It is to turn the existing workflow, approval, simulation, provider, and audit primitives into a premium agent-control product: transparent session timelines, governed exports, provider recovery guidance, scorecards, next-best-action recommendations, approval hygiene, visual/platform QA, workspace instruction packs, branchable simulations, and brand-memory curation.

The repo has the necessary foundation:

- Agent, workflow, checkpoint, mission, task, simulation, policy, and n8n event tables already exist (`db/schema.ts:331`, `db/schema.ts:707`, `db/schema.ts:746`, `db/schema.ts:776`, `db/schema.ts:816`, `db/schema.ts:864`, `db/schema.ts:907`, `db/schema.ts:944`).
- LangGraph content workflow checkpointing and approval resume are already implemented (`lib/agents/graphs/content-workflow.ts:490-568`, `lib/agents/graphs/content-workflow.ts:600-733`).
- Agent orchestration already supports mission execution, pause/resume, side-effect-suppressed simulations, weekly reports, recommendations, and policy events (`lib/agents/orchestration/runner.ts:181-529`, `lib/agents/orchestration/simulation.ts:505-652`, `lib/agents/orchestration/executors.ts:981-1059`).
- The approval command center already centralizes replies, brand memory, workflow checkpoints, and agent policy approvals (`lib/approvals/command-center.ts:147-357`).
- Publishing, recovery, retry, worker health, and provider health are already modeled (`lib/scheduler/publish-recovery.ts:42-100`, `lib/scheduler/publish-retry.ts:41-234`, `lib/scheduler/worker-health.ts:331-388`, `lib/providers/health.ts:83-193`).
- Analytics already aggregates agent activity, posts, failures, replies, usage, and platform data (`lib/analytics/metrics.ts:454-489`, `lib/analytics/metrics.ts:657-827`, `app/(dashboard)/analytics/page.tsx:49-147`).

The winning sequence is therefore governance first, autonomy later. Build the surfaces that make agents inspectable, measurable, recoverable, and approval-aware. Defer open-ended MCP/A2A integrations, browser-login provider automation, live metrics sync, marketplaces, and fully autonomous publishing until the governed core is demonstrably useful and safe.

## Strategic Diagnosis

### Product Today

The current product combines AI-assisted content creation, provider connections, scheduling, approvals, agent missions, simulations, billing/entitlements, brand memory, analytics, and n8n events. Evidence points to a serious multi-tenant SaaS architecture rather than a prototype:

- The dependency manifest includes Next 16, React 19, LangChain, LangGraph, OpenAI/Gemini adapters, Drizzle, BullMQ, Clerk, Zod, Playwright, and Vitest (`package.json:19-35`, `package.json:41-56`).
- Operational scripts exist for development, workers, linting, type-checking, tests, e2e, and Drizzle migrations (`package.json:5-17`).
- Billing and usage controls are present but activation is still partly disabled by environment flags (`lib/billing/entitlements.ts:29-57`, `lib/billing/usage.ts:379-414`, `app/(dashboard)/billing/page.tsx:35-52`, `app/api/billing/checkout/route.ts:6-7`, `app/api/billing/portal/route.ts:6-7`).
- LinkedIn has live provider depth while other providers remain scaffold or setup-gated (`lib/providers/linkedin.ts:877-1107`, `lib/providers/skeleton.ts:30-55`, `app/api/connections/[provider]/connect/route.ts:151-152`).

### Existing Agent Architecture

The strongest existing architecture is the governed agent control plane:

- `content-agent` builds content via tools, brand context, variants, policy checks, and approvals (`lib/agents/langchain/content-agent.ts:93-200`).
- `comment-agent` classifies and drafts replies with explicit approval and safety boundaries (`lib/agents/langchain/comment-agent.ts:203-343`, `lib/agents/langchain/comment-agent.ts:245-312`).
- `content-workflow` provides checkpointed generation and review/resume behavior (`lib/agents/graphs/content-workflow.ts:431-451`, `lib/agents/graphs/content-workflow.ts:490-568`, `lib/agents/graphs/content-workflow.ts:600-733`).
- `comment-reply-workflow` escalates uncertain or unsafe replies into human review (`lib/agents/graphs/comment-reply-workflow.ts:243-278`, `lib/agents/graphs/comment-reply-workflow.ts:386-434`).
- The agents console already exposes mission presets, simulation summaries, budget/policy signals, lifecycle actions, and governance export entry points (`components/agents/agents-console.tsx:73-102`, `components/agents/agents-console.tsx:268-296`, `components/agents/agents-console.tsx:429-583`, `components/agents/agents-console.tsx:931-1032`).

### Core Gap

The repo already executes and audits agent-like work, but it does not yet package that work into the premium surfaces users will pay for:

- "What exactly happened?" is spread across mission details, task runs, policy events, simulations, n8n events, and exports rather than one timeline (`lib/agents/orchestration/audit.ts:61-123`, `components/agents/agents-console.tsx:1081-1236`).
- "Can I trust this agent?" has raw events and analytics, but not scorecards or eval-style summaries (`lib/analytics/metrics.ts:442-489`, `components/analytics/agent-run-table.tsx:37-85`).
- "What should I do next?" is partly available in weekly reports and analytics, but not a unified, approval-aware recommendation engine (`lib/agents/orchestration/executors.ts:981-1059`, `lib/analytics/metrics.ts:827-870`).
- "Why did publishing fail and what is safe to retry?" has recovery machinery but needs a user-facing reasoning and routing layer (`lib/scheduler/publish-recovery.ts:42-100`, `lib/scheduler/publish-retry.ts:73-124`).

## 2026 Trend Radar

The 2026 market direction favors durable, governed, inspectable, tool-using agents. The trend is useful here only when translated into this product's approval and provider constraints.

| Trend | Current Source | Product Implication |
|---|---|---|
| Product-owned agent orchestration | OpenAI Agents SDK docs, accessed 2026-06-24, https://developers.openai.com/api/docs/guides/agents | Keep extending the repo-owned orchestration layer instead of outsourcing workflows to an opaque agent runtime. Existing anchors: `lib/agents/orchestration/runner.ts:181-529`, `lib/agents/governance-export.ts:65-159`. |
| Safety, approvals, guardrails, evals | OpenAI agent safety docs, accessed 2026-06-24, https://developers.openai.com/api/docs/guides/agent-builder-safety | Add scorecards, evidence, and approval-aware recommendations before increasing autonomy. Existing anchor: `lib/approvals/command-center.ts:147-357`. |
| Computer/browser use | OpenAI computer use docs, accessed 2026-06-24, https://developers.openai.com/api/docs/guides/tools-computer-use | Useful for internal QA and preview inspection, not provider login workarounds. Provider spec says official APIs/no scraping (`docs/archive/specs/06-provider-integrations.md:56`). |
| Sandbox agents and resumable sessions | OpenAI, "The next evolution of the Agents SDK", 2026-04-15, https://openai.com/index/the-next-evolution-of-the-agents-sdk/ | Prioritize session timelines, snapshots, and branchable simulations over hidden long-running autonomy. |
| Durable execution | Vercel, "A new programming model for durable execution", 2026-04-16, https://vercel.com/blog/a-new-programming-model-for-durable-execution | The repo already has BullMQ, checkpoints, retries, and worker health; improve observability and recovery before adopting another workflow runtime (`workers/social-worker.ts:77-156`, `lib/scheduler/worker-health.ts:331-388`). |
| Agent stack and multi-model routing | Vercel, "The Agent Stack", 2026-06-17, https://vercel.com/blog/agent-stack | Model routing belongs behind policy, usage estimates, and billing controls, not scattered prompts (`lib/agents/orchestration/policy.ts:259-270`, `lib/billing/usage.ts:136-170`). |
| AGENTS.md and instruction contracts | Vercel, "AGENTS.md outperforms skills in our agent evals", 2026-01-27, https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals | Productize workspace instruction packs that summarize brand memory, policy, provider constraints, and approval rules. |
| MCP governance | Google Cloud, "50+ fully managed MCP servers now available for Google Cloud services", 2026-04-28, https://cloud.google.com/blog/products/ai-machine-learning/google-managed-mcp-servers-are-available-for-everyone | If MCP appears later, it should be registry-governed and approval-routed. Do not expose arbitrary tools to missions. |
| Distributed agent runtimes | Google Cloud, "Introducing Agent Executor", 2026-05-20, https://cloud.google.com/blog/products/ai-machine-learning/agent-executor-googles-distributed-agent-runtime | Reinforces the need for pause/resume, isolation, timelines, and branch comparison. Existing anchor: `lib/agents/orchestration/simulation.ts:505-652`. |
| Agent protocols | Google Developers Blog, "Developer's Guide to AI Agent Protocols", 2026-03-18, https://developers.googleblog.com/developers-guide-to-ai-agent-protocols/ | A2A/MCP/AP2/A2UI are strategic watch items, not immediate build targets, until provider and billing surfaces are more mature. |
| Containment and prompt-injection risk | Anthropic, "How we contain Claude across products", 2026-05-25, https://www.anthropic.com/engineering/how-we-contain-claude | External sources, tool calls, and provider actions must be contained and approval-bound. Existing approval paths are a strength. |
| Managed-agent harnesses | Anthropic, "Scaling Managed Agents", accessed 2026-06-24, https://www.anthropic.com/engineering/managed-agents | A harness-style evaluation mindset maps well to agent scorecards and session inspection. |
| Self-review and traceability | GitHub, "What's new with GitHub Copilot coding agent", 2026-02-26, https://github.blog/ai-and-ml/github-copilot/whats-new-with-github-copilot-coding-agent/ | Add agent self-review/checklist output, but present it as evidence for humans, not as a substitute for approvals. |
| Session log provenance | GitHub Changelog, "Trace any Copilot coding agent commit to its session logs", 2026-03-20, https://github.blog/changelog/2026-03-20-trace-any-copilot-coding-agent-commit-to-its-session-logs/ | Roadmap should make each mission traceable from final output back to events, tools, approvals, and policy decisions. |

## Reconciliation Of The Four Research Inputs

### Recurring Themes

| Theme | Appears In | Synthesis Decision |
|---|---|---|
| Governed autonomy beats raw autonomy | Repo intelligence, trends, ideation, feasibility | Make timelines, exports, scorecards, approvals, and safe retries the roadmap spine. |
| Existing primitives are under-packaged | Repo intelligence, ideation, feasibility | Favor features that reuse `agentRuns`, `agentTaskRuns`, `agentPolicyEvents`, `workflowCheckpoints`, provider health, retry, and analytics rows. |
| Provider risk is the main external-action constraint | Repo intelligence, feasibility | Provider expansion should start as readiness/recovery UX; do not promise live metrics or unofficial automation. |
| Evaluations and explainability are missing product layers | Trends, ideation, feasibility | Add deterministic scorecards first, then model-assisted judgments only with evidence and tests. |
| Human approvals are a differentiator | All four inputs | Every premium feature should improve approval ergonomics rather than route around them. |
| Simulations can become a premium planning surface | Repo intelligence, ideation, feasibility | Branch compare is a major bet after timeline and scorecards. |

### Conflicts And Decisions

1. Trend sources favor computer use, MCP, A2A, and distributed agents, but this repo's provider and approval constraints make open-ended external actions too risky. Decision: defer arbitrary MCP/A2A and browser-login automation; use official providers and approval gates (`docs/archive/specs/06-provider-integrations.md:56`, `lib/agents/orchestration/policy.ts:303-311`).

2. Ideation included Provider Metrics Sync Agent, but feasibility found no durable live metrics ingestion model. Decision: do not build live metrics sync yet; build provider readiness and recovery first (`lib/providers/types.ts:12-13`, `lib/agents/orchestration/executors.ts:988`).

3. Ideation included Agent Marketplace Readiness Scanner, but templates and repeatable missions are not stable enough. Decision: defer marketplace; first ship instruction packs, scorecards, and timeline evidence (`lib/agents/orchestration/role-templates.ts:16-205`).

4. Trend sources suggest adopting new durable workflow runtimes, but the repo already has LangGraph, BullMQ, Drizzle persistence, checkpointing, and worker health. Decision: improve inspection/recovery on the current stack before introducing another runtime (`lib/agents/graphs/content-workflow.ts:490-568`, `workers/social-worker.ts:77-156`).

5. Older docs and archived specs conflict with moved paths and current implementation. Decision: treat live code, current master plan, and archived specs as evidence with caveats; source-code citations should outrank stale docs (`docs/README.md:7-36`, `docs/MASTER_PLAN_v2.md:170-185`).

## Ranked Recommendations

Scoring: 1 is low, 5 is high. Effort and risk are scored inversely in the total: lower effort/risk improves priority. Strategic fit is weighted heavily because the roadmap should reinforce the product's governed-agent position.

| Rank | Feature | Impact | Confidence | Effort | Risk | Strategic Fit | Priority Rationale |
|---:|---|---:|---:|---:|---:|---:|---|
| 1 | Agent Session Timeline Inspector | 5 | 5 | 3 | 1 | 5 | Makes existing agent work understandable and improves every later governance feature. |
| 2 | Governance Export Narrative Brief | 5 | 5 | 2 | 1 | 5 | High executive/compliance value from an existing redacted export path. |
| 3 | Provider Readiness Recovery Agent | 5 | 4 | 2 | 2 | 5 | Converts existing health/retry logic into practical user value without unsafe auto-publishing. |
| 4 | Agent Quality Scorecards | 5 | 4 | 3 | 1 | 5 | Creates the trust/eval layer that 2026 agent products need. |
| 5 | Analytics Next-Best-Action Agent | 5 | 4 | 3 | 2 | 5 | Turns analytics and health signals into guided action while preserving approvals. |
| 6 | Approval SLA And Reminder Agent | 4 | 4 | 2 | 1 | 4 | Low-risk workflow hygiene that reduces stalled approvals. |
| 7 | Safe Social Post Visual QA Agent | 4 | 4 | 2 | 1 | 4 | Improves content approval quality with deterministic platform/media checks. |
| 8 | Workspace Agent Instruction Packs | 4 | 4 | 3 | 2 | 5 | Makes agent behavior consistent and auditable before deeper memory/research features. |
| 9 | Simulation Branch Compare | 5 | 4 | 4 | 2 | 5 | Strong premium planning surface, best after timeline/scorecards exist. |
| 10 | Brand Voice Memory Curator 2.0 | 5 | 4 | 4 | 2 | 5 | Meaningful memory moat, but touches brand behavior and needs careful review paths. |

## Recommendation 1: Agent Session Timeline Inspector

### User Story

As a marketing operator or founder, I want to inspect exactly what an agent mission did, decided, skipped, simulated, approved, paused, retried, and handed off, so I can trust its output and explain it to clients or teammates.

### Why Now

The repo already has the data and UI surface, but not a single chronology. This is the lowest-risk way to make agent value visible. It aligns with 2026 traceability trends from OpenAI sandbox/resumable sessions (2026-04-15, https://openai.com/index/the-next-evolution-of-the-agents-sdk/), Vercel durable execution (2026-04-16, https://vercel.com/blog/a-new-programming-model-for-durable-execution), and GitHub session-log provenance (2026-03-20, https://github.blog/changelog/2026-03-20-trace-any-copilot-coding-agent-commit-to-its-session-logs/).

### Agent Architecture

- Aggregate mission, task run, policy event, simulation, n8n event, workflow checkpoint, approval, and provider/publish events into a normalized timeline DTO.
- Use existing audit query patterns as the first anchor (`lib/agents/orchestration/audit.ts:61-123`).
- Keep timeline generation deterministic; no model call is needed for MVP.
- Add optional derived labels such as `decision`, `approval`, `tool`, `simulation`, `publish`, `policy`, `n8n`, and `recovery`.

### UX Flow

1. User opens an agent mission in the existing console.
2. Mission detail shows a compact chronology with filters for significant events, approvals, policy blocks, simulations, and external actions.
3. Each event expands to show evidence: timestamp, actor, source table/type, linked entity, safe summary, and next available action.
4. Paused or blocked missions show why they stopped and what action can resume or resolve them.

The UI should extend the current mission detail area rather than create a separate app section (`components/agents/agents-console.tsx:1081-1236`).

### Backend And Data Changes

- Add a timeline query helper near existing orchestration audit code.
- Reuse existing rows: `agentRuns`, `agentTaskRuns`, `agentPolicyEvents`, `agentMissionSimulations`, `n8nEvents`, `workflowCheckpoints`, publish attempts, reply attempts, and brand-memory proposals (`db/schema.ts:331`, `db/schema.ts:707`, `db/schema.ts:816`, `db/schema.ts:864`, `db/schema.ts:907`, `db/schema.ts:944`, `db/schema.ts:533`, `db/schema.ts:632`, `db/schema.ts:674`).
- Add no new table in MVP unless current audit data lacks stable timestamps or event types.
- Add an API route only if current mission detail fetching cannot include the timeline without overfetching.

### Integrations

- Existing agents console mission APIs and action handlers (`components/agents/agents-console.tsx:429-583`).
- Governance export can later include the timeline summary (`lib/agents/governance-export.ts:65-159`).
- n8n events are included as external automation timeline entries (`lib/n8n/event-log.ts:50-163`).

### Guardrails And Approval Model

- Read-only surface.
- Redact payload fields using the same philosophy as governance export (`lib/agents/governance-export.ts:19-31`).
- Do not expose raw tokens, provider credentials, webhook secrets, or raw model prompts.
- External actions should be visually distinct from internal analysis.

### Observability And Evals

- Track whether timeline queries return complete, partial, or empty results.
- Add counts by event type and missing-linked-entity warnings.
- Use this feature as a future input to scorecards.

### Tests

- Unit test timeline ordering, event normalization, redaction, and missing-entity behavior.
- Component test mission detail filtering and empty states.
- API test workspace scoping if a new route is added.
- Regression test that external-action events are labeled and never hidden by default.

### Goals

- One mission-level chronology for every mission type.
- Operators can answer "what happened?" without reading raw database rows.
- Later features can cite timeline event IDs as evidence.

### Non-Goals

- No model-generated narrative in MVP.
- No new agent autonomy.
- No provider retry or schedule actions triggered from timeline rows without existing approval/control paths.

### Success Metrics

- 90 percent or more of mission detail pages render at least one timeline event for non-empty missions.
- Median timeline query time stays under the existing mission detail page performance budget.
- Support/debug workflows require fewer raw database/code inspections for agent mission questions.
- User-facing blocked/paused mission explanations become explicit rather than implicit.

### Acceptance Criteria

- Timeline renders in the existing agents console mission detail.
- Events are ordered, typed, filterable, and evidence-backed.
- Sensitive fields are redacted.
- Empty and partial states are clear.
- Tests cover ordering, redaction, workspace scoping, and UI filters.

### First Implementation Tasks

1. Define a normalized timeline event type.
   - Candidate file: `lib/agents/orchestration/timeline.ts`.
   - Fields: `id`, `missionId`, `kind`, `occurredAt`, `title`, `summary`, `source`, `sourceId`, `severity`, `status`, `actor`, `metadata`, `redactionState`.
   - Verify with TypeScript type-check and unit tests.

2. Build the deterministic timeline query.
   - Start from `lib/agents/orchestration/audit.ts:61-123`.
   - Join or batch-load mission run, task run, policy event, simulation, n8n event, workflow checkpoint, publish/reply attempt, and brand-memory proposal sources.
   - Verify stable ordering with fixture rows in Vitest.

3. Add redaction and evidence labels.
   - Reuse export redaction assumptions from `lib/agents/governance-export.ts:19-31`.
   - Mark external events from provider/publish/n8n sources.
   - Verify token-like and secret-like strings are not returned.

4. Wire the timeline into mission detail.
   - Extend the current console mission detail area (`components/agents/agents-console.tsx:1081-1236`).
   - Use compact filters and expandable rows.
   - Verify no layout shift on desktop and mobile.

5. Add tests and docs.
   - Unit: `tests/agents/orchestration.test.ts` or a dedicated timeline test.
   - UI: component-level test if current test setup supports it.
   - Docs: update agent console or roadmap implementation note only after code is complete.

## Recommendation 2: Governance Export Narrative Brief

### User Story

As a team lead or agency operator, I want a concise narrative brief from my governance export so I can show what agents did, what was approved, what was blocked, and what requires follow-up.

### Why Now

The export already gathers a rich payload and redacts sensitive values (`lib/agents/governance-export.ts:19-31`, `lib/agents/governance-export.ts:65-159`). Turning that into deterministic Markdown creates immediate executive value without new autonomy.

### Agent Architecture

- MVP is deterministic template generation from the existing redacted export payload.
- Later versions can optionally offer model-assisted summaries, but only from the redacted payload and with clear "generated summary" labeling.

### UX Flow

1. User opens the agents console governance export.
2. User chooses JSON, Markdown brief, or both.
3. Brief contains executive summary, activity counts, approval status, policy events, simulations, provider/n8n events, and open follow-ups.

### Backend And Data Changes

- Add a Markdown/narrative formatter beside `lib/agents/governance-export.ts`.
- No schema changes in MVP.
- Include generation date and export scope.

### Integrations

- Existing `app/api/agents/governance-export/route.ts:12-53`.
- Existing console export action (`components/agents/agents-console.tsx:520-583`).

### Guardrails And Approval Model

- Generate only from redacted payload.
- Include a test fixture with token-like values.
- Never summarize unredacted raw provider payloads.

### Observability And Evals

- Track export format requested and payload section counts.
- Add deterministic tests for redaction and section inclusion.

### Success Metrics

- Users can produce a readable governance brief without manually interpreting JSON.
- Briefs include all high-risk events and pending approvals.

### Acceptance Criteria

- Markdown export is available.
- Sensitive fields remain redacted.
- Brief includes mission activity, approvals, policy events, simulations, provider/n8n events, usage/billing summary, and open follow-ups.

## Recommendation 3: Provider Readiness Recovery Agent

### User Story

As an operator, I want clear recovery guidance when publishing fails or a provider is not ready, so I can safely fix the issue without duplicate posts or unsafe retries.

### Why Now

Provider health, retry classification, worker health, retry reservation, and calendar retry UI exist (`lib/providers/health.ts:83-193`, `lib/scheduler/publish-recovery.ts:42-100`, `lib/scheduler/publish-retry.ts:41-234`, `lib/scheduler/worker-health.ts:121-139`, `components/calendar/publish-retry-button.tsx:36-78`). The missing product layer is explanation and routing.

### Agent Architecture

- Deterministic recovery classifier first.
- Model assistance only for wording, never for deciding whether to retry.
- Use provider capability and health outputs as evidence (`lib/providers/capabilities.ts:42-70`, `lib/providers/connections.ts:325-378`).

### UX Flow

1. User sees a failed or blocked publish attempt.
2. UI shows reason, provider readiness, whether retry is safe, and required fixes.
3. Existing retry action remains guarded by current retry logic.

### Backend And Data Changes

- Add a recovery recommendation DTO.
- Reuse publish attempt and provider connection data (`db/schema.ts:533`, `db/schema.ts:435`).
- No external API calls beyond existing provider health checks in MVP.

### Guardrails And Approval Model

- Never bypass `retryScheduledPublish` guards (`lib/scheduler/publish-retry.ts:73-124`).
- Never retry successful attempts.
- Distinguish "safe retry", "manual reconnect", "provider unsupported", and "wait/backoff".

### Tests

- Unit tests for each recovery category.
- API/UI tests proving unsupported providers do not trigger live calls.
- Regression tests for duplicate-publish prevention.

## Recommendation 4: Agent Quality Scorecards

### User Story

As a workspace owner, I want scorecards for agent runs and missions so I can know whether agents are reliable, approval-safe, cost-aware, and useful.

### Why Now

OpenAI and Anthropic both emphasize safety, evals, and containment for agent systems (OpenAI safety docs, accessed 2026-06-24, https://developers.openai.com/api/docs/guides/agent-builder-safety; Anthropic containment, 2026-05-25, https://www.anthropic.com/engineering/how-we-contain-claude). The repo has raw data but lacks a trust summary (`lib/analytics/metrics.ts:442-489`, `components/analytics/agent-run-table.tsx:37-85`).

### Agent Architecture

- Deterministic scorecards first: completion, approval friction, policy blocks, retries, cost estimate, and human edits.
- Later optional model grading must cite evidence and be reviewable.

### UX Flow

1. Analytics and mission detail show a scorecard.
2. User can expand each score into evidence rows.
3. Low scores link to timeline, approvals, provider recovery, or usage/billing detail.

### Backend And Data Changes

- Add an analytics helper that consumes `agentRuns`, `agentTaskRuns`, `agentPolicyEvents`, `workflowCheckpoints`, `publishAttempts`, `replyAttempts`, and usage ledger rows (`db/schema.ts:331`, `db/schema.ts:816`, `db/schema.ts:864`, `db/schema.ts:707`, `db/schema.ts:533`, `db/schema.ts:632`, `db/schema.ts:243`).
- No schema changes required for MVP unless storing snapshots becomes necessary.

### Guardrails And Approval Model

- Display sample size and evidence.
- Avoid opaque composite scores unless all inputs are visible.
- Do not use scorecards to auto-approve external actions.

### Tests

- Unit tests for scoring formulas and edge cases.
- Snapshot tests for empty/sparse workspaces.
- Regression tests for workspace scoping.

## Recommendation 5: Analytics Next-Best-Action Agent

### User Story

As an operator, I want the app to tell me the safest next action for improving content operations, publishing reliability, and approval throughput.

### Why Now

The repo already has analytics, worker health, provider health, usage/billing, approvals, and weekly report logic (`lib/analytics/metrics.ts:827-870`, `lib/scheduler/worker-health.ts:331-388`, `lib/providers/health.ts:83-193`, `lib/billing/usage.ts:379-414`, `lib/approvals/command-center.ts:317-357`, `lib/agents/orchestration/executors.ts:981-1059`).

### Agent Architecture

- Rules-first recommendation engine.
- Each recommendation has source metrics, reason, confidence, risk, and allowed action.
- Model wording optional after deterministic ranking.

### UX Flow

1. Analytics page shows a prioritized recommendation queue.
2. Each item explains why it matters and links to an existing action surface.
3. Actions that can publish, retry, schedule, or reply still require existing approval/command flows.

### Backend And Data Changes

- Add recommendation records or computed DTOs.
- Reuse existing metrics rather than duplicate analytics queries.
- Consider persistence only after recommendation dismissal/history becomes important.

### Guardrails And Approval Model

- Recommendations are advisory by default.
- Any side-effect action routes through existing API guards and approval paths.
- Include "dismiss" and "not relevant" feedback before automated follow-up.

### Tests

- Unit tests for recommendation priority.
- API tests for workspace scoping.
- UI tests for action links and disabled states.

## Recommendation 6: Approval SLA And Reminder Agent

### User Story

As an operator, I want stalled approvals surfaced and optionally reminded so content, replies, and brand-memory updates do not sit idle.

### Why Now

The approval command center already calculates pending items and ages; n8n signed events can support external reminder workflows later (`lib/approvals/command-center.ts:114-133`, `lib/approvals/command-center.ts:317-357`, `lib/n8n/events.ts:9-26`, `lib/n8n/client.ts:57-147`).

### Agent Architecture

- Deterministic SLA classification.
- MVP: badges and manual reminder event.
- Later: configurable reminder automation with dedupe.

### UX Flow

1. Approval center shows overdue/pending status by type.
2. User can filter by overdue, high risk, and action owner.
3. User can send a manual reminder or create an n8n event if configured.

### Backend And Data Changes

- Add SLA thresholds, probably workspace-configurable later.
- Add reminder event logging if reminders become actions.

### Guardrails And Approval Model

- No auto-spam.
- Dedupe reminders.
- Require explicit workspace setting before automatic outbound reminders.

### Tests

- Unit tests for age/SLA classification.
- Integration tests for n8n event generation if added.

## Recommendation 7: Safe Social Post Visual QA Agent

### User Story

As a content reviewer, I want deterministic visual/platform QA before approval so I can catch missing media, invalid aspect ratios, caption issues, or platform constraint conflicts.

### Why Now

Media assets, platform variants, provider constraints, and platform policy checks already exist (`db/schema.ts:292`, `db/schema.ts:400`, `lib/providers/types.ts:140-151`, `lib/agents/tools/check-platform-policy.ts`, `tests/agents/tools.test.ts:76-125`).

### Agent Architecture

- Metadata-first QA in MVP.
- Optional screenshot/browser QA later for internal previews, not provider login automation.

### UX Flow

1. Review step displays platform/media QA badges.
2. Issues link to the exact variant or asset.
3. Warnings do not block approval unless policy/config marks them blocking.

### Backend And Data Changes

- Add a QA helper that checks platform variant content, media count, media type, aspect ratio metadata, and caption constraints.
- No new table required unless storing historical QA snapshots.

### Guardrails And Approval Model

- QA does not publish.
- Do not fetch provider private pages.
- Make confidence and deterministic basis visible.

### Tests

- Unit tests for platform/media constraints.
- UI tests on review step warnings.

## Recommendation 8: Workspace Agent Instruction Packs

### User Story

As a workspace owner, I want a generated instruction pack that captures brand voice, approval rules, provider capabilities, and policy constraints so every agent behaves consistently.

### Why Now

AGENTS.md-style instruction contracts are gaining evidence in agent workflows (Vercel, 2026-01-27, https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals). The repo has brand memory, profiles, policies, providers, and billing context (`lib/brand-memory/proposals.ts:600-611`, `db/schema.ts:746`, `lib/providers/connections.ts:325-378`, `lib/billing/usage.ts:379-414`).

### Agent Architecture

- Generate a source-cited packet from workspace data.
- Preview-only first.
- Activation/injection into agent runs requires tests for freshness, conflicts, and approval.

### UX Flow

1. User opens workspace agent settings.
2. App shows an instruction pack with source citations and generated-at timestamp.
3. User can approve it for future missions after reviewing conflicts.

### Backend And Data Changes

- Add instruction-pack builder.
- Store approved pack later if activation requires durable versioning.

### Guardrails And Approval Model

- Human approval before activation.
- Include source freshness and conflicts.
- Never silently override existing mission/profile instructions.

### Tests

- Unit tests for packet generation.
- Conflict tests for contradictory brand memory/policy/provider constraints.

## Recommendation 9: Simulation Branch Compare

### User Story

As a strategist, I want to compare simulated campaign branches so I can choose a safe, high-value plan before generating or scheduling content.

### Why Now

Simulation is already side-effect-suppressed and persisted (`lib/agents/orchestration/simulation.ts:505-652`, `tests/agents/orchestration.test.ts:1452-1473`). Branch comparison turns that infrastructure into a premium planning surface.

### Agent Architecture

- Run multiple simulation inputs/policy configurations without external side effects.
- Compare expected content volume, approval load, provider readiness, risk, budget estimate, and timeline.
- Later connect to scorecards.

### UX Flow

1. User creates 2-3 campaign branches.
2. App simulates each branch.
3. User compares risk, cost, approval burden, and expected output.
4. User chooses one branch to convert into a mission or draft plan.

### Backend And Data Changes

- Add branch metadata to simulations or a related comparison DTO.
- Persist enough branch inputs for reproducibility.

### Guardrails And Approval Model

- Simulation remains side-effect-suppressed.
- Conversion to real mission requires explicit confirmation and normal approvals.

### Tests

- Simulation side-effect tests.
- Branch ordering and comparison tests.
- UI tests for branch selection and conversion.

## Recommendation 10: Brand Voice Memory Curator 2.0

### User Story

As a brand owner, I want the system to detect repeated voice patterns, contradictions, stale guidance, and high-confidence memory candidates so my brand memory improves safely over time.

### Why Now

Brand memory proposal, review, and apply loops already exist (`lib/brand-memory/proposals.ts:240-302`, `lib/brand-memory/proposals.ts:385-479`, `lib/brand-memory/proposals.ts:572-611`, `components/brand-memory/brand-memory-workbench.tsx:65-399`). The next step is better curation, not automatic memory mutation.

### Agent Architecture

- Deterministic clustering/conflict detection first.
- Model-generated summaries only as proposals.
- All changes remain review/apply based.

### UX Flow

1. Workbench shows clusters: repeated voice pattern, contradiction, stale rule, missing example, high-confidence candidate.
2. User reviews evidence and applies or rejects.
3. Applied memory updates include source and rationale.

### Backend And Data Changes

- Extend proposal generation with conflict and cluster metadata.
- Consider storing source/evidence IDs if not already sufficient.

### Guardrails And Approval Model

- Never auto-apply memory.
- Show evidence snippets and affected future behavior.
- Detect contradictions before activation.

### Tests

- Unit tests for conflict detection and clustering.
- Apply/reject workflow tests.
- Regression tests for source attribution.

## Features To Research Later

### Provider Metrics Sync Agent

Do not build live metrics sync yet. The provider types mention metrics/replies, but production-ready ingestion and storage are not evidenced (`lib/providers/types.ts:12-13`, `lib/providers/linkedin.ts:1037-1116`, `lib/agents/orchestration/executors.ts:988`). Research provider API scopes, rate limits, terms, data model, and freshness strategy first.

### Agent Marketplace Readiness Scanner

Do not build yet. Templates and role profiles exist, but marketplace readiness is premature until mission workflows, scorecards, timelines, and repeatable packs are stable (`lib/agents/orchestration/role-templates.ts:16-205`).

### Fully Autonomous Social Publishing

Avoid as a near-term direction. Existing specs and policy code require review and fail-closed external-action behavior (`docs/archive/specs/04-langchain-agent-system.md:59-62`, `lib/agents/orchestration/policy.ts:303-311`, `app/api/posts/[id]/schedule/route.ts:164-311`).

### Browser-Login Provider Automation

Avoid. The provider integration spec says official APIs and no scraping/login automation that violates provider terms (`docs/archive/specs/06-provider-integrations.md:56`). Computer/browser use can be researched for internal QA, not provider workarounds.

### Open-Ended MCP/A2A Tooling

Research only after the internal control plane can register, scope, approve, audit, and revoke tool access. Trend sources support MCP/A2A direction, but current product value is higher in governed first-party features.

## Build Sequence

### Phase 1: Trust And Traceability

1. Agent Session Timeline Inspector
2. Governance Export Narrative Brief
3. Agent Quality Scorecards

Why: users need to see what agents did, export it, and evaluate it before they are asked to trust stronger recommendations.

### Phase 2: Recovery And Recommendations

4. Provider Readiness Recovery Agent
5. Analytics Next-Best-Action Agent
6. Approval SLA And Reminder Agent

Why: once actions are traceable and scoreable, the product can safely recommend operational improvements and route users to existing guarded actions.

### Phase 3: Better Review Inputs

7. Safe Social Post Visual QA Agent
8. Workspace Agent Instruction Packs

Why: improve the inputs and constraints agents use before expanding mission complexity.

### Phase 4: Premium Planning And Memory

9. Simulation Branch Compare
10. Brand Voice Memory Curator 2.0

Why: branchable simulations and curated memory deepen product differentiation after the governance layer is credible.

## Implementation Principles

- Use existing data first. Prefer computed DTOs over schema changes until persistence is clearly needed.
- Keep model calls out of MVPs when deterministic evidence is enough.
- Make every recommendation cite source data.
- Preserve human approvals for publishing, replies, scheduling, provider actions, and memory changes.
- Treat provider gaps as product states, not hidden failures.
- Avoid adding new workflow/runtime vendors until current LangGraph/BullMQ/Drizzle surfaces are easier to inspect and recover.
- Add tests at the boundary where a feature could hide an external action, leak data, or mis-score trust.

## Self-Check

- Repo claims in this roadmap are tied to file paths and line numbers from the inspected codebase.
- Current AI-agent trend claims cite primary/vendor sources with dates or accessed dates.
- The recommendation order reconciles the four research documents and follows the feasibility ranking.
- The roadmap avoids code changes and only refers to the named Markdown deliverables.
- Unverified or not-yet-evidenced capabilities are explicitly marked as research-later or do-not-build-yet.

## Open Questions For Future Implementation

- Should timeline events be persisted as snapshots or computed from source rows on demand?
- What workspace setting should define "overdue" for each approval type?
- Should scorecards be stored per run for historical comparison or recomputed from immutable event rows?
- Which provider should be the second fully live provider after LinkedIn, and what official scopes are required?
- When instruction packs become active, how should conflicts between brand memory, mission profile, and platform policy be resolved?
