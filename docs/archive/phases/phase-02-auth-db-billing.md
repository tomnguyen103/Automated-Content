> Archived 2026-06-24. Superseded by docs/MASTER_PLAN_v2.md.

# Phase 2: Auth, Database, and Billing Base

## Purpose

Make the app durable, authenticated, workspace-aware, and subscription-aware.

## Task Packets

### Task 1: Environment and Database Foundation

Files:
- `lib/env.ts`
- `db/schema.ts`
- `db/index.ts`
- `drizzle.config.ts`

Acceptance:
- Runtime env validation exists.
- Drizzle can connect to Neon.
- Initial workspace, user, subscription, and usage tables are defined.

Verification:
- `npm run typecheck`
- Drizzle migration command once dependencies are installed.

### Task 2: Clerk Auth

Files:
- `app/sign-in/[[...sign-in]]/page.tsx`
- `app/sign-up/[[...sign-up]]/page.tsx`
- `app/api/webhooks/clerk/route.ts`
- `lib/auth/current-user.ts`

Acceptance:
- Protected dashboard requires authentication.
- Clerk webhook can sync users and subscription state.

Verification:
- Local sign-in flow.
- Unsigned webhook returns expected failure.

### Task 3: Billing Entitlements

Files:
- `lib/billing/entitlements.ts`
- `lib/billing/usage.ts`
- `app/(dashboard)/billing/page.tsx`
- `components/billing/plan-card.tsx`
- `components/billing/usage-meter.tsx`

Acceptance:
- Free and Premium limits are represented in code.
- UI can show plan and usage state.

Verification:
- Unit tests for entitlement checks.
