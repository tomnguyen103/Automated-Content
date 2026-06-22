# AI-Agent Feature Master Update Plan

Last updated: 2026-06-22

## Purpose

This plan turns the 2026 AI-agent roadmap into an implementation-ready delivery sequence for Automated-Content. The product direction is a governed social-content operations platform: missionized agents that research, generate, schedule, publish, triage replies, recover failures, report outcomes, learn from approvals, and enforce cost/safety controls.

The repo already has the important foundation:

- LangGraph content workflow and approval checkpointing in `lib/agents/graphs/content-workflow.ts` and `app/api/agent-runs/[id]/approval/route.ts`.
- Agent mission orchestration in `lib/agents/orchestration/planner.ts`, `runner.ts`, `executors.ts`, `policy.ts`, `repository.ts`, and `simulation.ts`.
- Existing mission simulation storage, API, UI, and tests via `agent_mission_simulations`, `app/api/agents/missions/[id]/simulate/route.ts`, `components/agents/agents-console.tsx`, and `tests/agents/orchestration.test.ts`.
- Durable scheduling and worker execution in `lib/scheduler/create-scheduled-post.ts`, `lib/scheduler/enqueue.ts`, `workers/social-worker.ts`, and `workers/jobs/publish-post.ts`.
- Reply automation in `lib/agents/graphs/comment-reply-workflow.ts` and `lib/replies/*`.
- Analytics and usage in `lib/analytics/metrics.ts` and `lib/billing/usage.ts`.
- n8n event infrastructure in `lib/n8n/client.ts`, `lib/n8n/events.ts`, and `app/api/webhooks/n8n/route.ts`.

## Strategic Implementation Rules

- Preserve human approval for publishing and non-keyword replies until provider, policy, and audit surfaces prove safe.
- Extend existing service boundaries instead of bypassing them.
- Treat current simulation as an existing rail to harden and productize, not as a new feature from scratch.
- Keep all irreversible external actions behind policy checks, provider capability checks, and explicit approval where required.
- Keep provider-scaffold limitations visible in the UI and reports; do not imply live provider readiness where adapters are still stubs.
- Make every agent action inspectable through task runs, policy events, simulation runs, usage records, provider outcomes, and n8n events.
- Every PR must be non-draft only after local gates pass and self-review is complete.

## Local Verification Gates

Run these before opening each PR:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

Run this when a task changes dashboard/create/agent UI flows:

```powershell
npm run test:e2e
```

Run this when schema changes are made:

```powershell
npm run db:generate
npm test -- tests/agents/orchestration.test.ts tests/api/agent-mission-run.test.ts
```

## PR Strategy

Ship as 4 meaningful PRs:

1. Agent control plane hardening.
2. Scheduling and provider readiness.
3. Differentiated agent workflows.
4. Memory, budgets, and governance.

Do not batch all phases into one PR. The review surface spans agents, scheduler, providers, replies, analytics, billing, n8n, and UI.

Each PR is done only when:

- Local gates pass.
- Full diff has been self-reviewed.
- Non-draft PR is opened.
- CI is green.
- CodeRabbit review body and inline comments are read.
- Every actionable CodeRabbit finding is fixed or explicitly dismissed with a reason.

## Phase 1: Agent Control Plane Hardening

Goal: turn the existing mission orchestration and simulation system into a trustworthy agent runtime surface.

### Task 1.1: Productize Mission Simulation

Description: Improve the existing mission simulation system so users can clearly preview planned actions, policy outcomes, side effects suppressed, and estimated usage before execution.

Dependencies: None. This is the best first task because `simulation.ts`, schema, route, console UI, and tests already exist.

Likely files:

- `lib/agents/orchestration/simulation.ts`
- `lib/agents/schemas/orchestration.ts`
- `lib/agents/orchestration/repository.ts`
- `app/api/agents/missions/[id]/simulate/route.ts`
- `components/agents/agents-console.tsx`
- `tests/agents/orchestration.test.ts`
- `tests/api/agent-mission-run.test.ts`

Implementation notes:

- Keep simulation side-effect-free.
- Add clearer simulation summary fields if needed, such as `riskLevel`, `approvalRequiredCount`, `blockedReasonCount`, `providerReadinessWarnings`, and `promotable`.
- Ensure simulated `content.publish`, `content.schedule`, and `reply.send` actions never invoke scheduler, queue, provider, reply sender, or usage ledger writes.
- Surface policy details per planned action, not only aggregate counts.
- Make "Run" visually distinct from "Simulate" so users do not confuse preview with execution.

Acceptance criteria:

- A mission simulation records planned actions, policy events, estimated usage, and suppressed side effects.
- Simulation never creates task runs, scheduled jobs, publish enqueues, reply sends, provider calls, or usage ledger writes.
- Simulation output is visible in Agents console with per-action status and policy message.
- Errors are persisted and shown without crashing the console.

Verification:

```powershell
npm test -- tests/agents/orchestration.test.ts tests/api/agent-mission-run.test.ts
npm run lint
npm run typecheck
```

### Task 1.2: Add Mission Audit Detail View

Description: Add an inspectable mission detail panel or section that combines tasks, policy events, simulations, usage estimates, errors, and n8n events.

Dependencies: Task 1.1.

Likely files:

- `components/agents/agents-console.tsx`
- `app/(dashboard)/agents/page.tsx`
- `app/api/agents/missions/route.ts`
- `lib/agents/orchestration/repository.ts`
- `lib/n8n/events.ts`
- `tests/agents/orchestration.test.ts`

Implementation notes:

- Prefer a mission detail drawer or expandable row over creating a separate route unless the current page becomes too dense.
- Show timeline order: mission created, simulation run, policy events, task runs, n8n events, completion/failure.
- Redact secrets and provider tokens.
- Include task output summaries but avoid dumping unbounded JSON into the UI.

Acceptance criteria:

- User can inspect what an agent did, why a policy blocked/reviewed an action, what it estimated/spent, and what needs attention.
- Failed missions display error, failed task, and next recommended action.
- Simulation and execution history are separated but comparable.

Verification:

```powershell
npm test -- tests/agents/orchestration.test.ts
npm run lint
npm run typecheck
npm run build
```

### Task 1.3: Safe Autonomy Defaults

Description: Change default agent profile/mission behavior so publish actions and non-keyword replies are supervised unless explicitly escalated.

Dependencies: Task 1.1.

Likely files:

- `lib/agents/orchestration/role-templates.ts`
- `lib/agents/orchestration/policy.ts`
- `lib/agents/orchestration/planner.ts`
- `components/agents/agents-console.tsx`
- `tests/agents/orchestration.test.ts`
- `tests/agents/comment-workflow.test.ts`

Implementation notes:

- Default new missions to a supervised autonomy tier for external actions.
- Keep existing full-autonomy test paths if explicitly configured, but make UI defaults safer.
- Define autonomy tiers in policy if not already expressive enough:
  - `draft_only`
  - `recommend`
  - `schedule_with_approval`
  - `publish_with_approval`
  - `autonomous_with_policy`
- Non-keyword replies should require approval unless a rule match and confidence threshold make them safe under explicit policy.

Acceptance criteria:

- Newly created publish/reply missions do not send external actions by default.
- Policy evaluation returns `require_review` for supervised external actions.
- Tests cover default mission creation, simulation, and execution behavior.

Verification:

```powershell
npm test -- tests/agents/orchestration.test.ts tests/agents/comment-workflow.test.ts
npm run lint
npm run typecheck
```

### Phase 1 Checkpoint

- Simulation is trusted and visible.
- Mission audit trail is useful enough for a founder/operator.
- Default external autonomy is supervised.
- Local gates pass.
- Open PR 1: `Agent control plane hardening`.

## Phase 2: Scheduling And Provider Readiness

Goal: close the gap between approved content, durable scheduling, and provider-safe execution.

### Task 2.1: Schedule Approved Variants Assistant

Description: Add a direct post-approval scheduling action so approved variants can be scheduled through existing durable scheduler rails.

Dependencies: Phase 1.

Likely files:

- `app/api/agent-runs/[id]/approval/route.ts`
- `app/api/posts/[id]/schedule/route.ts`
- `components/create/approval-panel.tsx`
- `components/create/review-step.tsx`
- `lib/scheduler/create-scheduled-post.ts`
- `lib/agents/graphs/content-workflow.ts`
- `tests/api/ai-generate.test.ts`
- `tests/api/schedule-post.test.ts`
- `tests/components/review-step.test.ts`

Implementation notes:

- Add "Schedule approved variants" only after approval is complete.
- Require explicit confirmation for schedule creation.
- Use existing schedule suggestions from the content workflow where available.
- Validate provider, platform, connected account, scheduled time, and policy before writing schedule rows.
- Preserve durable-first behavior: DB schedule row before BullMQ enqueue.

Acceptance criteria:

- Approved variants can be scheduled from Create/review flow.
- Unapproved variants cannot be scheduled.
- Unsupported provider/account/platform combinations return actionable errors.
- Queue enqueue failure leaves durable schedule state visible.

Verification:

```powershell
npm test -- tests/api/schedule-post.test.ts tests/components/review-step.test.ts tests/agents/content-workflow.test.ts
npm run lint
npm run typecheck
npm run build
```

### Task 2.2: Provider Health Sentinel

Description: Add provider/account readiness checks and expose them in Connections, scheduling, simulation, and mission audit.

Dependencies: Task 2.1 can run before or in parallel after API contract is defined.

Likely files:

- `lib/providers/types.ts`
- `lib/providers/capabilities.ts`
- `lib/providers/registry.ts`
- `lib/providers/platform-compatibility.ts`
- `lib/providers/errors.ts`
- `app/(dashboard)/connections/page.tsx`
- `components/agents/agents-console.tsx`
- `tests/providers/provider-contract.test.ts`
- `tests/workers/publish-post.test.ts`

Implementation notes:

- Add a normalized provider health result:
  - provider key
  - connected account id
  - configured/unconfigured
  - required scopes
  - capability matrix
  - last checked
  - blocking reason
- Mock provider should be healthy in local preview.
- Scaffold providers should honestly report configuration-required or unsupported operations.
- Feed health warnings into simulation planned actions and scheduler validation.

Acceptance criteria:

- Connections page shows provider readiness and configuration gaps.
- Scheduling/publishing blocks when provider is incapable or account is not ready.
- Simulation shows provider readiness warnings without executing provider calls.

Verification:

```powershell
npm test -- tests/providers/provider-contract.test.ts tests/workers/publish-post.test.ts
npm run lint
npm run typecheck
```

### Task 2.3: Publish Failure Recovery Agent

Description: Classify failed publish jobs and provide safe recovery actions such as retry, reschedule, reconnect provider, or leave for manual review.

Dependencies: Task 2.2.

Likely files:

- `workers/jobs/publish-post.ts`
- `lib/scheduler/queue-overview.ts`
- `lib/scheduler/create-scheduled-post.ts`
- `lib/agents/orchestration/executors.ts`
- `components/agents/agents-console.tsx`
- Calendar/dashboard components
- `tests/workers/publish-post.test.ts`
- `tests/scheduler/create-scheduled-post.test.ts`

Implementation notes:

- Add failure categories:
  - provider_config
  - provider_capability
  - token_scope
  - queue_enqueue
  - provider_transient
  - provider_permanent
  - policy_block
  - content_invalid
- Do not auto-retry permanent/provider-capability failures.
- Retry transient failures only when idempotency and duplicate-send protection are proven.
- Add recovery recommendations to audit panel.

Acceptance criteria:

- Failed publishes are classified and visible.
- Retry/reschedule actions do not duplicate sends.
- Provider mismatch remains blocked using persisted DB state as source of truth.

Verification:

```powershell
npm test -- tests/workers/publish-post.test.ts tests/scheduler/create-scheduled-post.test.ts
npm run lint
npm run typecheck
```

### Phase 2 Checkpoint

- Approved content can flow to durable scheduling.
- Provider readiness is visible and blocks unsafe operations.
- Publish failures are diagnosable.
- Local gates pass.
- Open PR 2: `Scheduling and provider readiness`.

## Phase 3: Differentiated Agent Workflows

Goal: build the features that make the product feel like a real AI-agent operating layer, not just individual automations.

### Task 3.1: Supervised Campaign Autopilot Mission

Description: Build a campaign mission that performs research, strategy, content generation, safety review, approval, schedule suggestions, and reporting as one governed workflow.

Dependencies: Phase 1 and Task 2.1.

Likely files:

- `lib/agents/orchestration/planner.ts`
- `lib/agents/orchestration/executors.ts`
- `lib/agents/orchestration/runner.ts`
- `lib/agents/graphs/content-workflow.ts`
- `lib/agents/schemas/orchestration.ts`
- `components/agents/agents-console.tsx`
- `tests/agents/orchestration.test.ts`
- `tests/agents/content-workflow.test.ts`

Implementation notes:

- Reuse existing roles: researcher, strategist, remixer, publisher, reporter.
- Add a campaign-specific mission preset rather than a broad workflow builder.
- Stop at approval before scheduling/publishing.
- Feed generated variants and schedule suggestions into Task 2.1 scheduling action.

Acceptance criteria:

- User can create a supervised campaign mission from Agents console.
- Mission produces research summary, strategy plan, generated variants, policy status, and schedule suggestions.
- Publishing/scheduling requires approval.
- Simulation accurately previews the campaign actions.

Verification:

```powershell
npm test -- tests/agents/orchestration.test.ts tests/agents/content-workflow.test.ts
npm run lint
npm run typecheck
npm run build
```

### Task 3.2: Weekly Operator Report Agent

Description: Generate a weekly report from analytics, scheduled posts, publish failures, replies, usage, simulations, agent runs, and policy events.

Dependencies: Phase 1.

Likely files:

- `lib/agents/orchestration/executors.ts`
- `lib/analytics/metrics.ts`
- `components/agents/agents-console.tsx`
- `lib/n8n/events.ts`
- `tests/analytics/metrics.test.ts`
- `tests/agents/orchestration.test.ts`
- `tests/n8n/events.test.ts`

Implementation notes:

- Existing `executeReport` already builds a report summary; extend it into a better product artifact.
- Keep all dates UTC-safe.
- Include clear caveats when provider metrics are unavailable.
- Add optional n8n reminder/dispatch event for report completion.

Acceptance criteria:

- Weekly report includes posting, replies, failures, usage, agent runs, simulations, and next recommended actions.
- Report handles missing provider metrics honestly.
- Report can be generated on demand from a mission.

Verification:

```powershell
npm test -- tests/analytics/metrics.test.ts tests/agents/orchestration.test.ts tests/n8n/events.test.ts
npm run lint
npm run typecheck
```

### Task 3.3: Autonomous Comment Triage

Description: Classify inbound comments, auto-handle safe rule matches, and queue risky replies for approval.

Dependencies: Task 1.3.

Likely files:

- `lib/agents/graphs/comment-reply-workflow.ts`
- `lib/replies/repository.ts`
- `lib/replies/matcher.ts`
- `lib/replies/approval.ts`
- `lib/replies/audit.ts`
- `app/api/replies/run/route.ts`
- `app/api/replies/approvals/[id]/route.ts`
- `tests/agents/comment-workflow.test.ts`
- `tests/replies/repository.test.ts`
- `tests/api/reply-approval.test.ts`

Implementation notes:

- Add triage labels:
  - safe_rule_match
  - needs_human_review
  - blocked_policy
  - crisis_escalation
  - duplicate_or_rate_limited
- Non-keyword generated replies should default to approval.
- Crisis/legal/refund/brand-risk comments should never auto-send.
- Preserve duplicate-send protection through approval claiming.

Acceptance criteria:

- Comment processing produces triage labels and approval decisions.
- Safe rule matches respect caps and dedupe.
- Risky comments land in approval queue with reason.
- Crisis comments trigger blocked/escalation event.

Verification:

```powershell
npm test -- tests/agents/comment-workflow.test.ts tests/replies/repository.test.ts tests/api/reply-approval.test.ts
npm run lint
npm run typecheck
```

### Phase 3 Checkpoint

- Product has a differentiated supervised campaign agent.
- Weekly report agent turns operations into actions.
- Comment triage is safer and more useful.
- Local gates pass.
- Open PR 3: `Supervised campaign, reporting, and triage agents`.

## Phase 4: Learning, Governance, And Monetization

Goal: turn operational trust into product retention, paid tiers, and agency/team value.

### Task 4.1: Brand Voice Memory Curator

Description: Learn from approved edits and propose reviewed brand-memory/profile updates.

Dependencies: Phase 3.

Likely files:

- `db/schema.ts`
- new migration under `db/migrations`
- `lib/agents/graphs/content-workflow.ts`
- `lib/agents/orchestration/repository.ts`
- `components/create/review-step.tsx`
- `components/agents/agents-console.tsx`
- `tests/agents/content-workflow.test.ts`
- `tests/components/review-step.test.ts`

Implementation notes:

- Do not let agents self-modify active brand rules.
- Store proposals with evidence:
  - original text
  - edited text
  - inferred rule
  - confidence
  - scope: workspace, platform, profile, or campaign
  - status: pending, accepted, rejected
- Apply only accepted memory rules to future generation.

Acceptance criteria:

- User sees proposed brand memory updates from approved edits.
- User can accept/reject each proposal.
- Rejected suggestions do not affect future outputs.
- Accepted suggestions are scoped and auditable.

Verification:

```powershell
npm run db:generate
npm test -- tests/agents/content-workflow.test.ts tests/components/review-step.test.ts
npm run lint
npm run typecheck
```

### Task 4.2: Usage Budget Optimizer

Description: Add mission-level budgets, estimated vs actual usage, and recommendations to reduce waste.

Dependencies: Phase 1 and Task 3.2.

Likely files:

- `lib/billing/usage.ts`
- `lib/billing/entitlements.ts`
- `lib/agents/orchestration/policy.ts`
- `lib/agents/orchestration/simulation.ts`
- `lib/analytics/metrics.ts`
- `components/agents/agents-console.tsx`
- `tests/billing/usage.test.ts`
- `tests/analytics/usage-chart.test.ts`
- `tests/agents/orchestration.test.ts`

Implementation notes:

- Use existing `modelBudgetCents` policy path where possible.
- Show estimated cost from simulation and actual usage from ledger.
- Add per-mission budget stop reasons to policy events.
- Avoid presenting local estimated cost as real billing.

Acceptance criteria:

- Missions can define a budget cap.
- Simulation shows estimated usage against cap.
- Execution blocks when policy budget is exceeded.
- Reports show high-cost/low-output mission recommendations.

Verification:

```powershell
npm test -- tests/billing/usage.test.ts tests/analytics/usage-chart.test.ts tests/agents/orchestration.test.ts
npm run lint
npm run typecheck
```

### Task 4.3: Governance Export

Description: Export approval history, simulations, task runs, policy events, provider outcomes, and usage records for team/agency review.

Dependencies: Phase 1 and Task 3.2.

Likely files:

- `lib/agents/orchestration/repository.ts`
- `lib/analytics/metrics.ts`
- new API route under `app/api/agents/governance-export/route.ts`
- `components/agents/agents-console.tsx`
- `tests/api`
- `tests/agents/orchestration.test.ts`

Implementation notes:

- Scope export to current workspace.
- Redact secrets, tokens, provider credentials, and raw webhook signatures.
- Prefer JSON first; CSV can be stretch scope.
- Include enough metadata to support a compliance/customer-review story.

Acceptance criteria:

- User can export a workspace-scoped governance bundle.
- Bundle includes mission, simulation, task, policy, approval, usage, n8n, and provider outcome summaries.
- Export never includes secrets.

Verification:

```powershell
npm test -- tests/agents/orchestration.test.ts
npm run lint
npm run typecheck
npm run build
```

### Phase 4 Checkpoint

- Brand learning is human-reviewed.
- Agent cost controls are visible and enforceable.
- Governance export supports paid team/agency positioning.
- Local gates pass.
- Open PR 4: `Memory, budgets, and governance`.

## Optional Phase 5: Provider Productionization

Goal: make one real provider production-ready instead of spreading effort across all scaffolded adapters.

Recommended first provider: choose one based on business priority. If no decision exists, start with LinkedIn for B2B content operations.

Tasks:

1. Implement OAuth/token refresh for the chosen provider.
2. Implement publish adapter.
3. Implement account health and capability validation.
4. Implement reply and metrics only if official API access supports them.
5. Add provider-specific contract tests and local failure simulations.
6. Update Connections UI to clearly distinguish live, mock, and scaffold providers.

Acceptance criteria:

- One provider can connect, validate, publish, handle provider errors, and record attempts.
- Provider failures are visible in recovery agent and weekly report.
- No scaffold provider is presented as live.

## Cross-Cutting Test Matrix

| Area | Required tests |
|---|---|
| Simulation | `tests/agents/orchestration.test.ts`, `tests/api/agent-mission-run.test.ts` |
| Agent UI | component tests plus `npm run test:e2e` when flows change |
| Scheduling | `tests/api/schedule-post.test.ts`, `tests/scheduler/create-scheduled-post.test.ts` |
| Workers | `tests/workers/publish-post.test.ts` |
| Providers | `tests/providers/provider-contract.test.ts`, `tests/providers/token-vault.test.ts` |
| Replies | `tests/agents/comment-workflow.test.ts`, `tests/replies/repository.test.ts`, `tests/api/reply-approval.test.ts` |
| Analytics | `tests/analytics/metrics.test.ts`, `tests/analytics/usage-chart.test.ts` |
| Billing | `tests/billing/usage.test.ts`, `tests/billing/entitlements.test.ts` |
| n8n | `tests/n8n/events.test.ts` |

## Risks And Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Provider adapters remain scaffold-only | High | Keep provider health explicit; productize mock/simulation safely; implement one real provider later. |
| Autonomous replies create brand/legal risk | High | Default non-keyword replies to approval; crisis labels block auto-send. |
| Simulation is confused with execution | Medium | UI labels, separate history, and explicit side-effects-suppressed copy. |
| BullMQ worker deployment is not production-ready | High | Keep durable schedule rows; expose enqueue status; document worker runtime requirement. |
| Usage is consumed before downstream side effects | Medium | Audit usage paths per task; record actual vs estimated; make idempotency source IDs explicit. |
| Agent audit logs leak sensitive data | High | Redact tokens/secrets/webhook signatures; limit raw JSON display. |
| Multi-agent campaign workflow increases cost/latency | Medium | Add budget caps, simulation estimates, and task-level evals. |

## Do Not Build Yet

- Fully autonomous real-provider publishing across all platforms.
- Fully autonomous replies to all comments.
- Public n8n workflow builder.
- Browser-based social posting or scraping.
- MCP everywhere.
- A2A integration before a concrete enterprise partner/customer need.
- Agents that self-modify policies, caps, provider scopes, or brand memory.

## Open Product Decisions

- First customer segment: solo creator, SMB, agency, or enterprise marketing team?
- First real provider: LinkedIn, X, Meta, Slack, or Discord?
- Should all publish and non-keyword reply missions default to supervised mode?
- Should n8n be audit/reminder infrastructure or a broader workflow control plane?
- What runtime will host BullMQ workers separately from the Next.js app?
- Is the Create-to-schedule gap intentionally deferred, or should it be closed immediately?
- What billing path will replace disabled upgrade/invoice controls?
- Should brand memory be workspace-wide, per-platform, per-agent-profile, or campaign-specific?

## Implementation Prompts

### PR 1 Prompt

```text
Implement PR 1: Agent control plane hardening for Automated-Content. Start with the existing simulation system, not a new one. Read lib/agents/orchestration/simulation.ts, planner.ts, runner.ts, policy.ts, repository.ts, components/agents/agents-console.tsx, app/api/agents/missions/[id]/simulate/route.ts, and tests/agents/orchestration.test.ts. Productize simulation visibility, add mission audit detail, and make publish/non-keyword reply defaults supervised. Run lint, typecheck, tests, build, then open a non-draft PR only after self-review.
```

### PR 2 Prompt

```text
Implement PR 2: Scheduling and provider readiness for Automated-Content. Build the Schedule Approved Variants Assistant, Provider Health Sentinel, and Publish Failure Recovery Agent using existing scheduler, provider, worker, and agent orchestration boundaries. Preserve durable-first scheduling and avoid treating scaffold providers as live. Run lint, typecheck, tests, build, and e2e if dashboard/create flows changed.
```

### PR 3 Prompt

```text
Implement PR 3: Differentiated agent workflows for Automated-Content. Add Supervised Campaign Autopilot, improve Weekly Operator Report Agent, and add Autonomous Comment Triage. Keep publishing and non-keyword replies approval-gated. Add focused tests for orchestration, analytics, reply workflows, and n8n events. Open a non-draft PR only after local gates and self-review pass.
```

### PR 4 Prompt

```text
Implement PR 4: Memory, budgets, and governance for Automated-Content. Add human-reviewed Brand Voice Memory Curator, Usage Budget Optimizer, and Governance Export. Keep brand/policy changes approval-based, redact sensitive data, and prove budget enforcement through tests. Run db generation if schema changes, then lint, typecheck, tests, and build.
```

## Final Definition Of Done

- All four PRs are merged or ready for human merge.
- Local gates and CI are green.
- CodeRabbit review findings are resolved.
- Simulation and audit surfaces prove side-effect boundaries.
- Approved variants can be scheduled through durable rails.
- Provider health prevents unsafe publish/reply operations.
- Campaign, report, and triage agents are useful under supervised autonomy.
- Brand memory changes are human-reviewed.
- Usage budgets are visible and enforceable.
- Governance exports are tenant-scoped and secret-safe.
