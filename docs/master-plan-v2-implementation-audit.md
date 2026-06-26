# Master Plan v2 Implementation Audit

Source of truth: `docs/MASTER_PLAN_V2_DEPLOYMENT_READY.md`

Generated: 2026-06-25

## Status Table

| Plan item | Status | Evidence | External blocker or note |
| --- | --- | --- | --- |
| Vercel project and production/preview environments | BLOCKED-EXTERNAL | `lib/release/readiness.ts`, `.env.production.example` | Requires Vercel dashboard/project access and real environment configuration. Next action: create/link the Vercel project and set production/preview env values. |
| Trigger.dev project and production/staging environments | BLOCKED-EXTERNAL | `trigger.config.ts`, `trigger/deployment-smoke.ts`, `lib/release/readiness.ts` | Requires Trigger.dev dashboard credentials and deployment. Next action: create environments, deploy tasks, record `TRIGGER_VERSION`. |
| Object storage bucket and signed upload strategy | PARTIAL | `lib/media/object-storage.ts`, `app/api/media/source-upload-intents/route.ts`, `.env.production.example` | Signed upload code exists. Live bucket, CORS, and upload/read smoke are BLOCKED-EXTERNAL until storage credentials and bucket policy exist. |
| V2 env template entries | DONE | `.env.example`, `.env.production.example`, `lib/env.ts` | Includes Trigger, object storage, Deepgram, Luma, Remotion, Arcjet, Sentry, and Redis fallback notes. |
| Trigger config and deployment smoke task | DONE | `trigger.config.ts`, `trigger/deployment-smoke.ts` | Live Trigger smoke run is BLOCKED-EXTERNAL until Trigger.dev deployment access exists. |
| Release readiness checks for Vercel, Trigger, storage, media smoke, render smoke | DONE | `lib/release/readiness.ts`, `scripts/release-readiness.ts`, `tests/release/readiness.test.ts` | Manual production smoke confirmations remain BLOCKED-EXTERNAL. |
| Job abstraction for V2 media and existing background jobs | DONE | `lib/jobs/trigger.ts`, `lib/scheduler/enqueue.ts`, `lib/agents/orchestration/queue.ts`, `tests/jobs/background-trigger.test.ts` | Trigger is now the preferred backend; BullMQ remains as transition fallback. |
| Media job schema and persistence | DONE | `db/schema.ts`, `db/migrations/0018_v2_media_generation_jobs.sql`, `lib/jobs/media.ts` | V2-specific artifacts are persisted as structured job output/cost/audit JSON instead of separate artifact tables. |
| Media job create/list/read APIs | DONE | `app/api/media/jobs/route.ts`, `app/api/media/jobs/[id]/route.ts`, `tests/api/media-jobs.test.ts` | Route handlers dispatch work and do not run heavy media processing inline. |
| Progress, cancellation, retry, idempotency | DONE | `lib/jobs/media.ts`, `app/api/media/jobs/[id]/route.ts`, `tests/api/media-jobs.test.ts`, `tests/jobs/media-workflows.test.ts` | Trigger replays return existing succeeded output without duplicating work. |
| Usage reservation before expensive media jobs | DONE | `app/api/media/jobs/route.ts`, `tests/api/media-jobs.test.ts` | Uses idempotent media transform usage source IDs. |
| Dashboard media job visibility | DONE | `components/media/media-workflow-studio.tsx`, `components/media/media-library.tsx`, `app/(dashboard)/media/page.tsx` | Shows job creation, status/progress, output summary, cancel/retry, and download links. |
| AI Influencer Studio workflow | DONE | `lib/media/workflow-adapters.ts`, `lib/jobs/media-workflows.ts`, `trigger/media-workflows.ts`, `components/media/media-workflow-studio.tsx` | Live Luma verification is BLOCKED-EXTERNAL until provider credentials/callback behavior are configured. |
| AI influencer generated asset persistence and review handoff | DONE | `lib/media/workflow-adapters.ts`, `app/api/media/artifacts/[workspaceId]/[jobId]/[asset]/route.ts`, `tests/jobs/media-workflows.test.ts` | Local persistence is in `media_generation_jobs.output`; live storage/ImageKit copy is BLOCKED-EXTERNAL pending real storage/provider setup. |
| Long video source upload | DONE | `app/api/media/source-upload-intents/route.ts`, `lib/media/object-storage.ts`, `tests/api/source-upload-intents.test.ts` | Live bucket upload/read smoke is BLOCKED-EXTERNAL. |
| Transcription abstraction and transcript/caption storage | DONE | `lib/media/workflow-adapters.ts`, `lib/jobs/media-workflows.ts`, `tests/jobs/media-workflows.test.ts` | Live Deepgram calls are BLOCKED-EXTERNAL until credentials and production task deployment exist. |
| Clip candidates and scoring | DONE | `lib/media/workflow-adapters.ts`, `tests/jobs/media-workflows.test.ts` | Deterministic local scoring is implemented. |
| Preview/render pipeline and downloadable clips | DONE | `lib/media/workflow-adapters.ts`, `app/api/media/artifacts/[workspaceId]/[jobId]/[asset]/route.ts`, `trigger/media-workflows.ts`, `components/media/media-workflow-studio.tsx`, `tests/api/media-generated-artifacts.test.ts`, `tests/jobs/media-workflows.test.ts` | Live Remotion renderer/Lambda validation is BLOCKED-EXTERNAL. |
| Long-to-short schedule handoff | DONE | `lib/media/workflow-adapters.ts`, `components/media/media-workflow-studio.tsx`, `tests/jobs/media-workflows.test.ts` | Produces guarded platform variant handoff metadata for existing schedule flow. |
| Avatar, voice, and talking-video workflow | DONE | `lib/media/workflow-adapters.ts`, `lib/jobs/media-workflows.ts`, `trigger/media-workflows.ts`, `tests/jobs/media-workflows.test.ts` | Live Replicate/ElevenLabs/provider verification is BLOCKED-EXTERNAL. |
| Consent capture, retention controls, audit metadata | DONE | `components/media/media-workflow-studio.tsx`, `lib/media/workflow-adapters.ts`, `lib/jobs/media-workflows.ts`, `tests/jobs/media-workflows.test.ts` | Consent and retention are stored in job output with synthetic media labels. |
| Synthetic media labeling | DONE | `lib/media/workflow-adapters.ts`, `tests/jobs/media-workflows.test.ts` | Labels are included for influencer, rendered clip, and avatar outputs. |
| Scheduled publishing migration from BullMQ to Trigger.dev | DONE | `lib/scheduler/enqueue.ts`, `trigger/social-workflows.ts`, `workers/jobs/publish-post.ts`, `tests/jobs/background-trigger.test.ts` | BullMQ fallback remains available for transition environments. |
| Agent mission migration from BullMQ to Trigger.dev | DONE | `lib/agents/orchestration/queue.ts`, `trigger/social-workflows.ts`, `workers/jobs/run-agent-mission.ts`, `tests/jobs/background-trigger.test.ts` | BullMQ fallback remains available for transition environments. |
| Preserve retries, delays, idempotency, duplicate prevention | DONE | `lib/scheduler/enqueue.ts`, `lib/agents/orchestration/queue.ts`, `tests/jobs/background-trigger.test.ts`, `lib/scheduler/create-scheduled-post.ts` | Trigger options use `delay`, `maxAttempts`, `idempotencyKey`, `concurrencyKey`; scheduled rows still prevent duplicate `sourceId` schedules. |
| Worker health semantics after Trigger migration | DONE | `lib/scheduler/worker-health.ts`, `tests/scheduler/worker-health.test.ts`, `app/(dashboard)/calendar/page.tsx`, `app/(dashboard)/dashboard/page.tsx` | Trigger-configured production reports healthy background queues without Redis. |
| Remove Redis from production release readiness after migration | DONE | `lib/release/readiness.ts`, `.env.example`, `.env.production.example`, `tests/release/readiness.test.ts` | `REDIS_URL` is only required when Trigger is not fully configured. |

## Verification

- `npm test -- tests/jobs/media-workflows.test.ts tests/api/media-jobs.test.ts`
- `npm test -- tests/jobs/background-trigger.test.ts tests/scheduler/worker-health.test.ts tests/release/readiness.test.ts tests/scheduler/create-scheduled-post.test.ts tests/api/agent-mission-run.test.ts tests/jobs/trigger.test.ts`
- `npm test`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npx playwright test e2e/phase-05.spec.ts`

## BLOCKED-EXTERNAL Items

| Item | Reason | Next action |
| --- | --- | --- |
| Vercel preview/production deployment | Requires account/project access and live env values. | Link Vercel project, configure production/preview env, run preview deployment smoke. |
| Trigger.dev task deployment and smoke run | Requires Trigger.dev account/project access. | Deploy tasks, run `deployment.smoke`, record `TRIGGER_VERSION`. |
| Neon production database migration verification | Requires production database access. | Apply Drizzle migrations and confirm schema state. |
| Object storage bucket upload/read and render artifact fetch | Requires real S3/R2 bucket credentials, CORS, and public base URL. | Configure bucket, run signed upload/read/delete smoke, fetch a generated artifact URL. |
| Deepgram, Luma, Remotion, Replicate/ElevenLabs live calls | Requires real provider credentials, paid/provider setup, and production task environment. | Add live adapters only after credentials and webhook/polling behavior are available. |
| Arcjet protection live enforcement | Requires Arcjet key and configured protection mode. | Set `ARCJET_KEY`, choose `ARCJET_MODE`, and run expensive endpoint abuse-control smoke. |
| LinkedIn/X live provider callback and publish smoke | Requires production provider app credentials and callback configuration. | Configure OAuth redirects, connect test accounts, schedule safe smoke posts. |
