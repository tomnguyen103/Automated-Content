# Mission Simulation Sandbox Implementation Notes

## Decisions

- Added a dedicated `agent_mission_simulations` table instead of storing simulation output only on `agent_missions.result`. Simulations are repeatable audit artifacts, so keeping a history per mission avoids overwriting prior dry runs.
- Stored `plannedActions`, `policyEvents`, and `estimatedUsage` together on each simulation row. Policy events are also recorded in the existing policy event log with `details.simulation = true` so the activity feed can show dry-run policy outcomes without creating task runs.
- Implemented simulation as a planner and policy pass in `lib/agents/orchestration/simulation.ts`. It intentionally stops before `MissionTaskExecutor`, which is where scheduling, publishing, usage consumption, and reply workflows can create side effects.
- The simulation API is separate from the run API: `POST /api/agents/missions/[id]/simulate`. This keeps dry-run behavior independent from the production mission queue path.
- Added `agent.mission.simulated` to the typed event list for local observability. It is not forwarded through the n8n agent event set, because a no-side-effects simulation should not trigger external automation.

## Tradeoffs

- Usage estimates are deterministic approximations based on mission type, platforms, variant ids, and comment limits. They are counted only for actions policy allows to run, are not billing records, and should be treated as planning estimates only.
- Simulation runs do not create `agent_task_runs`; planned actions live in the simulation row. This avoids making dry-run actions look executable or retryable in the task history.
- For publish simulations, the sandbox estimates scheduled-job writes and publish queue enqueues as suppressed side effects. It does not validate provider token health because that would cross into live integration behavior.
- For reply simulations, the sandbox estimates provider reply sends and usage writes from `maxComments` capped by policy. It does not read or mutate the reply inbox.

## Verification Notes

- Regression tests assert that publish simulations never invoke scheduling or publish executors.
- Regression tests assert that comment engagement simulations never invoke reply send executors.
- The Agents console reads recent simulation runs alongside missions, tasks, and policy events, and exposes a `Simulate` action per mission.

## Review Follow-up

- CodeRabbit flagged brittle string matching in the simulation route, so `simulateAgentMission` now throws a typed `AgentMissionNotFoundError`.
- CodeRabbit flagged a possible partial success state when policy event persistence fails. The runner now records simulation policy events before saving the simulation run as succeeded.
- CodeRabbit suggested the simulation history index should match the repository query shape, so the table now includes a `(workspace_id, mission_id, created_at)` index.
