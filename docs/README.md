# Automated Content Creation & Scheduling Agent Docs

This folder is the public implementation planning system for the app. The private master planning copy lives in `.ai-plans/` and is intentionally ignored by Git.

## Document Map

Specs:
- `specs/00-product-prd.md` - product goals, users, scope, and acceptance criteria.
- `specs/01-architecture.md` - technical architecture and subsystem boundaries.
- `specs/02-ui-design-system.md` - theme, navigation, page organization, and UI rules.
- `specs/03-data-model.md` - database entities and relationships.
- `specs/04-langchain-agent-system.md` - LangChain agents, tools, schemas, prompts, and model routing.
- `specs/05-langgraph-workflows.md` - durable workflows, checkpoints, and human approval.
- `specs/06-provider-integrations.md` - social, messaging, and publishing adapters.
- `specs/07-billing-usage.md` - Clerk Billing, entitlements, usage, and limits.

Phase plans:
- `phases/phase-01-foundation.md`
- `phases/phase-02-auth-db-billing.md`
- `phases/phase-03-langchain-content-agent.md`
- `phases/phase-04-langgraph-content-workflow.md`
- `phases/phase-05-media-platform-variants.md`
- `phases/phase-06-provider-publishing.md`
- `phases/phase-07-comment-reply-agent.md`
- `phases/phase-08-analytics-n8n-release.md`

## Execution Rules

- Start each phase by rereading the matching spec and phase document.
- Run Codegraph before editing source once application code exists.
- Keep task packets small enough for one focused implementation session.
- Run verification before claiming completion.
- Update the phase document if scope or decisions change.
- Do not commit secrets or `.env` files.

## Initial Tooling Step

After Phase 0 docs exist, initialize local code intelligence:

```powershell
codegraph init -i
```

The `.codegraph/` folder is local only and excluded by `.gitignore`.
