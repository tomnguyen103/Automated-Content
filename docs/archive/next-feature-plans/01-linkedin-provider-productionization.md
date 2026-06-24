> Archived 2026-06-24. Superseded by docs/MASTER_PLAN_v2.md.

# Plan 01: LinkedIn Provider Productionization

## Rank

1 of 5.

## Goal

Make LinkedIn the first production-ready provider so the platform can connect one real social account, validate readiness, publish approved content, refresh credentials, record provider outcomes, and report failures through the existing recovery and governance surfaces.

## Why This Is First

The agent system, scheduler, provider health sentinel, failure recovery, and governance export are already in place. The largest remaining product gap is that provider adapters are still scaffold-level, so external publishing value is mostly limited to `mock`.

LinkedIn is the recommended first real provider because the product is strongest for founder/operator/B2B content workflows and supervised campaign publishing.

## Requirements

- Implement LinkedIn OAuth connect and callback flow.
- Persist connected account records using the existing `connected_accounts` and token-vault boundaries.
- Store provider tokens through `lib/providers/token-vault.ts`; never store raw tokens in UI payloads or logs.
- Implement access-token refresh with safe failure handling.
- Implement live LinkedIn text/image post publishing for approved scheduled variants.
- Normalize LinkedIn API errors into retryable/non-retryable provider errors.
- Feed provider failures into `publish_attempts`, `lib/scheduler/publish-recovery.ts`, mission audit, weekly report, and governance export.
- Validate connected account scopes and capabilities through the existing provider health model.
- Keep comments/replies/metrics disabled unless the official API access and scopes are implemented.
- Keep mock provider behavior unchanged for local preview and automated tests.

## Key Existing Files

- `lib/providers/linkedin.ts`
- `lib/providers/types.ts`
- `lib/providers/token-vault.ts`
- `lib/providers/health.ts`
- `lib/providers/registry.ts`
- `app/api/connections/[provider]/connect/route.ts`
- `app/api/connections/[provider]/callback/route.ts`
- `app/api/connections/[provider]/disconnect/route.ts`
- `app/api/connections/[provider]/health/route.ts`
- `lib/scheduler/create-scheduled-post.ts`
- `workers/jobs/publish-post.ts`
- `tests/providers/provider-contract.test.ts`
- `tests/workers/publish-post.test.ts`

## Implementation Steps

1. Read provider specs and current adapter contracts:
   - `docs/specs/06-provider-integrations.md`
   - `docs/phases/phase-06-provider-publishing.md`
   - `lib/providers/types.ts`
   - `lib/providers/linkedin.ts`
2. Verify current environment keys and add missing optional env vars to `.env.example` and `lib/env.ts`:
   - LinkedIn client id
   - LinkedIn client secret
   - LinkedIn redirect URI
   - any required API version/base URL values
3. Implement LinkedIn authorization URL generation in the connect route.
4. Implement callback exchange from authorization code to provider tokens.
5. Persist connected account display name, provider account id, scopes, token reference, and capability metadata.
6. Implement token refresh in `linkedinProvider.refreshToken`.
7. Implement `linkedinProvider.validateCapabilities` from stored token/account metadata.
8. Implement `linkedinProvider.publish` for supported content types.
9. Keep unsupported capabilities explicit:
   - comment ingest
   - comment reply
   - metrics sync
   - video/carousel if not actually supported
10. Update scheduler/worker tests so LinkedIn live-mode failures are classified correctly.
11. Add provider contract tests covering:
   - OAuth callback success
   - missing scope failure
   - expired token refresh success
   - expired token refresh failure
   - publish success
   - retryable provider API failure
   - permanent provider API failure
12. Add route tests for connect/callback/health if the route surfaces are not already covered.
13. Update Connections UI labels only as needed to show LinkedIn as live when configured.
14. Run the verification stack.
15. Open one non-draft PR: `LinkedIn provider productionization`.
16. Wait for CodeRabbit and remote checks, fix findings, merge, and sync local `main`.

## Acceptance Criteria

- A user can start LinkedIn OAuth and complete callback without manual DB writes.
- A connected LinkedIn account appears as ready only when required scopes and capabilities are present.
- Scheduled approved content can publish through LinkedIn and record provider outcome.
- Failed LinkedIn publishes are classified into the existing recovery categories.
- Token refresh works before publish when a token is expired.
- Raw tokens, secrets, and OAuth codes are never returned to the browser, governance export, logs, or task results.
- Unsupported LinkedIn capabilities are visible as unsupported, not hidden or implied.

## Verification

```powershell
npm test -- tests/providers/provider-contract.test.ts tests/workers/publish-post.test.ts
npm run lint
npm run typecheck
npm run build
npm run test:e2e
git diff --check
```

If schema changes are required:

```powershell
npm run db:generate
npm test -- tests/providers/provider-contract.test.ts tests/workers/publish-post.test.ts
```

## Risks

- LinkedIn API access may require approval or scopes unavailable to a normal dev app.
- Token handling can accidentally leak secrets through audit/export payloads.
- Publish semantics may differ across member/page posting.
- Provider rate limits and duplicate-send protection need careful idempotency.

## `/goal` Prompt

```text
/goal implement docs/next-feature-plans/01-linkedin-provider-productionization.md until no issues.

Read the plan file and linked provider specs first. Implement LinkedIn OAuth, token refresh, account health, live publish, provider error normalization, tests, and UI readiness labels through existing provider/scheduler/worker boundaries. Keep unsupported capabilities honest. Run all required gates, self-review the diff, open a non-draft PR only after local gates pass, wait for CodeRabbit findings, fix every actionable finding, wait for the follow-up review to settle, merge to main, and sync local main before declaring complete.
```
