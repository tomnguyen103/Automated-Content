> Archived 2026-06-24. Superseded by docs/MASTER_PLAN_v2.md.

# Billing and Usage Spec

## Plans

Free:
- Limited AI generations.
- Limited scheduled posts.
- Limited provider connections.
- Basic calendar and drafts.

Premium:
- Up to seven scheduled posts per day.
- Multi-platform publishing.
- Advanced AI generation.
- ImageKit transformations.
- Keyword auto replies.
- Analytics and usage history.

## Files

- `lib/billing/entitlements.ts`
- `lib/billing/usage.ts`
- `lib/billing/clerk-sync.ts`
- `app/api/webhooks/clerk/route.ts`
- `app/(dashboard)/billing/page.tsx`
- `components/billing/plan-card.tsx`
- `components/billing/usage-meter.tsx`

## Usage Ledger

Use durable usage ledger rows for:
- AI generation.
- Scheduled post reservation.
- Publish attempts.
- Media transformations.
- Auto replies.

## Enforcement Points

- Before AI generation.
- Before scheduling.
- Before media transformation.
- Before auto reply send.
- Before adding provider connections above free limits.

## Acceptance

Entitlement checks must be reusable from API routes, workers, and UI loaders.
