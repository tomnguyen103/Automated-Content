> Archived 2026-06-24. Superseded by docs/MASTER_PLAN_v2.md.

# Plan 03: Worker Runtime Readiness

## Rank

3 of 5.

## Goal

Make the BullMQ publishing and agent mission worker layer deployable, observable, and safe to operate outside local preview.

## Why This Matters

The app already writes durable scheduled rows before queue enqueue and reloads DB state before provider publishing. The remaining operational gap is proving workers are configured, alive, and safe under queue failures, retries, and provider outages.

## Requirements

- Add worker health/readiness checks for publishing and agent mission queues.
- Surface worker/queue health in dashboard or a dedicated operations panel.
- Distinguish:
  - Redis unavailable
  - queue not configured
  - worker not running
  - jobs waiting
  - jobs failed
  - jobs stalled
  - last successful job time
- Add safe retry controls for retryable queue/publish failures.
- Prevent duplicate sends by relying on persisted scheduled job and publish attempt state.
- Document worker runtime setup for local, preview, and production.
- Keep worker runtime errors visible in mission audit, weekly reports, and governance export where relevant.

## Key Existing Files

- `lib/scheduler/enqueue.ts`
- `lib/scheduler/queue-overview.ts`
- `lib/scheduler/publish-recovery.ts`
- `workers/social-worker.ts`
- `workers/jobs/publish-post.ts`
- `lib/agents/orchestration/queue.ts`
- `lib/agents/orchestration/runner.ts`
- `components/agents/agents-console.tsx`
- `app/(dashboard)/calendar/page.tsx`
- `app/(dashboard)/dashboard/page.tsx`
- `tests/scheduler/queue-overview.test.ts`
- `tests/workers/publish-post.test.ts`

## Implementation Steps

1. Read scheduler, worker, queue, and publish recovery files.
2. Define a worker health status schema:
   - queue name
   - configured
   - redis reachable
   - worker expected
   - counts by state
   - last success
   - last failure
   - blocking reason
3. Add server-side queue health helper for publish queue.
4. Add server-side queue health helper for agent mission queue.
5. Add API route for health if dashboard UI needs client refresh.
6. Add operations UI:
   - compact health summary
   - queue counts
   - latest failures
   - recommended action
   - retry eligible action
7. Add retry endpoint for safe retry classes only:
   - queue enqueue
   - provider transient
   - optionally stalled jobs
8. Block retry for:
   - provider capability
   - provider config
   - token scope
   - policy block
   - content invalid
9. Add idempotency checks before retrying publish.
10. Update weekly report/failure recovery summaries if needed.
11. Add docs:
    - worker start command
    - required env vars
    - deployment topology
    - failure handling playbook
12. Add tests for queue unavailable, retryable failure, non-retryable failure, and duplicate-send protection.
13. Run gates, open PR, wait for CodeRabbit, fix, merge, sync.

## Acceptance Criteria

- Operators can see whether publishing and mission workers are configured and healthy.
- Queue failures are visible without reading logs.
- Retry controls exist only for safe retry classes.
- Duplicate sends are prevented by DB state and publish attempts.
- Worker deployment requirements are documented.
- Local preview continues to work without Redis.

## Verification

```powershell
npm test -- tests/scheduler/queue-overview.test.ts tests/workers/publish-post.test.ts tests/scheduler/create-scheduled-post.test.ts
npm run lint
npm run typecheck
npm run build
npm run test:e2e
git diff --check
```

## Risks

- Retry actions can duplicate provider posts if idempotency is weak.
- BullMQ health checks can hang if Redis timeouts are not bounded.
- UI can become too operationally dense for non-technical users.

## `/goal` Prompt

```text
/goal implement docs/next-feature-plans/03-worker-runtime-readiness.md until no issues.

Read the worker, scheduler, queue, and recovery files first. Add worker health helpers, operations UI, safe retry controls, deployment docs, and tests. Preserve durable-first scheduling and duplicate-send protection. Run all required gates, self-review the diff, open a non-draft PR only after local gates pass, wait for CodeRabbit findings, fix every actionable finding, wait for the follow-up review to settle, merge to main, and sync local main before declaring complete.
```
