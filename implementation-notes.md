# Implementation Notes

## Scope

This file tracks decisions, tradeoffs, and notable deviations while fixing the whole-project review findings.

## Running Notes

- Started from a clean `main` worktree and created branch `fix/review-findings-remediation`.
- Chose one remediation branch/PR for all findings so auth, billing, media, provider, workflow, and UI changes can be reviewed together by CI and CodeRabbit.
- Local preview must remain available for Playwright and development, but production and unconfigured auth paths should fail closed rather than silently authenticating as the preview user.
- Auth decision: `getCurrentUser()` now returns the local preview user only when local preview auth is explicitly enabled. Missing Clerk config is treated as unauthenticated so API routes fail closed through their existing `401` checks.
- Billing decision: route-level billable actions now use shared `ensureUsageAllowed()` and `recordUsageForLimit()` helpers. Local preview skips billing because it runs without durable DB state. Media upload auth records against the existing `mediaTransformsPerMonth` ledger key as a conservative proxy until a separate server-side transform endpoint exists; this may count issued auth tokens rather than completed uploads, but it prevents unlimited production use of the media path.
- Media library decision: no schema migration was needed because `media_assets` already exists. Added a workspace media-assets API and repository. Production ImageKit uploads are persisted to DB; local preview uses server memory plus mock assets so browser-only `localStorage` is no longer the durable source of truth.
