> Archived 2026-06-24. Superseded by docs/MASTER_PLAN.md.

# Next Feature Plans

Last updated: 2026-06-22

## Purpose

These plans continue the post-agent-master roadmap after the current `main` branch completed the agent control plane, scheduling and provider readiness, supervised campaign/reporting/triage, memory, budgets, and governance export work.

The next product thesis is simple: convert the governed agent platform from a strong local/mock operating layer into a live, sellable social-content operations product.

## Current Status

- `main` is synced with `origin/main`.
- The AI-agent master plan work is merged.
- Provider readiness is visible, but live provider adapters remain scaffold-level except `mock`.
- Connections UI still exposes disabled configure/health actions.
- Billing and upgrade/invoice controls exist but remain disabled.
- Brand memory proposals exist, but there is no dedicated management workbench.

## Ranked Plan Files

1. [LinkedIn Provider Productionization](./01-linkedin-provider-productionization.md)
2. [Connections Control Center](./02-connections-control-center.md)
3. [Worker Runtime Readiness](./03-worker-runtime-readiness.md)
4. [Billing Activation Path](./04-billing-activation-path.md)
5. [Brand Memory Management Page](./05-brand-memory-management-page.md)

## Global Execution Rules

- Implement in rank order unless a plan explicitly says it can run in parallel.
- Keep provider, scheduler, worker, billing, and agent boundaries intact.
- Do not represent scaffold providers as live.
- Keep irreversible external actions behind provider health checks, policy checks, and explicit approval.
- Keep CodeRabbit review in the loop for every PR.
- Do not open a PR until local gates are green and the full diff has been self-reviewed.
- After every PR, wait for CodeRabbit's actual review body and inline comments. Fix every actionable finding or document why it is stale/non-actionable.
- Merge to `main` only when remote checks are green and CodeRabbit has no actionable findings.

## Global Verification Stack

Run for every plan:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
git diff --check
```

Also run:

```powershell
npm run test:e2e
```

when dashboard, create, connections, billing, agents, or navigation UI changes.

Run:

```powershell
npm run db:generate
```

when schema changes are made, then commit the generated migration and metadata.

## Master Goal Prompt

Use this when you want one continuous implementation run for every plan in this directory:

```text
/goal implement docs/next-feature-plans until no issues.

Read docs/next-feature-plans/README.md and then implement each ranked plan file in order:
1. docs/next-feature-plans/01-linkedin-provider-productionization.md
2. docs/next-feature-plans/02-connections-control-center.md
3. docs/next-feature-plans/03-worker-runtime-readiness.md
4. docs/next-feature-plans/04-billing-activation-path.md
5. docs/next-feature-plans/05-brand-memory-management-page.md

For each plan, implement the full listed requirements, run the required verification gates, self-review the full diff, open a non-draft PR only after local gates are green, wait for CodeRabbit's actual review body and inline findings, fix every actionable finding, wait for the follow-up review to settle, merge to main, sync local main, then continue to the next plan.

Do not stop at a PR being opened. Do not stop after local tests pass if CodeRabbit or remote checks are still pending. Continue until all five plans are implemented, reviewed, merged, and local main is synced.
```
