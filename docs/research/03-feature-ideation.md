# Feature Ideation

Confirmed date: 2026-06-24.

Scope: concrete AI-agent feature ideas for `Automated-Content`, grounded in the repo intelligence and 2026 trend research. These are ideas, not feasibility rankings; feasibility is evaluated in `04-feasibility.md`.

## 1. Agent Quality Scorecards

- User problem: Operators can see agent runs, tool calls, failures, and recent rows, but cannot tell which agents produce trustworthy outcomes over time (`lib/analytics/metrics.ts:442-489`, `components/analytics/agent-run-table.tsx:37-85`).
- Agent behavior: After each content, reply, scheduling, or mission run, compute deterministic scores for policy compliance, approval rate, retry rate, provider readiness, budget adherence, edit distance, and outcome completion.
- Workflow UI: Add score columns and drilldowns to Analytics and Agents; approval rows can show "why this score changed".
- Data needed: `agentRuns`, `agentTaskRuns`, `agentPolicyEvents`, `workflowCheckpoints`, `publishAttempts`, `replyAttempts`, accepted/rejected brand-memory proposals (`db/schema.ts:331`, `db/schema.ts:816`, `db/schema.ts:864`, `db/schema.ts:707`, `db/schema.ts:533`, `db/schema.ts:632`, `db/schema.ts:674`).
- Integrations: None required for MVP; optional LangSmith trace links if configured (`lib/env.ts:30-33`).
- Trend leveraged: trace grading/evals, governance, project-owned orchestration.
- Implementation shape: Add a scorecard service under `lib/agents/scorecards`, aggregate in `lib/analytics/metrics.ts`, surface in `components/analytics/agent-run-table.tsx` and `components/agents/agents-console.tsx`.
- Files likely touched: `db/schema.ts`, `lib/analytics/metrics.ts`, `components/analytics/agent-run-table.tsx`, `components/agents/agents-console.tsx`, `tests/analytics/metrics.test.ts`, `tests/agents/orchestration.test.ts`.
- MVP scope: In-memory/deterministic score computed from existing rows; no model calls.
- Stretch scope: Persist score history, trend deltas, score explainability, workspace benchmarks.
- Monetization value: Premium governance/quality reporting and proof of reliability for teams.
- Risk: Bad scores could create false confidence if inputs are sparse or preview-only.
- Validation test: Fixture runs with policy blocks, approvals, retries, and successful publish attempts produce stable scorecards and explanatory reasons.

## 2. Analytics Next-Best-Action Agent

- User problem: Analytics shows counts and failures but not prioritized operational actions (`app/(dashboard)/analytics/page.tsx:49-147`).
- Agent behavior: Generate ranked, explainable actions such as "retry these posts", "review these reply approvals", "connect LinkedIn before scheduling", or "create a content mission for an empty publishing window".
- Workflow UI: Add an "Actions" panel to Analytics with approve/dismiss buttons and links to Calendar, Approvals, Connections, or Agents.
- Data needed: Analytics snapshot, worker health, queue overview, approval command center, provider health, billing state (`lib/analytics/metrics.ts:827-870`, `lib/scheduler/worker-health.ts:331-388`, `lib/scheduler/queue-overview.ts:87-191`, `lib/approvals/command-center.ts:317-357`, `lib/providers/health.ts:83-193`, `lib/billing/usage.ts:379-414`).
- Integrations: Optional n8n notification event after human approval.
- Trend leveraged: durable workflow operations, traceable recommendations, human approvals.
- Implementation shape: Deterministic recommendation engine first; model summarization later.
- Files likely touched: `lib/analytics/metrics.ts`, new `lib/analytics/recommendations.ts`, `app/(dashboard)/analytics/page.tsx`, `components/analytics/*`, `tests/analytics/metrics.test.ts`.
- MVP scope: Top five recommendations from rules and existing data.
- Stretch scope: Agent-generated narrative with confidence, impact, and prefilled remediation missions.
- Monetization value: Premium operations assistant for high-volume teams.
- Risk: Recommendations that trigger side effects must be approval-gated.
- Validation test: Given failed publish, pending approvals, empty queue, and disconnected provider fixtures, recommendations rank deterministically and link to the correct surface.

## 3. Simulation Branch Compare

- User problem: Mission simulation exists, but operators cannot compare alternative policies, budgets, providers, or schedules before choosing one (`lib/agents/orchestration/simulation.ts:505-652`, `components/agents/agents-console.tsx:931-995`).
- Agent behavior: Create multiple simulated branches for the same mission inputs, compare planned actions, side effects suppressed, approval counts, budget usage, and provider readiness warnings.
- Workflow UI: In Agents, add "Compare simulations" for selected mission: current policy vs lower autonomy vs different provider vs higher budget.
- Data needed: `agentMissionSimulations`, mission policy, provider health, usage estimates (`db/schema.ts:907`, `lib/agents/orchestration/usage-estimates.ts`, `lib/providers/health.ts:83-193`).
- Integrations: None for MVP.
- Trend leveraged: trajectory branching, durable agent runtime, human-in-the-loop.
- Implementation shape: Extend simulation service with branch inputs and UI comparison table.
- Files likely touched: `lib/agents/orchestration/simulation.ts`, `lib/agents/schemas/orchestration.ts`, `components/agents/agents-console.tsx`, `app/api/agents/missions/[id]/simulate/route.ts`, `tests/agents/orchestration.test.ts`.
- MVP scope: Generate two branch simulations from provided policy overrides.
- Stretch scope: AI-written recommendation explaining which branch is safest and why.
- Monetization value: Reduces risk for premium supervised campaigns.
- Risk: Simulation output can drift from execution if executors evolve without shared planning contracts.
- Validation test: Simulating a supervised campaign under two policies shows higher approval requirements for stricter autonomy and suppresses side effects in both branches.

## 4. Provider Readiness Recovery Agent

- User problem: Provider and queue failures are visible, but recovery is scattered across worker health, retry buttons, provider health, and connection pages (`lib/scheduler/worker-health.ts:121-139`, `components/calendar/publish-retry-button.tsx:36-78`, `app/api/connections/[provider]/health/route.ts:65-122`).
- Agent behavior: Diagnose publish blockers, classify the cause, propose safe recovery steps, and route the operator to reconnect, retry, reschedule, or wait.
- Workflow UI: Calendar/Connections/Operations panel with "Diagnose" button and step-by-step recovery checklist.
- Data needed: `scheduledJobs`, `publishAttempts`, connected account status/capabilities, worker queue status, provider health (`db/schema.ts:490`, `db/schema.ts:533`, `db/schema.ts:435`, `lib/providers/connections.ts:325-378`, `lib/scheduler/worker-health.ts:331-388`).
- Integrations: LinkedIn, mock provider, future provider adapters; optional n8n failure alert.
- Trend leveraged: operational agents, durable workflow recovery, containment.
- Implementation shape: New recovery diagnosis service using existing recovery classifiers and provider health.
- Files likely touched: `lib/scheduler/publish-recovery.ts`, `lib/scheduler/publish-retry.ts`, `lib/providers/health.ts`, `components/calendar/publish-retry-button.tsx`, `app/api/operations/publish-retry/route.ts`, tests under `tests/scheduler`.
- MVP scope: Explanation layer around existing retry classification and health checks.
- Stretch scope: One-click approved remediation mission that retries safe queue failures.
- Monetization value: Premium reliability feature for teams using live publishing.
- Risk: Incorrect retry advice could duplicate external posts; duplicate-send guards must remain authoritative (`lib/scheduler/publish-retry.ts:73-124`).
- Validation test: Non-retryable token-scope failures never produce auto-retry actions; queue enqueue failures produce retry guidance.

## 5. Provider Expansion Activation Wizard

- User problem: LinkedIn is live, while Meta/X/Slack/Discord are scaffold or partial; operators need a guided path from scaffold to production provider (`lib/providers/linkedin.ts:877-1107`, `lib/providers/skeleton.ts:30-55`).
- Agent behavior: Inspect adapter capabilities, required env vars, tests, and route readiness, then generate a provider activation checklist.
- Workflow UI: Connections page shows "Activate provider" for stubs with missing env, scopes, API features, test plan, and launch blockers.
- Data needed: provider registry, skeleton/live status, env config, provider health, connection capacity (`lib/providers/registry.ts:17-25`, `lib/providers/types.ts:140-151`, `lib/env.ts:38-47`, `lib/providers/connection-capacity.ts:13-45`).
- Integrations: Provider APIs for Meta/X/Slack/Discord when implemented.
- Trend leveraged: agent protocols/tool governance, project-local instructions.
- Implementation shape: Deterministic provider readiness matrix with optional generated checklist.
- Files likely touched: `lib/providers/*`, `components/connections/provider-actions.tsx`, `app/(dashboard)/connections/page.tsx`, tests under `tests/providers` and `tests/api/connections.test.ts`.
- MVP scope: Readiness wizard with no live API calls.
- Stretch scope: Provider-specific OAuth/playbook generation and test scaffolds.
- Monetization value: Unlocks multi-platform premium publishing.
- Risk: API terms and scope requirements change; source links and env validation must stay current.
- Validation test: Scaffold provider returns "not activatable" until required env/config/test contract is satisfied.

## 6. Brand Voice Memory Curator 2.0

- User problem: Brand-memory proposals can be reviewed and applied, but there is no clustering, merge suggestion, contradiction detection, or stale-rule cleanup (`lib/brand-memory/proposals.ts:572-611`, `components/brand-memory/brand-memory-workbench.tsx:65-399`).
- Agent behavior: Group similar proposals, detect conflicting rules, summarize evidence, and suggest merge/reject/archive decisions.
- Workflow UI: Brand Memory workbench adds clusters, conflict badges, and "merge accepted rules" review flow.
- Data needed: brand-memory proposals, accepted rules, source variant/agent run IDs, review status/confidence (`lib/brand-memory/schemas.ts:8-24`, `db/schema.ts:674`).
- Integrations: Optional embedding/vector service later; no external dependency for MVP clustering.
- Trend leveraged: agent memory/state, approvals, eval-driven instruction quality.
- Implementation shape: Deterministic text similarity and contradiction heuristics first; model-assisted summaries behind approval later.
- Files likely touched: `lib/brand-memory/proposals.ts`, new `lib/brand-memory/curation.ts`, `components/brand-memory/brand-memory-workbench.tsx`, `tests/brand-memory/proposals.test.ts`.
- MVP scope: Cluster exact/near-duplicate rules and warn on obvious negations.
- Stretch scope: Model-assisted conflict summaries and versioned brand-memory releases.
- Monetization value: Premium brand governance and consistency.
- Risk: Model-generated curation could erase legitimate nuanced brand rules.
- Validation test: Duplicate accepted proposals cluster together; contradictory "avoid hype" vs "use hype" rules require human review.

## 7. Approval SLA And Reminder Agent

- User problem: Approvals exist across content, replies, brand memory, and agent policy, but there is no SLA/reminder layer (`lib/approvals/command-center.ts:317-357`).
- Agent behavior: Monitor pending/blocked approvals, calculate age/severity, send reminders, and escalate overdue provider/budget/policy blockers.
- Workflow UI: Approvals page adds SLA filters, overdue badges, and reminder history.
- Data needed: approval command center items, n8n event log, workspace users, notification settings (`lib/approvals/command-center.ts:51-70`, `lib/n8n/event-log.ts:120-163`).
- Integrations: n8n signed events for reminders (`lib/n8n/events.ts:9-26`, `docs/archive/n8n/workflows.md:84-88`).
- Trend leveraged: background agents, governed automation, durable workflows.
- Implementation shape: Scheduled job or worker task emits approval reminder events with dedupe.
- Files likely touched: `lib/approvals/command-center.ts`, `lib/n8n/events.ts`, `lib/n8n/client.ts`, `components/approvals/approval-command-center.tsx`, tests under `tests/approvals` and `tests/n8n`.
- MVP scope: Overdue filtering and manual "send reminder" event.
- Stretch scope: Workspace-configurable SLA policies and automatic reminders.
- Monetization value: Team operations feature for agencies.
- Risk: Reminder spam if dedupe and user preferences are weak.
- Validation test: Pending item older than threshold emits one signed n8n reminder and does not repeat within the dedupe window.

## 8. Governance Export Narrative Brief

- User problem: Governance export exists as JSON, but executives need a readable brief explaining agent actions, policy blocks, simulations, and provider events (`lib/agents/governance-export.ts:65-159`, `app/api/agents/governance-export/route.ts:40-53`).
- Agent behavior: Convert governance export into an audit-ready narrative with counts, notable blocked actions, unresolved approvals, and redacted evidence.
- Workflow UI: Agents governance section adds "Download brief" next to JSON export.
- Data needed: governance export payload, mission/task/policy/simulation/n8n rows, pending approvals (`lib/agents/governance-export.ts:87-159`).
- Integrations: None for MVP; optional PDF/report export later.
- Trend leveraged: enterprise governance, traceability, background agent logs.
- Implementation shape: Deterministic Markdown generator first; optional model summarizer after redaction.
- Files likely touched: `lib/agents/governance-export.ts`, new `lib/agents/governance-brief.ts`, `app/api/agents/governance-export/route.ts`, `components/agents/agents-console.tsx`, `tests/agents/governance-export.test.ts`.
- MVP scope: Markdown/JSON dual export with redacted details.
- Stretch scope: Branded PDF and weekly executive delivery.
- Monetization value: Premium compliance/audit reporting.
- Risk: Narrative must not leak secrets; existing redaction must wrap every path (`lib/agents/governance-export.ts:19-31`).
- Validation test: Export containing token-like fields produces a brief with redacted values and accurate counts.

## 9. Cost-Aware Model Router And Budget Forecaster

- User problem: Mission policies include budgets, but operators cannot forecast budget burn before changing mission scope (`components/agents/agents-console.tsx:268-296`, `lib/agents/orchestration/policy.ts:259-270`).
- Agent behavior: Estimate model/tool usage by mission plan, recommend cheaper/faster model paths, and block or require review when forecast exceeds policy.
- Workflow UI: Agents mission form displays forecast and "use cheaper route" suggestion.
- Data needed: mission tasks, usage estimates, agent run tool calls, billing plan/usage (`lib/agents/orchestration/usage-estimates.ts`, `lib/billing/usage.ts:379-414`).
- Integrations: OpenAI/Gemini model factory and future provider routing (`package.json:21-24`, `lib/env.ts:30-33`).
- Trend leveraged: multi-model routing, model-cost governance.
- Implementation shape: Extend existing usage estimates with model class/cost assumptions and policy events.
- Files likely touched: `lib/agents/orchestration/usage-estimates.ts`, `lib/agents/orchestration/policy.ts`, `components/agents/agents-console.tsx`, `tests/agents/orchestration.test.ts`.
- MVP scope: Budget forecast based on task types and current model setting.
- Stretch scope: Model router recommendations using empirical run history.
- Monetization value: Premium cost controls and agency margin protection.
- Risk: Model pricing changes; keep pricing config explicit and editable.
- Validation test: A high-task mission forecasts over budget, records a policy event, and requires review.

## 10. Content Performance Learning Loop

- User problem: Publishing and analytics are connected, but performance outcomes do not visibly feed future schedule suggestions or brand memory (`lib/analytics/metrics.ts:345-421`, `lib/brand-memory/proposals.ts:600-611`).
- Agent behavior: Identify which hooks, formats, posting times, and platforms perform best, then propose schedule/variant/brand-memory updates for review.
- Workflow UI: Analytics "Learnings" tab with proposed memory/schedule rules and approve/reject.
- Data needed: platform variants, scheduled jobs, publish attempts, reply/comment events, brand-memory proposals (`db/schema.ts:400`, `db/schema.ts:490`, `db/schema.ts:533`, `db/schema.ts:565`, `db/schema.ts:674`).
- Integrations: Provider metrics sync when available; currently metrics support is mostly future/stub (`lib/providers/types.ts:12-13`, `lib/providers/x.ts:8`).
- Trend leveraged: agent memory/state, traceable recommendations.
- Implementation shape: Start with internal outcomes and reply activity; later add provider metrics.
- Files likely touched: `lib/analytics/metrics.ts`, `lib/brand-memory/proposals.ts`, `components/analytics/*`, `tests/analytics/metrics.test.ts`, `tests/brand-memory/proposals.test.ts`.
- MVP scope: Rules from internal publish/reply outcomes only.
- Stretch scope: Live metrics ingestion per provider.
- Monetization value: Premium optimization loop.
- Risk: Without provider metrics, recommendations may overfit limited internal signals.
- Validation test: High reply activity for a platform/time produces one pending learning proposal with evidence.

## 11. Supervised Campaign Autopilot Plus

- User problem: Supervised campaign missions exist, but the operator still must connect campaign planning, content generation, schedule approval, and report consumption manually (`components/agents/agents-console.tsx:95-102`, `tests/agents/orchestration.test.ts:1191-1404`).
- Agent behavior: Plan a campaign, generate variants, simulate scheduling, stop for approval, queue approved posts, then compile a weekly report.
- Workflow UI: Agents preset becomes a guided multi-step campaign wizard with visible gates.
- Data needed: mission inputs, content workflow output, scheduling suggestions, provider health, report evidence (`lib/agents/orchestration/executors.ts:403-475`, `lib/agents/orchestration/executors.ts:645-730`, `lib/agents/orchestration/executors.ts:993-1059`).
- Integrations: LinkedIn/mock for MVP; provider expansion later.
- Trend leveraged: background agents, durable workflows, human approval.
- Implementation shape: Upgrade existing supervised campaign preset and executor outputs; do not add a separate chatbot.
- Files likely touched: `components/agents/agents-console.tsx`, `lib/agents/orchestration/executors.ts`, `lib/agents/orchestration/planner.ts`, `tests/agents/orchestration.test.ts`.
- MVP scope: Better wizard and explicit approval-gated handoff; no autonomous publish.
- Stretch scope: Multi-platform campaign calendar and report export.
- Monetization value: High-value premium workflow.
- Risk: Could duplicate existing create/schedule flows unless it reuses them.
- Validation test: Campaign mission generates content task, approval-gated schedule task, and report task without scheduling before approval.

## 12. Reply Risk Triage Enhancer

- User problem: Reply workflows escalate risky comments, but operators need clearer risk reasons and recurring rule suggestions (`lib/agents/langchain/comment-agent.ts:245-312`, `lib/agents/graphs/comment-reply-workflow.ts:386-434`).
- Agent behavior: Classify crisis, legal, profanity, refund, competitor, and high-value lead comments; propose rule updates and safe templates.
- Workflow UI: Auto Replies approval queue gets risk chips, recurring pattern summaries, and "create rule draft".
- Data needed: comment events, reply rules, reply attempts, approvals, audit notes (`db/schema.ts:565`, `lib/replies/repository.ts`, `components/replies/approval-queue.tsx`).
- Integrations: Provider comment ingest/reply capability when available; mock for MVP.
- Trend leveraged: guardrails, approval workflows, agent memory.
- Implementation shape: Extend existing matcher/evaluation and approval item schema.
- Files likely touched: `lib/replies/matcher.ts`, `lib/agents/langchain/comment-agent.ts`, `lib/agents/graphs/comment-reply-workflow.ts`, `components/replies/*`, tests under `tests/replies` and `tests/agents/comment-workflow.test.ts`.
- MVP scope: Deterministic triage labels and rule-draft suggestions for repeated patterns.
- Stretch scope: Model-assisted risk summary and template generation.
- Monetization value: Safer premium customer engagement automation.
- Risk: Misclassification of sensitive replies could create brand/legal harm.
- Validation test: Crisis-like comments always require approval and never auto-send.

## 13. n8n Automation Pack Manager

- User problem: n8n event docs list recommended workflows, but there are no importable packs or in-app setup verification (`docs/archive/n8n/workflows.md:84-94`).
- Agent behavior: Recommend/installable automation pack templates for publish failure alerts, reply approval reminders, usage threshold alerts, and weekly reports.
- Workflow UI: Settings or Agents automation tab shows pack status, required secrets, sample payload test, and last callback.
- Data needed: n8n env config, event log, supported event names (`lib/env.ts:46-47`, `lib/n8n/events.ts:9-26`, `lib/n8n/event-log.ts:50-163`).
- Integrations: n8n webhook.
- Trend leveraged: MCP/tool ecosystem governance, background automation.
- Implementation shape: Add curated JSON/template docs and a signed test event endpoint.
- Files likely touched: `docs/archive/n8n/workflows.md` or new `docs/n8n-packs`, `lib/n8n/*`, `app/api/webhooks/n8n/route.ts`, settings UI, `tests/n8n/events.test.ts`.
- MVP scope: Pack documentation plus "send test event" and callback validation.
- Stretch scope: Importable n8n JSON pack files and UI-managed enablement.
- Monetization value: Premium automation setup for ops teams.
- Risk: Workflow templates can drift from n8n versions; keep them versioned.
- Validation test: Test event signs correctly, records `n8nEvents`, and callback rejects invalid signatures.

## 14. Workspace Agent Instruction Packs

- User problem: Agents need workspace-specific constraints, but those constraints are scattered across profile policy, brand memory, and mission inputs (`components/agents/agents-console.tsx:429-488`, `lib/brand-memory/proposals.ts:600-611`).
- Agent behavior: Compile a concise instruction packet per workspace: brand voice, provider constraints, approval rules, budget rules, allowed actions, and current launch caveats.
- Workflow UI: Agents console shows "Instruction packet" preview and version history; operators can approve changes.
- Data needed: brand memory, agent profiles/policies, connected provider capabilities, billing plan, docs/process notes if added (`db/schema.ts:674`, `db/schema.ts:746`, `lib/providers/connections.ts:325-378`, `lib/billing/usage.ts:379-414`).
- Integrations: None for MVP.
- Trend leveraged: AGENTS.md/project-local instruction trend, memory/state, governance.
- Implementation shape: Deterministic packet generator consumed by content/reply/mission agents.
- Files likely touched: `lib/agents/orchestration/server.ts`, `lib/agents/langchain/model-factory.ts`, `lib/brand-memory/proposals.ts`, `components/agents/agents-console.tsx`, tests under `tests/agents`.
- MVP scope: Read-only packet preview; no automatic agent behavior change.
- Stretch scope: Versioned approved packets injected into agent runs.
- Monetization value: Premium team governance and brand consistency.
- Risk: Stale packets could mislead agents; include generated-at and sources.
- Validation test: Packet reflects accepted memory and provider capability changes, excluding rejected proposals.

## 15. Provider Metrics Sync Agent

- User problem: Analytics aggregates internal activity but provider metrics/reach/engagement are unavailable until live adapters report them (`lib/agents/orchestration/executors.ts:988`, `lib/analytics/metrics.ts:345-421`).
- Agent behavior: For providers with metrics capability, schedule safe metric syncs, record unavailable states, and explain why metrics are missing.
- Workflow UI: Analytics platform table adds provider metrics status and "sync now" for supported providers.
- Data needed: provider capability matrix, connected accounts, publish attempt provider IDs, platform variants (`lib/providers/capabilities.ts:42-70`, `db/schema.ts:435`, `db/schema.ts:533`, `db/schema.ts:400`).
- Integrations: LinkedIn/Meta/X APIs as they support metrics.
- Trend leveraged: tools/connectors, governed external access.
- Implementation shape: Add metrics capability contract and per-provider implementation behind health checks.
- Files likely touched: `lib/providers/types.ts`, `lib/providers/linkedin.ts`, `lib/analytics/metrics.ts`, provider tests.
- MVP scope: Capability/status UI and mock metrics sync.
- Stretch scope: Live LinkedIn metrics ingestion and trend learning.
- Monetization value: Premium analytics and optimization.
- Risk: API permissions/rate limits and data freshness.
- Validation test: Unsupported providers display "unavailable" and never call metrics APIs.

## 16. Safe Social Post Visual QA Agent

- User problem: Media and platform constraints exist, but operators lack an automated visual QA pass for final previews (`lib/media/platform-constraints.ts`, `components/create/platform-preview-card.tsx`).
- Agent behavior: Review platform previews for text truncation, missing media, image dimension mismatch, policy warnings, and publish blockers before approval/schedule.
- Workflow UI: Review step adds "QA pass" with pass/warn/block badges per platform.
- Data needed: platform variants, media attachments, platform constraints, policy warnings (`db/schema.ts:400`, `db/schema.ts:292`, `lib/agents/tools/check-platform-policy.ts`).
- Integrations: Browser/computer use optional for screenshot verification; local component tests for MVP.
- Trend leveraged: computer use/browser harness, guardrails.
- Implementation shape: Deterministic QA service plus Playwright-backed optional visual snapshots.
- Files likely touched: `components/create/review-step.tsx`, `components/create/platform-preview-card.tsx`, `lib/media/platform-constraints.ts`, `tests/components/review-step.test.ts`, e2e tests.
- MVP scope: Rule-based QA from variant/media metadata.
- Stretch scope: Screenshot diff and layout inspection for previews.
- Monetization value: Reduces failed approvals and bad posts for teams.
- Risk: Browser automation should stay internal QA, not provider-login automation.
- Validation test: Variant with unsupported TikTok image media returns a warning/block consistent with existing policy tests (`tests/agents/tools.test.ts:76-125`).

## 17. Approval-Aware Schedule Optimizer

- User problem: Schedule suggestions exist, but scheduling approved variants still depends on user action and provider/account readiness (`lib/agents/tools/suggest-schedule.ts`, `app/api/posts/[id]/schedule/route.ts:164-311`).
- Agent behavior: Suggest the safest schedule slots for approved variants, explain provider/account/billing constraints, and prepare schedule requests for human confirmation.
- Workflow UI: Review and Calendar pages show "prepare schedule" with slots, conflicts, and required approvals.
- Data needed: content pack schedule suggestions, platform variants, connected accounts, usage limits, provider compatibility (`lib/agents/langchain/content-agent.ts:171-178`, `app/api/posts/[id]/schedule/route.ts:213-311`).
- Integrations: LinkedIn/mock first.
- Trend leveraged: human-in-the-loop durable workflows.
- Implementation shape: Reuse `createScheduledPost` only after explicit approval; add preflight planner.
- Files likely touched: `components/create/review-step.tsx`, `app/api/posts/[id]/schedule/route.ts`, `lib/scheduler/create-scheduled-post.ts`, `tests/api/schedule-post.test.ts`.
- MVP scope: Preflight schedule cards without auto-enqueue.
- Stretch scope: Batch approve and schedule all safe variants.
- Monetization value: Premium campaign operations speed.
- Risk: User may confuse prepared schedule with queued schedule; UI copy and state must be clear.
- Validation test: Incompatible provider/platform pair appears as blocked and cannot submit.

## 18. Agent Session Timeline Inspector

- User problem: Agents console shows tasks, policy events, simulations, and n8n events, but not a unified chronological trace with sources and causality (`components/agents/agents-console.tsx:1081-1236`).
- Agent behavior: Build a timeline from mission creation, simulation, policy events, task runs, approvals, n8n callbacks, and publish/reply attempts.
- Workflow UI: Mission detail has a "Timeline" tab with filters and export.
- Data needed: missions, task runs, policy events, simulations, n8n audit, publish/reply attempts (`lib/agents/orchestration/audit.ts:61-123`, `lib/n8n/event-log.ts:120-163`).
- Integrations: Optional session log URL if external agent runtimes are added.
- Trend leveraged: background agent traceability, governance exports.
- Implementation shape: New timeline aggregator and mission UI component.
- Files likely touched: `lib/agents/orchestration/audit.ts`, `components/agents/agents-console.tsx`, `lib/agents/governance-export.ts`, tests under `tests/agents`.
- MVP scope: Chronological in-app timeline from existing rows.
- Stretch scope: Diffable timeline export and anomaly highlights.
- Monetization value: Premium audit and debugging.
- Risk: Too much detail can overwhelm operators; default filters matter.
- Validation test: Fixture with mission, simulation, policy event, and n8n event sorts by timestamp and preserves source labels.

## 19. Source-Aware Campaign Research Agent

- User problem: Content generation accepts `sources`, but there is no governed source ingestion or source-quality review surface (`lib/agents/langchain/content-agent.ts:131-146`, `lib/agents/tools/research-topic.ts`).
- Agent behavior: Collect source snippets or user-provided links, summarize claims, flag unsupported assertions, and require source approval before generation.
- Workflow UI: Create flow adds "Sources" step with accepted/rejected source cards and citation requirements.
- Data needed: source URLs/text, content agent input, agent run trace, content pack sources (`lib/agents/schemas/content-pack.ts:52-53`, `components/create/brief-form.tsx`).
- Integrations: Future MCP/web search connectors; no external source ingestion for MVP.
- Trend leveraged: MCP/tool discovery, sandbox/file agents, guardrails.
- Implementation shape: Store source evidence in content pack metadata or new source table; gate generation on approved source set.
- Files likely touched: `lib/agents/schemas/content-pack.ts`, `lib/agents/langchain/content-agent.ts`, `components/create/brief-form.tsx`, `components/create/review-step.tsx`, tests under `tests/agents`.
- MVP scope: Manual source cards and source-aware content pack output.
- Stretch scope: MCP-connected Google Drive/Docs/web research.
- Monetization value: Premium defensible content workflows.
- Risk: Source ingestion introduces prompt-injection risk; sanitize and summarize structured fields only.
- Validation test: Rejected source is excluded from generated content pack sources and audit trail.

## 20. Agent Marketplace Readiness Scanner

- User problem: The repo has role templates and missions, but no way to package a repeatable agent workflow as a shareable, governed template (`lib/agents/orchestration/role-templates.ts:16-205`, `components/agents/agents-console.tsx:73-102`).
- Agent behavior: Analyze a mission/profile/policy bundle, verify required providers, approvals, billing features, tests, and n8n events, then produce a "template readiness" report.
- Workflow UI: Agents console adds "Save as template" and "scan readiness" for internal template reuse.
- Data needed: mission, profiles, policy, provider capabilities, billing plan, approval requirements (`db/schema.ts:746-907`, `lib/providers/capabilities.ts:42-70`, `lib/billing/entitlements.ts:29-57`).
- Integrations: Optional future marketplace/export.
- Trend leveraged: managed agents/templates, project-local instruction packs, governance.
- Implementation shape: Template schema and readiness validator; no public marketplace for MVP.
- Files likely touched: `lib/agents/schemas/orchestration.ts`, `lib/agents/orchestration/role-templates.ts`, `components/agents/agents-console.tsx`, `tests/agents/orchestration.test.ts`.
- MVP scope: Internal template scanner and export JSON.
- Stretch scope: Workspace template library and paid template packs.
- Monetization value: Premium repeatable operations and agency playbooks.
- Risk: Premature marketplace could distract from core provider/analytics reliability.
- Validation test: Template requiring live provider publishing fails readiness unless plan and provider health support it.

## Ideas Dropped As Too Weak

- Generic chat-with-your-dashboard bot: duplicates existing surfaces and would not leverage the approval/publishing/worker architecture.
- Fully autonomous social posting: conflicts with existing human review, provider risk, and policy guardrails (`docs/archive/specs/04-langchain-agent-system.md:59-62`).
- Browser-login provider automation: conflicts with the provider integration spec's official-API constraint (`docs/archive/specs/06-provider-integrations.md:56`).
