# Architecture Spec

## Stack

- Framework: Next.js 16 App Router.
- Language: TypeScript.
- UI: shadcn/ui, Tailwind, custom design tokens.
- Auth: Clerk.
- Billing: Clerk Billing.
- Database: Neon Postgres.
- ORM: Drizzle.
- Media: ImageKit.
- Jobs: BullMQ with Redis-compatible backend.
- AI: LangChain, LangGraph, LangSmith, OpenAI or Gemini.
- Automation: n8n internal workflows.

## Application Boundaries

- App routes own UI and server route entrypoints.
- `lib/` owns domain logic, adapters, validators, and external integrations.
- `db/` owns schema and database connection.
- `workers/` owns long-running queue consumers.
- `tests/` owns unit and integration coverage.
- `e2e/` owns Playwright browser flows.

## Primary Subsystems

- Auth and workspace membership.
- Billing and entitlement enforcement.
- AI agent system.
- LangGraph workflows.
- Media management.
- Provider connections.
- Scheduling and publishing.
- Comment ingest and replies.
- Analytics and observability.
- n8n workflow events.

## Scheduling Rule

The database is authoritative. Create post records, variants, usage reservations, and scheduled job records in a single transaction. Enqueue BullMQ only after commit. If enqueue fails, keep the durable record and mark enqueue status as failed.

## Verification

- Typecheck: `npm run typecheck`
- Lint: `npm run lint`
- Unit/integration: `npm test`
- Build: `npm run build`
- E2E: `npm run test:e2e`
