> Archived 2026-06-24. Superseded by docs/MASTER_PLAN.md.

# Release Checklist

## Required Gates

Run these before release:

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run test:e2e`

All checks must pass locally before opening a pull request.

## Runtime Configuration

Start from `.env.production.example`; store secrets in the production secret
manager and non-secret runtime config in the production env store, then verify
production values are set:

- `NEXT_PUBLIC_APP_URL`
- Clerk publishable and secret keys
- `CLERK_WEBHOOK_SIGNING_SECRET`
- `BILLING_UPGRADE_URL`
- `BILLING_CUSTOMER_PORTAL_URL`
- `DATABASE_URL`
- AI provider key for the selected `AI_PROVIDER`
- `LANGSMITH_API_KEY`
- `LANGSMITH_PROJECT`
- ImageKit keys when media upload is enabled
- `PROVIDER_TOKEN_ENCRYPTION_KEY`
- `REDIS_URL`
- `N8N_WEBHOOK_URL`
- `N8N_WEBHOOK_SECRET`

`npm run release:readiness -- --confirm-gates-passed --confirm-manual-smoke-passed`
blocks blank, localhost, local, test, example, invalid, and wrong-scheme values.
Production URL values must use the schemes expected by the release checker.

## Database and Queues

- Apply Drizzle migrations before routing production traffic.
- Verify `usage_ledger_quantity_positive_check` exists.
- Verify BullMQ can enqueue and workers can process `publish-post`.
- Confirm failed enqueue rows stay visible in the calendar.

## Observability

- LangChain model calls include trace metadata with trace ID, run ID, user ID, workspace ID, provider, and model.
- LangGraph content workflow invocations include trace metadata and thread ID.
- Structured logs include agent lifecycle events and n8n callbacks.
- LangSmith project is configured for the production environment.

## n8n Automation

- `N8N_WEBHOOK_SECRET` is shared only with n8n.
- Outbound event signatures validate in n8n before workflow execution.
- `/api/webhooks/n8n` rejects unsigned and malformed callbacks.
- Publish failure, reply approval reminder, and usage threshold workflows are documented in `docs/n8n/workflows.md`.

## Product Smoke Tests

- Local preview can open Dashboard, Create, Calendar, Media, Auto Replies, Billing, and Analytics without console errors.
- Create flow pauses for review and saves only after approval.
- Auto reply flow can create a rule, run matching, approve a suggestion, and write logs.
- Analytics shows posting counts, failures, replies, usage, and recent agent activity.

## Release Decision

Release is ready only when all required gates pass and no actionable CodeRabbit findings remain on the pull request.
