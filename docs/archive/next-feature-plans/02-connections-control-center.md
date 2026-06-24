> Archived 2026-06-24. Superseded by docs/MASTER_PLAN_v2.md.

# Plan 02: Connections Control Center

## Rank

2 of 5.

## Goal

Turn the Connections page from a capability matrix with disabled controls into an operational provider control center where users can connect, disconnect, refresh health, inspect readiness blockers, and run safe provider diagnostics.

## Dependencies

- Plan 01 should land first for LinkedIn-specific live flows.
- This plan can still improve mock/scaffold provider clarity before LinkedIn is live, but the highest value comes after one live provider exists.

## Requirements

- Replace disabled provider action buttons with real actions where supported.
- Keep scaffold provider actions disabled with clear reasons.
- Add provider-specific health refresh actions.
- Add disconnect flow with explicit confirmation.
- Show connected account metadata:
  - display name
  - provider account id
  - status
  - last validated time
  - scopes
  - supported capabilities
  - blocking reason
- Add "test publish" only for mock or safe dry-run providers unless real provider test publishing is explicitly supported.
- Show readiness history or the most recent health check result.
- Keep secrets and token refs out of client payloads.
- Add route-level JSON error contracts for connect, callback, disconnect, and health actions.

## Key Existing Files

- `app/(dashboard)/connections/page.tsx`
- `app/api/connections/[provider]/connect/route.ts`
- `app/api/connections/[provider]/callback/route.ts`
- `app/api/connections/[provider]/disconnect/route.ts`
- `app/api/connections/[provider]/health/route.ts`
- `lib/providers/registry.ts`
- `lib/providers/health.ts`
- `lib/providers/token-vault.ts`
- `db/schema.ts`
- `tests/providers/provider-contract.test.ts`
- `e2e/phase-09.spec.ts`

## Implementation Steps

1. Read current provider integration docs and the Connections page.
2. Define the client-facing provider connection state shape.
3. Add or complete API handlers:
   - `GET /api/connections/[provider]/health`
   - `POST /api/connections/[provider]/disconnect`
   - `POST /api/connections/[provider]/test` if a safe diagnostic route is needed
4. Ensure every route scopes data to the current workspace.
5. Ensure every route catches failures and returns structured JSON errors.
6. Add repository helpers if current connected account access is duplicated or too route-specific.
7. Update Connections UI:
   - provider status sections
   - capability matrix
   - account detail panel
   - connect/configure action
   - refresh health action
   - disconnect action with confirmation
   - scaffold-only disabled state with reason
8. Keep UI dense and operational, matching the dashboard style.
9. Add empty/loading/error states for actions.
10. Add tests for:
    - ready provider health response
    - scaffold provider configuration-required response
    - disconnect success
    - disconnect non-owned account rejection
    - route JSON error shape
11. Add e2e coverage for Connections if UI flow changes materially.
12. Run gates, open non-draft PR, wait for CodeRabbit, fix, merge, sync.

## Acceptance Criteria

- Connections page shows which providers are live, mock, scaffold, ready, or blocked.
- Users can refresh health for configured providers.
- Users can disconnect a provider account safely.
- Scaffold providers cannot be accidentally treated as configured.
- Provider readiness details are actionable without exposing tokens.
- Route errors are structured and user-facing enough for the UI.

## Verification

```powershell
npm test -- tests/providers/provider-contract.test.ts
npm run lint
npm run typecheck
npm run build
npm run test:e2e
git diff --check
```

## Risks

- Overloading one dashboard page with too much provider detail.
- Accidentally exposing token refs or provider metadata that should stay server-only.
- Creating a "test publish" action that performs an irreversible live action.

## `/goal` Prompt

```text
/goal implement docs/next-feature-plans/02-connections-control-center.md until no issues.

Read the plan file, provider specs, current Connections page, and provider routes first. Build the operational provider control center with real connect/health/disconnect actions where supported, scaffold-safe disabled states, structured route errors, workspace scoping, tests, and e2e coverage when UI flow changes. Run all required gates, self-review the diff, open a non-draft PR only after local gates pass, wait for CodeRabbit findings, fix every actionable finding, wait for the follow-up review to settle, merge to main, and sync local main before declaring complete.
```
