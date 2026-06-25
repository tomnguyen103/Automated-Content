# Automated Content Creation & Scheduling Agent Docs

This folder is the public implementation planning system for the app. The private master planning copy lives in `.ai-plans/` and is intentionally ignored by Git.

## Document Map

Current canonical docs:
- `MASTER_PLAN.md` - the single consolidated implementation plan and current completion status.
- `MASTER_PLAN_V2_DEPLOYMENT_READY.md` - recommended deployment-ready v2 expansion plan for video/AI media workflows.
- `ai-agent-feature-roadmap.md` - current post-master feature roadmap and source-backed product analysis.
- `research/` - repo intelligence and external trend research used to shape the roadmap.

Archived source docs:
- `archive/specs/` - original PRD, architecture, design, data, workflow, provider, billing, and release specs.
- `archive/phases/` - original phase implementation plans.
- `archive/next-feature-plans/` - superseded next-feature plan bundle.
- `archive/n8n/` and `archive/worker-runtime-readiness.md` - superseded automation and worker readiness docs.

## Execution Rules

- Start implementation planning from `MASTER_PLAN.md`, then open archived source docs only when deeper historical context is needed.
- Run Codegraph before editing source once application code exists.
- Keep task packets small enough for one focused implementation session.
- Run verification before claiming completion.
- Update `MASTER_PLAN.md` if scope or completion decisions change.
- Do not commit secrets or `.env` files.

## Initial Tooling Step

After Phase 0 docs exist, initialize local code intelligence:

```powershell
codegraph init -i
```

The `.codegraph/` folder is local only and excluded by `.gitignore`.
