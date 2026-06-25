> Archived 2026-06-24. Superseded by docs/MASTER_PLAN.md.

# AI-Agent Feature Roadmap 2026

Created: 2026-06-23

Purpose: preserve the synthesized AI-agent roadmap so future work can resume from this artifact instead of rerunning the full diagnostic, research, feature-ideation, and feasibility workflow.

This document is a planning artifact, not an implementation diff. Before implementing any item, verify the live repo state, active branch, provider readiness, and open PRs.

## Current Repo Snapshot

- Repo: Automated-Content
- Verified branch snapshot when this plan was created: `main`
- Verified head/origin snapshot when this plan was created: `9448c84a1f3a11328f6b75e98fc8d83783018cc8`
- Product identity: governed social-content operations SaaS with AI-assisted generation, platform variants, media, approval checkpoints, scheduling/publishing, keyword auto-replies, analytics, billing/usage limits, provider connections, n8n events, and supervised autonomous-agent control plane.
- Current provider truth: `linkedin` is implemented as `implementationStatus: "live"` in `lib/providers/linkedin.ts`; `mock` is preview/test; Meta, X, Slack, and Discord remain scaffold/stub providers through `lib/providers/skeleton.ts`.
- Largest roadmap constraint: provider readiness plus production worker/Redis posture.
- Strongest product advantage: the repo already assumes external social actions are risky and routes them through approval, policy, audit, provider, billing, and worker boundaries.

## Source Inputs

This roadmap synthesized four transfer capsules:

- Repo intelligence capsule covering product identity, existing agent/automation capabilities, repo paths, gaps, extension points, risks, and open questions.
- 2026 AI-agent trend research capsule covering orchestration, subagents, memory, tool use, MCP/A2A, approvals, tracing/evals, background agents, governance, and cost controls.
- Feature ideation capsule covering ranked feature ideas and paid product value.
- Feasibility/risk capsule covering quick wins, major bets, required foundations, risk warnings, and implementation sequence.

Primary repo anchors:

- `docs/specs/00-product-prd.md`
- `docs/specs/01-architecture.md`
- `docs/specs/04-langchain-agent-system.md`
- `docs/specs/05-langgraph-workflows.md`
- `docs/specs/06-provider-integrations.md`
- `docs/specs/07-billing-usage.md`
- `docs/worker-runtime-readiness.md`
- `docs/ai-agent-feature-master-update-plan.md`
- `docs/next-feature-plans/README.md`
- `db/schema.ts`
- `lib/agents/langchain/*`
- `lib/agents/graphs/*`
- `lib/agents/orchestration/*`
- `lib/providers/*`
- `lib/scheduler/*`
- `lib/replies/*`
- `lib/billing/*`
- `lib/brand-memory/*`
- `lib/analytics/*`
- `lib/n8n/*`
- `workers/*`
- `components/agents/agents-console.tsx`
- `app/(dashboard)/agents/page.tsx`
- `app/api/agents/*`

Primary external sources from the trend capsule:

- Anthropic, Building Effective Agents: https://www.anthropic.com/engineering/building-effective-agents
- OpenAI Agents SDK: https://openai.github.io/openai-agents-python/
- LangGraph overview: https://docs.langchain.com/oss/python/langgraph/overview
- LangGraph persistence: https://docs.langchain.com/oss/javascript/langgraph/persistence
- LangGraph human-in-the-loop: https://docs.langchain.com/oss/javascript/langgraph/human-in-the-loop
- OpenAI tools for agents: https://openai.com/index/new-tools-for-building-agents/
- OpenAI AgentKit: https://openai.com/index/introducing-agentkit/
- OpenAI tracing: https://openai.github.io/openai-agents-python/tracing/
- LangSmith: https://docs.smith.langchain.com/
- MCP spec 2025-06-18: https://modelcontextprotocol.io/specification/2025-06-18
- A2A project: https://github.com/a2aproject/A2A
- GitHub Copilot cloud agent: https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent
- OpenAI Codex: https://openai.com/index/introducing-codex/
- Jules: https://jules.google/
- OpenAI enterprise compliance: https://help.openai.com/en/articles/9261474-openai-compliance-platform-for-enterprise-and-edu-customers
- OpenAI spend controls: https://openai.com/index/chatgpt-enterprise-spend-controls/
- Vercel AI SDK: https://ai-sdk.dev/docs/introduction
- Vercel AI Gateway: https://vercel.com/docs/ai-gateway

## 1. Strategic Diagnosis

Automated-Content is already a governed agent product, not a blank content-generation app. It has structured LangChain agents, LangGraph-style checkpoints, mission orchestration, policy events, simulations, durable scheduling, provider adapters, usage accounting, brand-memory proposals, reply automation, worker queues, analytics, n8n events, and governance export surfaces.

The product is strongest where many agent products are weakest: approval, audit, policy, durable state, and operational boundaries. The app already treats publishing and replies as external side effects that must pass provider capability checks, workspace scoping, usage gates, policy checks, and human approvals.

The gap is not "add more AI." The gap is production trust. Provider coverage is still narrow. LinkedIn is the first live provider, while other providers remain scaffolded. Comment ingest/reply and metrics sync are still limited. Redis/BullMQ worker runtime is required for production-grade background execution. Analytics are useful operationally, but not yet a true eval/quality layer. Brand memory exists, but needs stronger human-reviewed curation.

The product should become a supervised social-content operations center for founders, agencies, and lean marketing teams. The winning direction is missionized workflows: plan campaigns, simulate actions, verify provider readiness, collect approvals, schedule safely, recover failures, learn brand preferences from accepted edits, and report quality/cost/outcomes.

## 2. 2026 AI-Agent Trend Radar

| Trend | What is changing | Why it matters | Evidence/source URL | Relevance to this repo | Call |
| --- | --- | --- | --- | --- | --- |
| Multi-agent orchestration | Agent systems are moving toward orchestrator-worker patterns with specialist roles. | Content ops maps naturally to researcher, strategist, writer, scheduler, publisher, reporter. | Anthropic: https://www.anthropic.com/engineering/building-effective-agents; OpenAI Agents SDK: https://openai.github.io/openai-agents-python/; LangGraph: https://docs.langchain.com/oss/python/langgraph/overview | Build on `agentProfileRoleEnum`, `agentMissionTypeEnum`, and `supervised_campaign` in `db/schema.ts`. | Build now |
| Subagents | Specialist agents are becoming a product pattern when bounded by roles and tools. | Lets campaign work feel intelligent without granting unrestricted autonomy. | Anthropic: https://www.anthropic.com/engineering/building-effective-agents; OpenAI Agents SDK: https://openai.github.io/openai-agents-python/ | Extend `lib/agents/orchestration/role-templates.ts`, `planner.ts`, and `executors.ts`. | Build now, scoped |
| Agent memory/state | Memory is shifting toward curated, fresh, reviewable state. | Brand voice and approval history can become compounding product value. | LangGraph persistence: https://docs.langchain.com/oss/javascript/langgraph/persistence; OpenAI memory: https://openai.com/index/chatgpt-memory-dreaming/ | Expand `lib/brand-memory/proposals.ts` and `components/brand-memory/brand-memory-workbench.tsx`. | Build now |
| Tool use and browser/computer use | Agents are expected to take actions through tools and APIs. | Publishing and reply actions must use official APIs, queues, and simulations. | OpenAI tools: https://openai.com/index/new-tools-for-building-agents/; Gemini CLI: https://blog.google/technology/developers/introducing-gemini-cli-open-source-ai-agent/ | Keep side effects inside `lib/agents/orchestration/executors.ts`, provider adapters, scheduler, and workers. | Build API tools; avoid browser posting |
| MCP/A2A interoperability | Connector protocols are emerging for tools and agent-to-agent communication. | Useful later for standardized integrations, but premature as a core product bet. | MCP: https://modelcontextprotocol.io/specification/2025-06-18; A2A: https://github.com/a2aproject/A2A | Keep `lib/n8n/*`, provider adapters, and tool boundaries clean so MCP can fit later. | Monitor |
| Human approvals and guardrails | HITL interrupts and review/edit flows are expected in risky agent products. | Social publishing and replies carry brand/legal risk. | LangGraph HITL: https://docs.langchain.com/oss/javascript/langgraph/human-in-the-loop; AgentKit: https://openai.com/index/introducing-agentkit/ | Extend `app/api/agent-runs/[id]/approval/route.ts`, reply approvals, brand-memory approvals, and mission policy events. | Build now |
| Tracing/evals/observability | Teams expect run traces, quality signals, failure causes, and evals. | Paid users need to trust what agents did and why. | OpenAI tracing: https://openai.github.io/openai-agents-python/tracing/; LangSmith: https://docs.smith.langchain.com/ | Add scorecards from agent runs, policy events, approvals, provider outcomes, and usage ledger. | Build now |
| Background agents | Useful agents increasingly run asynchronously over longer tasks. | Campaigns, retries, reports, and triage do not fit a single request/response. | GitHub cloud agent: https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent; Codex: https://openai.com/index/introducing-codex/; Jules: https://jules.google/ | BullMQ plus durable DB state in `workers/social-worker.ts` is the right backbone. | Build after worker readiness |
| Enterprise governance | Admins need auditability, compliance posture, redaction, and team controls. | This is how the product moves from solo tool to team/agency SaaS. | OpenAI compliance: https://help.openai.com/en/articles/9261474-openai-compliance-platform-for-enterprise-and-edu-customers | Harden `lib/agents/governance-export.ts` and approval/audit UI. | Build now |
| Cost controls | Agent products are adding usage analytics, budgets, and spend controls. | Multi-step campaigns can burn model/provider quota quickly. | OpenAI spend controls: https://openai.com/index/chatgpt-enterprise-spend-controls/; Vercel AI Gateway: https://vercel.com/docs/ai-gateway | Extend `lib/billing/usage.ts`, mission simulations, and analytics to show estimated vs actual usage. | Build now |

## 3. Ranked Feature Recommendations

### 1. Platform Publishing Intelligence Agent

- One-line pitch: Tell users exactly what can publish where, why, and what to fix.
- User story: As an operator, I want provider/platform readiness warnings before scheduling so I do not discover failures after approval.
- Why now: Provider readiness is the largest blocker to live product value.
- Trend connection: tool use, guardrails, observability, background agents.
- Agent architecture: provider-health evaluator plus scheduler/mission preflight; no model needed for the core MVP.
- UX flow: Connections shows provider truth; Create/Calendar/Agents show readiness warnings; scheduling blocks unsupported provider/account/platform combinations.
- Backend/data changes: avoid schema in MVP; optionally add `provider_health_snapshots` later for reliability history.
- Integrations: LinkedIn first; mock preview/test; scaffold warnings for Meta, X, Slack, Discord.
- Guardrails and approval model: block unsupported providers, missing scopes, unready accounts, and unsupported capabilities; do not imply scaffold providers are live.
- Observability/evals: log readiness results on simulations, schedule attempts, and publish attempts.
- Likely repo touchpoints: `lib/providers/health.ts`, `lib/providers/registry.ts`, `lib/providers/capabilities.ts`, `lib/scheduler/create-scheduled-post.ts`, `lib/agents/orchestration/simulation.ts`, `components/connections/provider-actions.tsx`, `components/agents/agents-console.tsx`, `workers/jobs/publish-post.ts`.
- Tests needed: `tests/providers/provider-contract.test.ts`, `tests/providers/linkedin-provider.test.ts`, `tests/scheduler/create-scheduled-post.test.ts`, `tests/workers/publish-post.test.ts`, `tests/agents/orchestration.test.ts`.
- MVP scope: readiness warnings and hard blocks.
- Stretch scope: provider reliability history and readiness trends.
- Monetization value: makes paid live publishing credible.
- Risks: stale provider health, LinkedIn API churn, confusing mock vs live state.
- Acceptance criteria: scheduling cannot proceed for scaffold/unsupported providers; LinkedIn failures explain credentials/scopes/account/capability state; simulations show warnings without side effects.
- Scores: Impact 5, Confidence 5, Effort 2, Risk 2, Strategic fit 5.

### 2. Supervised Campaign Strategist Swarm

- One-line pitch: One governed mission turns a brief into research, strategy, variants, schedule suggestions, and report.
- User story: As a founder, I want a campaign plan without handing over unsupervised publishing.
- Why now: The repo already has `supervised_campaign`, role templates, planner, simulation, approvals, policy events, and task runs.
- Trend connection: multi-agent orchestration, subagents, HITL, background agents.
- Agent architecture: coordinator delegates to researcher, strategist, remixer, publisher, and reporter roles.
- UX flow: campaign mission wizard -> simulation preview -> approval checkpoints -> run timeline -> schedule proposal/report.
- Backend/data changes: reuse `agent_missions`, `agent_task_runs`, `agent_policy_events`, `agent_mission_simulations`, `usage_ledger`, `scheduled_jobs`.
- Integrations: LinkedIn publishing, n8n reminders, analytics report.
- Guardrails and approval model: approval before schedule/publish; non-keyword replies remain approval-gated; mission budget cap before run.
- Observability/evals: task success, policy events, usage estimate vs actual, provider outcome, approval rate.
- Likely repo touchpoints: `lib/agents/orchestration/planner.ts`, `role-templates.ts`, `executors.ts`, `policy.ts`, `runner.ts`, `simulation.ts`, `repository.ts`, `components/agents/agents-console.tsx`, `app/api/agents/missions/*`.
- Tests needed: orchestration tests, mission API tests, analytics tests, worker mission tests.
- MVP scope: one campaign preset with side-effect-free simulation and approval-gated schedule proposal.
- Stretch scope: recurring campaigns, per-platform campaign variants, report automation.
- Monetization value: Premium/Team campaign automation.
- Risks: cost, latency, over-orchestration, duplicate scheduled outputs.
- Acceptance criteria: campaign simulation and execution are inspectable; no external side effect occurs without approval; output includes research, strategy, variants, schedule suggestions, and summary.
- Scores: Impact 5, Confidence 4, Effort 4, Risk 3, Strategic fit 5.

### 3. Approval Command Center

- One-line pitch: One queue for publish, reply, brand-memory, policy, and budget decisions.
- User story: As a team lead, I want all pending agent decisions in one place.
- Why now: Approval surfaces exist but are split across Create, Agents, Auto-Replies, and Brand Memory.
- Trend connection: HITL guardrails, enterprise governance, workflow UI.
- Agent architecture: not an agent itself; a governed control-plane read model over pending decisions.
- UX flow: unified queue -> filters by decision type/severity/platform/mission -> detail drawer -> approve/reject/request changes -> deep link to source.
- Backend/data changes: start with aggregation over existing tables; add `approval_items` only if query complexity/performance demands it.
- Integrations: content approvals, reply approvals, brand-memory proposals, policy escalations, budget escalations.
- Guardrails and approval model: RBAC, workspace scoping, redacted payloads, required reason for high-risk overrides.
- Observability/evals: decision latency, approval/rejection rate, override rate, aging approvals.
- Likely repo touchpoints: `components/replies/approval-queue.tsx`, `components/brand-memory/brand-memory-workbench.tsx`, `components/agents/agents-console.tsx`, `app/(dashboard)/agents/page.tsx`, new or extended API route under `app/api/`.
- Tests needed: API aggregation, UI filters, auth/workspace scoping, redaction behavior.
- MVP scope: unified queue with filters and deep links.
- Stretch scope: batch approve/reject with reasons and n8n reminders.
- Monetization value: Team governance and agency workflow.
- Risks: approval fatigue, confusing duplicate states.
- Acceptance criteria: every pending external or memory-changing decision is discoverable in one place and links back to the owning workflow.
- Scores: Impact 5, Confidence 4, Effort 3, Risk 3, Strategic fit 5.

### 4. Brand Voice Memory Curator 2.0

- One-line pitch: Turn accepted edits into reviewed, non-conflicting brand rules.
- User story: As a marketer, I want the agent to learn from approvals without silently changing brand rules.
- Why now: Brand-memory proposals already exist and are a compounding-quality feature.
- Trend connection: durable memory/state, personalization, guardrails.
- Agent architecture: proposal clustering and contradiction checks; human approval before activation.
- UX flow: pending proposals -> cluster/merge suggestions -> conflict warnings -> approve/reject -> accepted rules feed generation.
- Backend/data changes: extend proposal metadata if needed; consider active memory rules after MVP.
- Integrations: content workflow, brand-profile tool, campaign missions.
- Guardrails and approval model: agents can propose but never self-activate or self-delete brand memory.
- Observability/evals: proposal acceptance rate, rejection reasons, quality lift over time.
- Likely repo touchpoints: `lib/brand-memory/proposals.ts`, `lib/brand-memory/schemas.ts`, `components/brand-memory/brand-memory-workbench.tsx`, `lib/agents/tools/read-brand-profile.ts`, `lib/agents/graphs/content-workflow.ts`.
- Tests needed: proposal tests, content workflow tests, review UI tests.
- MVP scope: cluster/merge/contradiction review for proposals.
- Stretch scope: per-platform, per-campaign, or per-agent profile memory.
- Monetization value: retention and higher output quality.
- Risks: stale or bad memory; privacy concerns.
- Acceptance criteria: no memory becomes active without human approval; conflicting proposals are surfaced before acceptance.
- Scores: Impact 4, Confidence 4, Effort 3, Risk 3, Strategic fit 5.

### 5. Agent Quality Scorecards

- One-line pitch: Score agent runs by quality, cost, failures, approvals, and outcomes.
- User story: As an owner, I want to know whether automation is trustworthy and worth paying for.
- Why now: The repo has run, usage, policy, and provider data, but not a true eval layer.
- Trend connection: tracing, evals, observability, cost controls.
- Agent architecture: deterministic scorecard service first; model-graded evals later.
- UX flow: Agents/Analytics scorecard panel -> mission detail -> cost/failure/approval/quality breakdown.
- Backend/data changes: start computed; consider `agent_eval_scores` only for persisted rubric history.
- Integrations: LangSmith/OpenAI traces later if redaction is reviewed.
- Guardrails and approval model: redact sensitive content in exports/traces; label model-graded scores separately from deterministic ones.
- Observability/evals: this is the eval/observability foundation.
- Likely repo touchpoints: `lib/observability/agent-events.ts`, `lib/analytics/metrics.ts`, `components/analytics/agent-run-table.tsx`, `lib/agents/governance-export.ts`.
- Tests needed: analytics tests, orchestration tests, governance export tests.
- MVP scope: deterministic scorecards from existing run, policy, approval, usage, and provider data.
- Stretch scope: rubric-based model evals, trend charts, per-agent comparisons.
- Monetization value: governance tier and team reporting.
- Risks: misleading scores if rubric is unclear.
- Acceptance criteria: each mission can show cost, status, failure cause, approval rate, policy blocks, and quality flags.
- Scores: Impact 4, Confidence 4, Effort 3, Risk 2, Strategic fit 5.

### 6. Brief-to-Calendar Campaign Planner

- One-line pitch: Convert approved variants into an editable posting calendar.
- User story: As an operator, I want approved content scheduled without copy-paste.
- Why now: Durable scheduler and approval checkpoints already exist.
- Trend connection: bounded tool execution, background workflows, approvals.
- Agent architecture: scheduling assistant using provider preflight and existing scheduler rails.
- UX flow: approval complete -> proposed slots -> edit platform/account/time -> confirm schedule -> calendar shows durable jobs.
- Backend/data changes: reuse `scheduled_jobs`, `publish_attempts`, variants, enqueue status.
- Integrations: LinkedIn, mock, BullMQ worker.
- Guardrails and approval model: approval must be complete before scheduling; provider preflight required before schedule rows.
- Observability/evals: enqueue status, publish outcome, retry classification.
- Likely repo touchpoints: `app/api/agent-runs/[id]/approval/route.ts`, `app/api/posts/[id]/schedule/route.ts`, `lib/scheduler/create-scheduled-post.ts`, `lib/scheduler/enqueue.ts`, `app/(dashboard)/calendar/page.tsx`.
- Tests needed: schedule API, content workflow, calendar UI, worker queue.
- MVP scope: approved variants to proposed slots.
- Stretch scope: campaign-level calendar optimization and cadence preferences.
- Monetization value: paid scheduling capacity.
- Risks: duplicate scheduling, timezone mistakes.
- Acceptance criteria: DB schedule row exists before queue enqueue; unsupported provider/account/platform combinations return actionable errors.
- Scores: Impact 4, Confidence 5, Effort 3, Risk 2, Strategic fit 5.

### 7. LinkedIn Live Publisher Coach

- One-line pitch: A B2B preflight coach for the first real provider.
- User story: As a LinkedIn user, I want to know why a post will succeed or fail before scheduling.
- Why now: LinkedIn is live for text/image publishing, but comment ingest/reply and metrics sync are disabled.
- Trend connection: agents wrapped around real provider APIs.
- Agent architecture: deterministic LinkedIn readiness and content/media validation; optional copy coach later.
- UX flow: LinkedIn readiness score -> fix list -> media/content constraints -> schedule/publish readiness.
- Backend/data changes: reuse token vault, provider health, publish attempts.
- Integrations: LinkedIn OAuth and REST posts.
- Guardrails and approval model: no unsupported comments/metrics claims; no publishing without schedule/approval gates.
- Observability/evals: LinkedIn failure categories and retryability.
- Likely repo touchpoints: `lib/providers/linkedin.ts`, `tests/providers/linkedin-provider.test.ts`, `workers/jobs/publish-post.ts`, `components/connections/provider-actions.tsx`.
- Tests needed: LinkedIn provider tests, provider contract tests, worker publish tests.
- MVP scope: readiness score and fix list.
- Stretch scope: LinkedIn-specific content coaching and metrics once approved scopes exist.
- Monetization value: Premium activation and first real provider success.
- Risks: LinkedIn API changes and scope approval constraints.
- Acceptance criteria: preflight mirrors adapter capabilities exactly and never promises unsupported operations.
- Scores: Impact 4, Confidence 4, Effort 2, Risk 3, Strategic fit 5.

### 8. Analytics Next-Best-Action Agent

- One-line pitch: Turn analytics into practical follow-up recommendations.
- User story: As a founder, I want the dashboard to tell me what to do next.
- Why now: Analytics are operational but not yet advisory.
- Trend connection: embedded agents in operational dashboards.
- Agent architecture: deterministic insight rules first; model summary only after enough evidence.
- UX flow: analytics page -> recommendations panel -> evidence -> create campaign/retry/fix provider action.
- Backend/data changes: aggregate from posts, publish attempts, usage, approvals, and future provider metrics.
- Integrations: provider metrics later.
- Guardrails and approval model: label low-confidence recommendations; do not invent performance data.
- Observability/evals: recommendation acceptance and outcome tracking.
- Likely repo touchpoints: `lib/analytics/metrics.ts`, `app/(dashboard)/analytics/page.tsx`, `components/analytics/*`.
- Tests needed: analytics metric tests and UI tests.
- MVP scope: operational recommendations from local data.
- Stretch scope: performance optimization once live metrics sync exists.
- Monetization value: Premium analytics.
- Risks: weak recommendations until provider metrics exist.
- Acceptance criteria: each recommendation cites the local evidence used.
- Scores: Impact 3, Confidence 3, Effort 2, Risk 2, Strategic fit 4.

### 9. n8n Automation Agent Packs

- One-line pitch: Curated automations for publish failures, approvals, usage alerts, and weekly reports.
- User story: As an operator, I want external notifications without building workflows myself.
- Why now: Signed n8n events and callbacks already exist.
- Trend connection: workflow interoperability and background automation.
- Agent architecture: not a free-form builder; packaged event workflows with audit records.
- UX flow: enable pack -> configure destination -> send test event -> inspect delivery/callback state.
- Backend/data changes: reuse `n8n_events`; add pack metadata only if needed.
- Integrations: n8n.
- Guardrails and approval model: signed outbound events, signed callbacks, redacted payloads.
- Observability/evals: delivery state, callback state, failure reason.
- Likely repo touchpoints: `lib/n8n/events.ts`, `lib/n8n/client.ts`, `lib/n8n/event-log.ts`, `app/api/webhooks/n8n/route.ts`.
- Tests needed: n8n event and webhook tests.
- MVP scope: publish failure, approval reminder, usage alert packs.
- Stretch scope: user-visible template library.
- Monetization value: automation add-on.
- Risks: support burden and payload leakage.
- Acceptance criteria: each pack emits signed, redacted, auditable events.
- Scores: Impact 3, Confidence 4, Effort 2, Risk 3, Strategic fit 4.

### 10. Comment Triage and Reply Copilot Plus

- One-line pitch: Classify comments into safe, lead, support, crisis, and approval buckets.
- User story: As a brand owner, I want risky replies reviewed and safe replies accelerated.
- Why now: Reply rules and approval queues exist, but live provider comment support is limited.
- Trend connection: supervised engagement agents.
- Agent architecture: keyword/rule matcher plus comment agent plus approval policy.
- UX flow: comment inbox -> label/filter -> safe keyword auto-reply or approval draft -> send after review.
- Backend/data changes: extend comment/reply labels if needed.
- Integrations: wait on provider comment ingest/reply support before live expansion.
- Guardrails and approval model: crisis and non-keyword replies require approval.
- Observability/evals: auto-send rate, escalation rate, blocked reasons, user overrides.
- Likely repo touchpoints: `lib/agents/langchain/comment-agent.ts`, `lib/agents/graphs/comment-reply-workflow.ts`, `lib/replies/*`, `components/replies/auto-replies-console.tsx`.
- Tests needed: comment workflow, replies repository, approval API, provider capability blocks.
- MVP scope: richer triage labels on existing events.
- Stretch scope: live provider comment ingestion/reply once supported safely.
- Monetization value: engagement automation.
- Risks: brand/legal damage.
- Acceptance criteria: no non-keyword or crisis reply sends without review.
- Scores: Impact 4, Confidence 3, Effort 4, Risk 5, Strategic fit 4.

## 4. Build First Recommendation

Build first: Platform Publishing Intelligence Agent.

Why this should be first:

- It addresses the biggest roadmap constraint before adding more autonomy.
- It improves LinkedIn activation, scheduling, simulations, campaign missions, and worker recovery.
- It prevents the product from overselling scaffold providers.
- It creates the trust layer later features depend on.

Implementation phases:

1. Normalize provider truth:
   - Read `lib/providers/registry.ts`, `lib/providers/health.ts`, `lib/providers/capabilities.ts`, `lib/providers/connections.ts`, `lib/providers/linkedin.ts`, `lib/providers/skeleton.ts`.
   - Ensure every surface distinguishes live, mock, scaffold, missing credentials, missing scopes, and unsupported capability.
2. Add scheduler preflight:
   - Enforce provider/account/capability/scope readiness in `lib/scheduler/create-scheduled-post.ts`.
   - Preserve durable-first behavior: DB row before BullMQ enqueue.
3. Add mission simulation readiness:
   - Add provider readiness warnings to `lib/agents/orchestration/simulation.ts`.
   - Ensure simulations do not write schedule rows, queue jobs, publish, reply, or consume actual usage.
4. Surface readiness in UI:
   - Connections: `components/connections/provider-actions.tsx`.
   - Agents: `components/agents/agents-console.tsx`.
   - Calendar: `app/(dashboard)/calendar/page.tsx`.
   - Create/review surfaces if scheduling is shown there.
5. Classify worker/provider recovery:
   - Update `workers/jobs/publish-post.ts`, `lib/scheduler/publish-recovery.ts`, and retry UI as needed.
   - Block automatic retry for provider capability/configuration failures.

Schema changes:

- MVP: none.
- Stretch: add provider readiness history only if the UI needs trend/reliability reporting.

API changes:

- Extend provider health responses under `app/api/connections/[provider]/health/route.ts`.
- Include readiness details in scheduling and mission simulation responses.

UI changes:

- Clear labels for `live`, `mock`, `scaffold`, `configuration required`, `account required`, `scope missing`, `capability unsupported`.
- Actionable fix messages, not generic errors.
- No scaffold provider may appear as ready for live scheduling/publishing.

Tests to add or update:

- `tests/providers/provider-contract.test.ts`
- `tests/providers/linkedin-provider.test.ts`
- `tests/scheduler/create-scheduled-post.test.ts`
- `tests/workers/publish-post.test.ts`
- `tests/agents/orchestration.test.ts`
- UI/component tests if readiness badges or controls change.

Rollout plan:

1. Ship behind existing provider readiness surfaces.
2. Start with LinkedIn and mock.
3. Mark Meta, X, Slack, Discord honestly as scaffold/stub.
4. Add readiness history only after real provider usage exists.

Definition of done:

- Unsupported providers cannot be scheduled.
- LinkedIn readiness explains missing credentials, scopes, account state, and unsupported operations.
- Simulations show provider warnings without side effects.
- Worker failures classify recovery options.
- Tests and local gates pass.

## 5. 30/60/90 Day Roadmap

### First 30 Days: Foundations and Quick Wins

- Build Platform Publishing Intelligence Agent.
- Harden worker runtime posture using `docs/worker-runtime-readiness.md`.
- Polish mission simulation/readiness reporting.
- Add LinkedIn Live Publisher Coach.
- Add basic Agent Quality Scorecards from existing runs, policy events, approvals, usage, and provider attempts.
- Keep all publish/reply actions approval-gated.

### Days 31-60: Differentiated Agent Workflows

- Ship Approval Command Center.
- Ship Brief-to-Calendar Campaign Planner.
- Ship Supervised Campaign Strategist Swarm as a single governed campaign preset.
- Improve Brand Voice Memory Curator with clustering and conflict review.
- Add weekly operator report improvements using analytics, provider outcomes, usage, and policy events.

### Days 61-90: Scale, Observability, Monetization, Integrations

- Persist scorecards and cost metrics if computed scorecards are not enough.
- Harden governance export and redaction.
- Package n8n automation packs.
- Decide the second live provider after LinkedIn reliability is proven.
- Explore metrics sync only after provider scopes and API access are real.
- Turn governance, scorecards, campaign automation, and approval workflows into Premium/Team packaging.

## 6. Do Not Build Yet

- Fully autonomous publishing across all platforms. Provider readiness and worker runtime are not ready enough.
- Browser-based social posting. Use official APIs only.
- Public n8n workflow builder. Curated packs are safer and more supportable.
- A2A or MCP as first-class product surfaces. Keep adapter boundaries clean, but wait for real partner demand.
- Agents that self-modify policies, budget caps, provider scopes, or brand memory.
- Broad comment automation before live provider comment ingest/reply support exists.
- Generic chatbot. The product's differentiator is governed workflow automation.

## 7. Open Questions

- Which provider should come after LinkedIn: X, Meta/Instagram/Facebook, Slack, or Discord?
- Should supervised campaign remain the default autonomy tier for all paid users?
- Where will Redis/BullMQ workers run in production, and who monitors them?
- What billing plan maps to governed automation volume: missions, posts, connected accounts, approvals, or usage credits?
- Should brand memory be workspace-wide, per platform, per campaign, or per agent profile?
- Should n8n remain internal notification glue, or become a user-facing automation surface through curated packs?
- What evidence is enough to enable live comment replies: provider support, safety tests, customer opt-in, or legal review?

## 8. Executive Summary

Top 3 recommended features:

1. Platform Publishing Intelligence Agent
2. Supervised Campaign Strategist Swarm
3. Approval Command Center

Best first feature:

- Platform Publishing Intelligence Agent.

Biggest risk:

- Expanding autonomy before provider readiness, Redis/worker deployment, evals, and approval UX are trustworthy.

Highest-leverage technical foundation:

- A unified readiness, simulation, approval, policy, usage, and provider-outcome layer over the existing DB-backed mission and scheduler rails.

## Resume Guidance After First 3 Features

If the first three new features are implemented, do not rerun the whole research workflow. Start here:

1. Verify live state:
   - `git rev-parse HEAD`
   - `git rev-parse origin/main`
   - `git status --short`
   - `gh pr list --state open`
2. Read this file plus:
   - `docs/ai-agent-feature-master-update-plan.md`
   - `docs/next-feature-plans/README.md`
   - the implementation notes or PR summaries for the first three features.
3. Continue from feature 4:
   - Brand Voice Memory Curator 2.0
   - Agent Quality Scorecards
   - Brief-to-Calendar Campaign Planner
   - LinkedIn Live Publisher Coach
   - Analytics Next-Best-Action Agent
   - n8n Automation Agent Packs
   - Comment Triage and Reply Copilot Plus

Suggested resume prompt:

```text
/goal Continue the AI-Agent Feature Roadmap 2026 from docs/ai-agent-feature-roadmap-2026.md. First verify the current branch, origin/main, open PRs, and which of the top 3 features are already implemented. Do not rerun the original diagnostic/research workflow. Treat docs/ai-agent-feature-roadmap-2026.md as the planning source of truth, then create implementation plans for the next unbuilt ranked features in order, preserving provider readiness, approval gates, policy checks, usage controls, redaction, and tests.
```

Suggested implementation prompt for the first feature:

```text
/goal Implement the Platform Publishing Intelligence Agent for Automated-Content. Start by reading lib/providers/health.ts, lib/providers/registry.ts, lib/providers/capabilities.ts, lib/providers/connections.ts, lib/providers/linkedin.ts, lib/scheduler/create-scheduled-post.ts, lib/agents/orchestration/simulation.ts, components/connections/provider-actions.tsx, components/agents/agents-console.tsx, workers/jobs/publish-post.ts, and the relevant tests. Preserve approval gates, do not present scaffold providers as live, and verify with lint, typecheck, tests, build, and a full diff review before opening a non-draft PR.
```
