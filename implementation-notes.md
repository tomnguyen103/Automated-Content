# Mission Simulation Sandbox Implementation Notes

## Decisions

- Added a dedicated `agent_mission_simulations` table instead of storing simulation output only on `agent_missions.result`. Simulations are repeatable audit artifacts, so keeping a history per mission avoids overwriting prior dry runs.
- Stored `plannedActions`, `policyEvents`, and `estimatedUsage` together on each simulation row. Policy events are also recorded in the existing policy event log with `details.simulation = true` so the activity feed can show dry-run policy outcomes without creating task runs.
- Implemented simulation as a planner and policy pass in `lib/agents/orchestration/simulation.ts`. It intentionally stops before `MissionTaskExecutor`, which is where scheduling, publishing, usage consumption, and reply workflows can create side effects.
- The simulation API is separate from the run API: `POST /api/agents/missions/[id]/simulate`. This keeps dry-run behavior independent from the production mission queue path.
- Added `agent.mission.simulated` to the typed event list for local observability. It is not forwarded through the n8n agent event set, because a no-side-effects simulation should not trigger external automation.
- Mission-level policy denials now stop task planning, matching `runAgentMission`. The simulation still succeeds as a preview artifact, but it records only the mission-level policy event and zero task actions.
- Runtime simulation errors are persisted as `failed` simulation rows whenever the mission is known. The API returns that failed simulation payload so the console can show the error without confusing it with queued execution work.

## Tradeoffs

- Usage estimates are deterministic approximations based on mission type, platforms, variant ids, and comment limits. They are counted only for actions policy allows to run, are not billing records, and should be treated as planning estimates only.
- Simulation runs do not create `agent_task_runs`; planned actions live in the simulation row. This avoids making dry-run actions look executable or retryable in the task history.
- For publish simulations, the sandbox estimates scheduled-job writes and publish queue enqueues as suppressed side effects. It does not validate provider token health because that would cross into live integration behavior.
- For reply simulations, the sandbox estimates provider reply sends and usage writes from `maxComments` capped by policy. It does not read or mutate the reply inbox.
- Failed simulation persistence is best-effort. If the simulation history repository itself is unavailable, the thrown error includes both the original simulation failure and the persistence failure.

## Verification Notes

- Regression tests assert that publish simulations never invoke scheduling or publish executors.
- Regression tests assert that comment engagement simulations never invoke reply send executors.
- Regression tests assert that mission-level policy denials do not create planned task actions or usage estimates.
- Regression tests assert that failed simulation rows are persisted when policy event recording fails.
- The Agents console reads recent simulation runs alongside missions, tasks, and policy events, and exposes a `Simulate` action per mission.
- The Agents console now shows failed simulation errors, mission-level policy messages for zero-action previews, and per-action policy messages for planned actions.

## Review Follow-up

- CodeRabbit flagged brittle string matching in the simulation route, so `simulateAgentMission` now throws a typed `AgentMissionNotFoundError`.
- CodeRabbit flagged a possible partial success state when policy event persistence fails. The runner now records simulation policy events before saving the simulation run as succeeded.
- CodeRabbit suggested the simulation history index should match the repository query shape, so the table now includes a `(workspace_id, mission_id, created_at)` index.

# AI-Agent Roadmap 2026 Batch 1 Implementation Notes

## 2026-06-23 Starting Context

- Created branch `codex/agent-roadmap-batch-1-provider-campaign-approval` from `main` at `9448c84a1f3a11328f6b75e98fc8d83783018cc8`; local `main` matched `origin/main` and `gh pr list --state open` returned no open PR rows.
- Treating `docs/ai-agent-feature-roadmap-2026.md`, `docs/ai-agent-feature-goal-prompts-2026.md`, and the matching `docs/README.md` links as user-provided scope artifacts even though they were local/untracked or modified at start.
- Initial grep showed Batch 1 is partly implemented already: `supervised_campaign` exists in schema/planner/UI/tests, provider readiness labels exist in Connections and Agents, and simulation readiness warnings already appear in orchestration tests. I am doing an acceptance-criteria gap audit before adding new code so we do not create duplicate control-plane concepts.
- Decision: prefer existing read models and repositories first. No new schema unless the unified approval queue cannot safely aggregate current content, reply, brand-memory, policy, or mission decision sources.
- UI design read: operational B2B SaaS dashboard for content operators and team leads, with a quiet utility-first interface. I will keep density useful, labels plain, and avoid marketing-style visual flourishes.

## Batch 1 Decisions And Changes

- Provider readiness: `app/api/posts/[id]/schedule/route.ts` already blocked unready providers before scheduling, but `lib/scheduler/create-scheduled-post.ts` did not have a defensive preflight parameter. I added `providerHealth` plus `ProviderReadinessError` so any direct caller can fail closed before usage reservation, schedule row insertion, or queue enqueue.
- Autonomous mission execution: `createAutonomousMissionTaskExecutor` could call `createScheduledPost` without the public schedule API's provider/account checks. I added a provider-readiness gate before usage consumption and schedule writes. The executor can use mission-input account snapshots for simulations/local preview and database connected-account rows for live execution.
- Tradeoff: I kept provider readiness as a runtime check instead of persisting a new provider-health history table. The roadmap calls history a stretch item, and current acceptance criteria are hard blocks plus actionable warnings.
- Approval Command Center: implemented a read model over existing sources instead of adding an `approval_items` table. The queue aggregates pending reply approvals, pending brand-memory proposals, pending content workflow checkpoints, and agent policy/provider/budget escalations with source deep links.
- Local preview resilience: content workflow checkpoint aggregation is best-effort. If a preview database is configured but missing the current `workflow_checkpoints` table, `/approvals` logs a warning and still renders reply, brand-memory, and agent policy decisions instead of failing the whole page.
- Redaction: the command-center read model intentionally exposes summarized details and reason strings only. It does not copy raw comment text, edited/original brand-memory text, provider token refs, webhook signatures, or provider responses into the aggregate queue.
- UI: added `/approvals`, a sidebar nav item, URL filters, stats, and deep links back to Agents, Auto Replies, Brand Memory, or Create. Mission cards now have stable `#mission-...` anchors for policy-event deep links.
- Verification so far: focused tests passed for scheduler, orchestration, approvals, schedule API, provider contracts, LinkedIn provider behavior, and publish worker preflight/classification.

## Batch 1 Verification Closeout

- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm test` passed with 45 files and 189 tests after the CodeRabbit follow-up regression was added.
- `npm audit --omit=dev --audit-level=high` found 0 vulnerabilities.
- `git diff --check` passed; it reported only Windows CRLF checkout warnings.
- `npm run build` passed and included `/approvals` plus `/api/approvals` in the route manifest.
- `npm run test:e2e` initially hit a transient Chromium `Page.captureScreenshot` protocol error in the existing Brand Memory desktop test after all page assertions passed. A clean rerun passed all 22 Playwright tests, including the new Approval Command Center desktop and mobile coverage.
- `npm run worker` reached the expected local `QueueConfigurationError: REDIS_URL is required to enqueue publishing jobs.` boundary. It did not fail from import resolution, `server-only`, or provider/orchestration wiring.

## CodeRabbit Review Follow-up

- Normalized blank `platform` and `missionId` query params to `undefined` on both `/approvals` and `/api/approvals` so empty query strings do not act as active filters.
- Removed machine-specific local paths from the 2026 roadmap and prompt-pack docs so the artifacts remain portable.
- Limited mission-input connected-account snapshots to local preview/memory execution. Non-preview autonomous scheduling must now derive provider readiness from durable connected-account state and blocks snapshot-only payloads.
- Added provider-key validation when converting agent policy-event details into Approval Command Center items.
- Removed a duplicate current-user lookup from the approvals API route; the shared orchestration context resolver remains the single auth/workspace source for that request.
- Extended the non-preview provider snapshot regression to assert the blocked `provider_readiness` policy event is persisted, matching the surrounding orchestration test pattern.
- Re-ran the full local gate stack after the review fixes: `npm run lint`, `npm run typecheck`, `npm test`, `npm audit --omit=dev --audit-level=high`, `git diff --check`, `npm run build`, `npm run test:e2e`, and the expected-boundary `npm run worker` smoke.
