> Archived 2026-06-24. Superseded by docs/MASTER_PLAN.md.

# Phase 8: Analytics, n8n, Observability, and Release

## Purpose

Close the loop with analytics, internal workflow automation, traces, and release readiness.

## Task Packets

### Task 1: Analytics Surfaces

Files:
- `lib/analytics/metrics.ts`
- `app/(dashboard)/analytics/page.tsx`
- `components/analytics/platform-breakdown.tsx`
- `components/analytics/usage-chart.tsx`
- `components/analytics/agent-run-table.tsx`

Acceptance:
- Dashboard shows posting counts, failures, replies, usage, and agent activity.

Verification:
- Unit tests for metric aggregation.

### Task 2: n8n Events

Files:
- `lib/n8n/client.ts`
- `lib/n8n/events.ts`
- `app/api/webhooks/n8n/route.ts`
- `docs/n8n/workflows.md`

Acceptance:
- App can emit authenticated internal workflow events.
- n8n callback endpoint validates payloads.

Verification:
- Integration test for event dispatch and callback validation.

### Task 3: Observability and Release

Files:
- `lib/observability/langsmith.ts`
- `lib/observability/agent-events.ts`
- `lib/observability/logger.ts`
- `docs/specs/07-release-checklist.md`

Acceptance:
- LangChain and LangGraph runs include trace metadata.
- Release checklist is complete.

Verification:
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run test:e2e`
