> Archived 2026-06-24. Superseded by docs/MASTER_PLAN.md.

# Plan 04: Billing Activation Path

## Rank

4 of 5.

## Goal

Turn existing billing, entitlements, and usage tracking into a real activation path with upgrade/customer-portal flows and paid feature gates.

## Why This Matters

The app already has Clerk auth, billing state, entitlements, usage ledger, plan cards, and usage meters. The product still cannot monetize because upgrade and invoice actions are disabled and premium limits are not tied to a working purchase or portal flow.

## Requirements

- Wire Clerk Billing or the chosen billing provider to upgrade and customer portal actions.
- Replace disabled Billing tabs/actions with live actions where configured.
- Preserve local preview behavior when billing is not configured.
- Enforce plan gates for:
  - provider connections
  - live provider publishing
  - mission budget caps
  - governance export
  - brand memory proposal volume
  - auto replies
  - scheduled posts
- Make upgrade prompts contextual and non-blocking where possible.
- Ensure usage ledger records match entitlement checks.
- Add route tests for billing action error contracts.
- Never log billing secrets or customer portal URLs beyond their intended response.

## Key Existing Files

- `docs/specs/07-billing-usage.md`
- `lib/billing/entitlements.ts`
- `lib/billing/usage.ts`
- `lib/billing/clerk-sync.ts`
- `components/billing/plan-card.tsx`
- `components/billing/usage-meter.tsx`
- `app/(dashboard)/billing/page.tsx`
- `app/api/webhooks/clerk/route.ts`
- `app/api/ai/generate/route.ts`
- `app/api/posts/[id]/schedule/route.ts`
- `app/api/agents/governance-export/route.ts`
- `tests/billing/usage.test.ts`
- `tests/billing/entitlements.test.ts`

## Implementation Steps

1. Read billing spec and current Clerk webhook sync.
2. Confirm the available Clerk Billing APIs and current installed SDK types locally.
3. Add env vars and `.env.example` entries for billing URLs/plan identifiers if needed.
4. Implement server action or API route for:
   - start upgrade/checkout
   - open customer portal
5. Update Billing page:
   - live upgrade action when configured
   - live portal/invoice action when configured
   - clear disabled/local-preview state when not configured
6. Audit entitlement checks across:
   - generation
   - scheduling
   - provider connections
   - agents
   - replies
   - governance export
   - brand memory
7. Add missing `ensureUsageAllowed` or `consumeUsageForLimit` checks.
8. Add contextual upgrade prompts where a limit blocks action.
9. Add tests for:
   - free plan blocked at limits
   - premium plan allowed
   - local preview fallback
   - upgrade route configured/unconfigured
   - webhook sync updates subscription state
10. Run gates, open PR, wait for CodeRabbit, fix, merge, sync.

## Acceptance Criteria

- Billing page has working upgrade/customer portal actions when configured.
- Local preview shows honest disabled billing state without crashing.
- Paid feature gates are enforced server-side.
- Usage records and usage meter totals align.
- Blocked actions return actionable upgrade/limit errors.

## Verification

```powershell
npm test -- tests/billing/usage.test.ts tests/billing/entitlements.test.ts
npm run lint
npm run typecheck
npm run build
npm run test:e2e
git diff --check
```

Run additional API route tests if new billing route test files are added.

## Risks

- Clerk Billing API shape may differ from assumptions; verify local SDK types before coding.
- Billing flows can create real external state in non-preview environments.
- Entitlement checks must be server-side; UI-only gating is insufficient.

## `/goal` Prompt

```text
/goal implement docs/next-feature-plans/04-billing-activation-path.md until no issues.

Read billing specs, current entitlements, usage ledger, Clerk sync, and local SDK types first. Wire upgrade/customer portal actions, enforce server-side paid gates, preserve local preview behavior, add contextual upgrade errors, and cover billing flows with tests. Run all required gates, self-review the diff, open a non-draft PR only after local gates pass, wait for CodeRabbit findings, fix every actionable finding, wait for the follow-up review to settle, merge to main, and sync local main before declaring complete.
```
