# Implementation Notes

## Scope

This file tracks decisions, tradeoffs, and notable deviations while fixing the whole-project review findings.

## Running Notes

- Started from a clean `main` worktree and created branch `fix/review-findings-remediation`.
- Chose one remediation branch/PR for all findings so auth, billing, media, provider, workflow, and UI changes can be reviewed together by CI and CodeRabbit.
- Local preview must remain available for Playwright and development, but production and unconfigured auth paths should fail closed rather than silently authenticating as the preview user.
- Auth decision: `getCurrentUser()` now returns the local preview user only when local preview auth is explicitly enabled. Missing Clerk config is treated as unauthenticated so API routes fail closed through their existing `401` checks.
- Billing decision: route-level billable actions now use `consumeUsageForLimit()` before billable side effects. The helper checks limits and writes the ledger entry inside one transaction with a per-workspace/key advisory lock, preventing concurrent quota oversubscription. Local preview skips billing because it runs without durable DB state. This may count attempted work if a downstream provider fails after quota is consumed, but it is the safer production tradeoff until a richer reservation/release model exists.
- Media library decision: no schema migration was needed because `media_assets` already exists. Added a workspace media-assets API and repository. Production ImageKit uploads are persisted to DB; local preview uses server memory plus mock assets so browser-only `localStorage` is no longer the durable source of truth.
- Reply approval decision: approvals are now claimed before the provider call. A second request gets `409` before any external reply side effect. If provider send fails after claim, the attempt is marked failed rather than reopened, avoiding ambiguous retry-after-timeout duplicates.
- Provider readiness decision: added `implementationStatus` to provider adapters. Skeleton providers can still document planned capabilities, but the Connections UI now labels them as scaffold-only with 0 live capabilities instead of implying they are production-ready.
- n8n decision: added a durable `n8n_events` audit table and memory fallback. Outbound dispatches now log pending, delivered, and failed statuses; signed callbacks log accepted payloads after signature and schema validation.
- Dashboard decision: extracted scheduled queue reads into `lib/scheduler/queue-overview.ts` and made Dashboard use analytics + queue rows instead of hard-coded metrics. Preview sample rows now require local preview mode; missing production data shows zero/empty state instead of sample activity.
- UX/config decision: SubNav now marks non-linked tabs as unavailable with `aria-disabled`, while real dashboard shortcuts link to Analytics, Calendar, and Billing. `next.config.ts` no longer commits a one-off ngrok host; tunnel origins are opt-in via `NEXT_ALLOWED_DEV_ORIGINS`.
- E2E auth decision: kept `AUTH_LOCAL_PREVIEW` blocked in production, but allowed `PLAYWRIGHT_AUTH_LOCAL_PREVIEW` when `NEXT_PUBLIC_APP_URL` points at localhost/127.0.0.1. This lets `next start` Playwright runs exercise production builds without weakening hosted production auth.
- Self-review security decision: media upload auth no longer lets the raw Playwright flag affect workspace-backed users. Usage skipping follows `workspace.isLocalPreview`, and forced mock ImageKit config requires both local preview workspace state and the Playwright flag.
- Self-review persistence decision: media asset upserts now reject client-supplied asset IDs that already belong to another workspace, and the conflict update path is scoped by workspace. The API returns `409` for these collisions.
- Self-review UX decision: dashboard publish health uses a neutral stat tone when no publish outcome rows exist, so an empty measurement is not presented as a successful health score.
- Self-review media consistency decision: preview/mock media returned by `/api/media/assets` is normalized to the resolved workspace and current user instead of exposing static `mock-workspace`/`mock-user` ownership.
- Self-review n8n decision: the in-memory n8n event log now clears stale failure fields on later successful updates, matching the database upsert behavior during local preview retries.
- Self-review billing decision: added a partial unique index for `(workspace_id, type, source_id)` usage rows and made sourced usage inserts idempotent. Retries for the same successful side effect no longer double-count usage.
- CodeRabbit review decision: addressed the first review batch by switching quota enforcement to atomic consumption, removing client-side synthetic media seeding for non-preview users, deduplicating incoming media asset IDs before upsert, making n8n audit writes best-effort, keeping DB reply failure audit notes in parity with memory fallback, and tightening smaller UI/config/auth coverage items.
