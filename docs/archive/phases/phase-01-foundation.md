> Archived 2026-06-24. Superseded by docs/MASTER_PLAN_v2.md.

# Phase 1: App Foundation and UI Shell

## Purpose

Create the Next.js 16 application foundation and professional UI shell before deeper product logic.

## Task Packets

### Task 1: Bootstrap Project Configuration

Files:
- `package.json`
- `next.config.ts`
- `tsconfig.json`
- `eslint.config.mjs`
- `postcss.config.mjs`
- `components.json`
- `.env.example`

Acceptance:
- Scripts exist for dev, build, lint, typecheck, test, and e2e.
- TypeScript path aliases are configured.
- Environment template is tracked while real `.env` files are ignored.

Verification:
- `npm install`
- `npm run typecheck`
- `npm run lint`

### Task 2: Create App Layout and Theme

Files:
- `app/layout.tsx`
- `app/globals.css`
- `lib/design/tokens.ts`

Acceptance:
- Geist fonts load through Next font.
- Theme tokens match `docs/specs/02-ui-design-system.md`.
- Global styles define accessible focus and base surfaces.

Verification:
- `npm run build`

### Task 3: Build Marketing and Dashboard Shell

Files:
- `app/(marketing)/page.tsx`
- `app/(dashboard)/dashboard/page.tsx`
- `components/layout/app-sidebar.tsx`
- `components/layout/top-bar.tsx`
- `components/layout/sub-nav.tsx`
- `components/layout/page-shell.tsx`

Acceptance:
- Landing screen communicates product value.
- Dashboard shell has sidebar, top bar, and sub-bar.
- Layout works on desktop and mobile.

Verification:
- `npm run build`
- Playwright screenshot check after app runs.
