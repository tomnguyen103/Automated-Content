> Archived 2026-06-24. Superseded by docs/MASTER_PLAN_v2.md.

# Phase 4: LangGraph Content Workflow

## Purpose

Convert the LangChain generation path into a durable workflow with checkpointing and human approval.

## Task Packets

### Task 1: Graph State and Checkpoints

Files:
- `lib/agents/graphs/state.ts`
- `lib/agents/graphs/checkpoints.ts`

Acceptance:
- Workflow state includes topic, sources, variants, approval status, errors, and trace IDs.
- Checkpoints can persist and resume state.

Verification:
- Unit tests for state transitions.

### Task 2: Content Workflow Nodes

Files:
- `lib/agents/graphs/content-workflow.ts`

Acceptance:
- Nodes cover intake, research, strategy, draft, platform adaptation, safety, schedule suggestion, review, and save.

Verification:
- Integration test with mock tools.

### Task 3: Approval UI

Files:
- `components/create/review-step.tsx`
- `components/create/approval-panel.tsx`

Acceptance:
- User can approve, request changes, or pause workflow.

Verification:
- Component tests and manual workflow check.
