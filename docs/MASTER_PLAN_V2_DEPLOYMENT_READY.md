# Master Plan v2: Deployment-Ready Video SaaS Expansion
_Deployment architecture update for the v2 plan inspired by the June 25, 2026 TubeGuruji mega tutorial._
_Last updated: 2026-06-25._
_Implementation status: COMPLETE for all repo-implementable roadmap work as of 2026-06-25. Remaining production deployment, provider credential, dashboard, and live smoke items are BLOCKED-EXTERNAL and tracked in `docs/master-plan-v2-implementation-audit.md`._

## Summary

Recommended production setup: **Vercel for the Next.js web/API app plus Trigger.dev Cloud for long-running background and media workflows**.

This repo is already a production-shaped Next.js SaaS with Clerk, Neon Postgres, Drizzle, LangChain, LangGraph, BullMQ, ImageKit, provider adapters, approvals, billing gates, analytics, n8n events, and release readiness tooling. Master Plan v2 should not replace that foundation. It should add the tutorial's new video-SaaS capabilities through a deployment model that can actually run multi-step AI media workflows without Vercel request timeouts or a fragile always-on worker requirement.

The v2 deployment target is:

- **Web and API:** Vercel.
- **Long-running jobs:** Trigger.dev Cloud.
- **Database:** Neon Postgres with Drizzle.
- **Auth and initial billing:** Clerk and existing entitlement/usage ledger.
- **Raw video and render storage:** AWS S3-compatible object storage; use AWS S3 if adopting Remotion Lambda.
- **Existing media delivery:** Keep ImageKit for the current media library and transformed assets.
- **Social publishing:** Existing provider adapters stay canonical; Zernio remains optional, not the core publishing layer.
- **Observability:** Vercel logs, Trigger.dev run history, LangSmith traces, app-side audit/event tables, and optional Sentry for cross-runtime exceptions.

## Recommendation

### Choose Vercel + Trigger.dev

Use Vercel for what it is best at in this repo: Next.js App Router hosting, preview deployments, production aliases, route handlers, Server Components, environment management, and frontend/API delivery.

Use Trigger.dev for v2 work that is naturally long-running or step-based:

- Long-video upload processing.
- Deepgram transcription and caption generation.
- AI clip selection and scoring.
- Luma image/video generation.
- Remotion render orchestration.
- Avatar generation, voice generation, and talking-video workflows.
- External provider wait/callback flows.
- Media workflow retries, progress, cancellation, and replay.

Do not run v2 video generation or rendering inside ordinary Vercel route handlers. Vercel Functions now support longer durations on paid tiers, but video rendering, transcription, and multi-provider media generation are still better modeled as background tasks with retries, progress, and resumability.

### Transition Existing BullMQ Carefully

Current v1 code already has BullMQ queues for scheduled publishing and agent missions, plus `npm run worker`. For a deployment-ready v2 target, avoid adding a second permanent background system.

Use this transition policy:

1. **Phase 1:** Add Trigger.dev for all new v2 media workflows only. Keep BullMQ and `REDIS_URL` for existing publishing and mission execution.
2. **Phase 2:** Add a small `lib/jobs` abstraction so callers do not care whether work is triggered through BullMQ or Trigger.dev.
3. **Phase 3:** Migrate scheduled publish and agent mission jobs to Trigger.dev after parity tests prove idempotency, delayed execution, retries, duplicate prevention, and worker-health UI behavior.
4. **Phase 4:** Remove Redis/BullMQ from the production critical path only after no production route requires `REDIS_URL`.

If v2 must launch before the migration is complete, host the current `npm run worker` process separately on Railway, Fly.io, Render, or another always-on Node runtime and use a managed Redis provider. That is a transition deployment, not the recommended long-term shape.

## Deployment Architecture

### Vercel App

Responsibilities:

- Marketing app, dashboard, create flow, approvals, analytics, media library, calendar, billing, connections, and settings.
- Route handlers for auth callbacks, billing actions, provider callbacks, media job creation, job status reads, approval actions, and webhooks.
- Preview deployments for every PR and production deployment from `main`.
- Environment variables scoped separately for Preview and Production.

Rules:

- Route handlers create or read jobs; they do not perform long AI/media processing inline.
- Large files should upload directly to object storage through signed URLs or provider upload tokens.
- Server modules must keep database, Redis, and provider SDK clients lazily initialized so `next build` remains safe.
- `NEXT_PUBLIC_*` values are public build-time values only; secrets stay server-side in Vercel and Trigger.dev environments.

### Trigger.dev Tasks

Responsibilities:

- Run durable v2 media and AI workflows in TypeScript.
- Own retries, max duration, progress, task versioning, queue/concurrency settings, and workflow logs.
- Update Neon/Drizzle state after each meaningful step.
- Wait for external provider callbacks where providers support webhooks or polling is expensive.

Initial tasks:

- `media.transcribe-video`: consume stored source video URL, call Deepgram, persist transcript/captions.
- `media.detect-short-clips`: score transcript/scene candidates and persist clip candidates.
- `media.render-short-clip`: call Remotion renderer, persist render status and output URL.
- `media.generate-influencer-asset`: call Luma, persist generated asset and prompt metadata.
- `media.generate-avatar-video`: orchestrate avatar, voice, captions, and render output.
- `social.publish-scheduled-post`: migration target for existing BullMQ publishing.
- `agents.run-mission`: migration target for existing BullMQ agent mission execution.

### Database

Keep Neon Postgres and Drizzle as the source of truth.

Add v2 tables or equivalent columns for:

- Media generation jobs.
- Provider task/run IDs.
- Source video assets.
- Transcripts and caption tracks.
- Clip candidates and clip scores.
- Render jobs and render artifacts.
- Synthetic influencer/persona assets.
- Avatar assets.
- Voice assets and voice consent records.
- Generation cost ledger entries.

Every Trigger.dev task must be idempotent against database state. A replayed task should not double-charge credits, duplicate rendered assets, or publish duplicate posts.

### Storage

Keep ImageKit for existing image/media library behavior and public transformed asset delivery.

Add object storage for v2 raw and generated video workflows:

- Source long-form videos.
- Intermediate audio files.
- Captions and transcript exports.
- Remotion render outputs.
- Avatar/voice source samples where retention is permitted.

Recommended default: AWS S3 if using Remotion Lambda. Cloudflare R2 is acceptable only if final rendering is not tied to AWS Lambda storage assumptions.

### Security And Abuse Controls

Add Arcjet or an equivalent protection layer around expensive endpoints:

- Upload intent creation.
- Transcription start.
- Clip analysis start.
- Luma generation.
- Avatar generation.
- Voice cloning.
- Render requests.

Security requirements:

- Per-workspace and per-user quotas before starting expensive jobs.
- Prompt-injection and input screening for AI analysis routes.
- Explicit consent before voice cloning or face/avatar generation from user-provided media.
- Synthetic media labeling and audit metadata.
- Retention policy for voice samples and source videos.
- No secrets in client bundles or committed env files.

## Deployment Environments

### Production

Production should include:

- Vercel production project connected to `main`.
- Trigger.dev production environment.
- Neon production database.
- Object storage production bucket.
- ImageKit production endpoint.
- Clerk production instance.
- Provider production callbacks for LinkedIn and X.
- n8n production webhook endpoint if automation remains enabled.
- Production LangSmith project.
- Optional Sentry project for web/API/task exceptions.

Required production checks:

- `NEXT_PUBLIC_APP_URL` is the production HTTPS URL.
- Clerk redirect URLs and webhooks point at production.
- LinkedIn and X redirect URIs match production callbacks.
- Trigger.dev has the same server-side env needed by its tasks.
- Object storage CORS and signed-upload policy match Vercel app origin.
- No preview deployment points at production-only provider callback URLs unless intentionally configured.

### Preview

Preview deployments should be useful but safe:

- Use Vercel Preview deployments for PRs.
- Use Trigger.dev staging or preview environment, not production tasks.
- Use a staging Neon branch/database.
- Use test provider credentials or disable live provider publish.
- Keep AI/media jobs capped with smaller quotas.
- Prevent preview deployments from posting to real social accounts by default.

### Local Development

Local development should support two modes:

- `npm run dev` for web/API work.
- Trigger.dev dev mode for task development and replay.

Local should keep `AUTH_LOCAL_PREVIEW=1` available for tests and avoid requiring real provider keys for unit/integration tests.

## CI/CD Plan

### PR Flow

1. Developer opens a branch and PR.
2. GitHub runs local-equivalent gates:
   - `npm run lint`
   - `npm run typecheck`
   - `npm test`
   - `npm run build`
   - targeted Playwright tests for changed flows
3. Vercel creates a Preview deployment.
4. Trigger.dev deploys preview/staging tasks for branches that change task code.
5. CodeRabbit reviews the non-draft PR.
6. The PR is not merge-ready until checks, preview smoke, and CodeRabbit findings are resolved.

### Production Flow

Use a two-artifact release when Trigger task code changes:

1. Deploy Trigger.dev tasks without immediately promoting if using atomic deployment.
2. Capture the Trigger task version.
3. Deploy Vercel with the matching Trigger task version env.
4. Run smoke checks.
5. Promote the Vercel deployment or merge-to-production alias only after smoke passes.

If task code did not change, use Vercel's normal production deployment from `main`.

### Release Readiness Update

Extend `npm run release:readiness` to include v2 checks:

- Vercel production env shape.
- Trigger.dev runtime keys and task version.
- Object storage bucket and signed upload config.
- Luma/Deepgram/Remotion provider keys.
- Arcjet key and protection mode.
- Sentry DSN if enabled.
- Media job smoke check.
- Trigger task smoke check.
- Render artifact fetch smoke check.

## New Stack List

### Recommended Additions

- `@trigger.dev/sdk` and Trigger.dev project configuration.
- Object storage SDK or signed upload adapter for AWS S3-compatible storage.
- Remotion packages for preview/render definitions.
- Luma API adapter.
- Deepgram API adapter.
- Arcjet SDK for request protection.
- Optional Sentry SDK for production error correlation.

### Conditional Additions

- Replicate adapter if avatar generation is implemented through Replicate-hosted models.
- ElevenLabs adapter if voice generation or cloning requires their API.
- Zernio adapter if native Meta/TikTok/Instagram provider implementation is intentionally deferred.
- Stripe only if Clerk Billing cannot support credit packs or usage-based media monetization cleanly.

### Keep Existing

- Next.js 16, React 19, TypeScript.
- Clerk.
- Neon Postgres.
- Drizzle.
- LangChain and LangGraph.
- ImageKit.
- Existing provider adapter model.
- n8n event integration.
- LangSmith.
- Vitest and Playwright.

### Retire Or Avoid Long-Term

- Permanent BullMQ/Redis production dependency after job migration completes.
- Supabase or InsForge as a replacement backend for this repo.
- Browser-login automation for social providers.
- Running heavy video workflows inside Vercel route handlers.
- Zernio as the only publishing path unless the product explicitly chooses aggregator dependency over first-party provider control.

## Updated Implementation Sequence

### Phase 0: Deployment Foundation

- Create Vercel project and environments.
- Create Trigger.dev project and production/staging environments.
- Add object storage bucket and signed upload strategy.
- Add v2 env template entries.
- Add Trigger.dev config and one no-op smoke task.
- Add release readiness checks for Vercel, Trigger.dev, and storage.

Acceptance:

- Vercel Preview deploy works.
- Trigger.dev smoke task deploys and runs.
- `npm run release:readiness` reports v2 deployment blockers clearly.

### Phase 1: Job Abstraction And Media Job Backbone

- Add `lib/jobs` abstraction with Trigger.dev implementation for new v2 jobs and existing BullMQ implementation for old jobs.
- Add media job schema and status APIs.
- Add progress/cancellation/retry model.
- Add idempotency keys and usage reservation strategy.

Acceptance:

- A media job can be created from Vercel, executed by Trigger.dev, persisted in Neon, and read back in the dashboard.

### Phase 2: AI Influencer Studio

- Add synthetic influencer/persona asset workflow.
- Use Luma through a provider adapter.
- Save generated assets to storage/ImageKit as appropriate.
- Route generated posts through the existing review and scheduling path.

Acceptance:

- User can generate an influencer asset, review it, attach it to a post, and schedule through existing guarded provider logic.

### Phase 3: Long-To-Short Video Generator

- Add direct video upload to object storage.
- Add Trigger.dev transcription task with Deepgram.
- Add clip candidate generation and scoring.
- Add Remotion preview and render task.
- Add downloadable rendered clip outputs.
- Add schedule handoff to existing calendar/provider flow.

Acceptance:

- Long video input produces multiple captioned, scored, downloadable clips without blocking Vercel request handlers.

### Phase 4: Avatar, Voice, And Talking Video Studio

- Add avatar and voice asset models.
- Add consent capture and retention controls.
- Add Replicate or ElevenLabs adapter behind a provider interface.
- Add talking-video orchestration task.
- Add review and publish handoff.

Acceptance:

- User can generate a consented avatar/voice video with audit records and synthetic media labeling.

### Phase 5: Background Job Consolidation

- Migrate `social.publish-scheduled-post` from BullMQ to Trigger.dev.
- Migrate `agents.run-mission` from BullMQ to Trigger.dev.
- Preserve delayed execution, retries, duplicate prevention, worker-health visibility, and existing tests.
- Remove Redis from production release readiness only after all production job paths are migrated.

Acceptance:

- Production no longer requires a separate `npm run worker` process for core app behavior.

## Test Plan

- Unit tests for Trigger task payload schemas, job abstraction, idempotency, usage reservations, and provider adapters.
- API tests for job creation, status reads, cancellation, retries, workspace scoping, and quota rejection.
- Worker/task tests for replay safety, provider timeout handling, callback continuation, failed render recovery, and no duplicate publish.
- UI tests for Creator Studio progress, failure states, generated media review, and schedule handoff.
- E2E preview smoke for Vercel deployment with mocked Trigger.dev tasks.
- Production smoke for Trigger.dev task run, object storage upload/read, media render output, provider callback, billing redirect, and release readiness.

## Deployment Decision Matrix

| Area | Recommended | Why |
| --- | --- | --- |
| Web/API hosting | Vercel | Best fit for existing Next.js App Router app, preview deployments, env scoping, and production aliases. |
| Long-running media jobs | Trigger.dev Cloud | Better fit for retries, progress, replays, long-running AI/video workflows, and wait/callback patterns. |
| Database | Neon Postgres + Drizzle | Already implemented and broad enough for v2 state. |
| Raw video/render storage | AWS S3-compatible storage | Required for large source videos, render artifacts, and Remotion Lambda-compatible workflows. |
| Existing transformed media | ImageKit | Already integrated and tested. |
| Request protection | Arcjet | Fits expensive AI/media endpoints and tutorial's abuse-prevention angle. |
| Publishing | Native provider adapters | Maintains ownership, auditability, and provider-specific safety. |
| Aggregated publishing | Zernio optional | Useful only if speed to Meta/TikTok/Instagram outweighs provider-control goals. |
| Billing | Clerk first, Stripe optional | Existing billing/usage gates should be extended before adding another payment stack. |
| Observability | Vercel + Trigger.dev + LangSmith + DB audit, optional Sentry | Covers web/API, background runs, model traces, durable product events, and exception correlation. |

## Source Notes

- Tutorial reviewed: https://www.youtube.com/watch?v=rcEUVADmH2g
- Vercel env and deployment model: https://vercel.com/docs/environment-variables, https://vercel.com/docs/deployments
- Vercel function duration limits: https://vercel.com/docs/functions/configuring-functions/duration
- Trigger.dev Next.js/background job docs: https://trigger.dev/docs/guides/frameworks/nextjs, https://trigger.dev/docs/introduction
- Trigger.dev deployment/env/atomic deployment docs: https://trigger.dev/docs/deployment/overview, https://trigger.dev/docs/deploy-environment-variables, https://trigger.dev/docs/deployment/atomic-deployment
- Trigger.dev long-running/video task framing: https://trigger.dev/docs/how-it-works
