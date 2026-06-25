> Archived 2026-06-24. Superseded by docs/MASTER_PLAN.md.

# AI Work Management Workflow

## Purpose

Use AI to manage the project end-to-end without letting the work become a vague roadmap. Each phase is driven by specs, task packets, verification, and handoff notes.

## Roles

- Lead agent: owns phase sequencing, scope discipline, and final verification.
- UI agent: owns product surfaces, design tokens, layout, accessibility, and screenshots.
- Backend agent: owns routes, domain services, database code, queues, and workers.
- LangChain agent engineer: owns agent harnesses, tools, schemas, prompts, and model adapters.
- Integration agent: owns provider adapters, OAuth, webhooks, n8n, ImageKit, and platform constraints.
- Test agent: owns unit, integration, E2E, fixture, and regression coverage.
- Review agent: audits diffs, risk, security, and missing acceptance criteria before PR.

## Phase Lifecycle

1. Read the active phase doc and related specs.
2. Route the task with Ruflo/tooling.
3. Use Codegraph before source edits once code exists.
4. Break the phase into task packets.
5. Implement one packet at a time.
6. Run the verification listed in the task packet.
7. Record unresolved issues and lessons in the phase handoff.

## Agent Handoff Template

```md
## Handoff

Phase:
Task packet:
Files changed:
Verification run:
Result:
Known issues:
Next recommended task:
```

## Quality Gates

- No phase is done until acceptance criteria are checked line by line.
- No PR is opened until local gates are green.
- CodeRabbit review is required for every non-draft PR.
- App functionality must be verified with tests and, for UI, screenshots.
