# Phase 6: Provider Connections and Publishing

## Purpose

Connect providers, schedule posts durably, and publish through a queue-backed worker.

## Task Packets

### Task 1: Provider Adapter Contract

Files:
- `lib/providers/types.ts`
- `lib/providers/errors.ts`
- `lib/providers/registry.ts`
- `lib/providers/capabilities.ts`
- `lib/providers/mock.ts`

Acceptance:
- Mock provider supports connect, publish, reply, and metrics.
- UI can query provider capabilities.

Verification:
- Unit tests against mock provider.

### Task 2: Real Provider Skeletons

Files:
- `lib/providers/token-vault.ts`
- `lib/providers/meta.ts`
- `lib/providers/linkedin.ts`
- `lib/providers/x.ts`
- `lib/providers/slack.ts`
- `lib/providers/discord.ts`

Acceptance:
- Provider files implement the shared contract.
- Unsupported capabilities are explicit.

Verification:
- Typecheck and adapter contract tests.

### Task 3: Scheduling and Worker

Files:
- `lib/scheduler/create-scheduled-post.ts`
- `lib/scheduler/enqueue.ts`
- `workers/social-worker.ts`
- `workers/jobs/publish-post.ts`
- `app/api/posts/[id]/schedule/route.ts`

Acceptance:
- Scheduled job row is committed before BullMQ enqueue.
- Enqueue failure is recoverable and visible.

Verification:
- Integration test for schedule transaction and enqueue failure.
