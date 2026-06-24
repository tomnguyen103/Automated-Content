> Archived 2026-06-24. Superseded by docs/MASTER_PLAN_v2.md.

# LangGraph Workflows Spec

## Purpose

LangGraph turns LangChain agents and tools into durable workflows with state, checkpoints, retry behavior, and human approval.

## Workflow Files

- `lib/agents/graphs/state.ts`
- `lib/agents/graphs/checkpoints.ts`
- `lib/agents/graphs/content-workflow.ts`
- `lib/agents/graphs/comment-reply-workflow.ts`
- `lib/agents/graphs/publishing-workflow.ts`

## Content Workflow

Nodes:
- Intake
- Research
- Strategy
- Draft
- Platform adaptation
- Safety check
- Schedule suggestion
- Human review checkpoint
- Save

Human-in-the-loop:
- User must approve before scheduling.
- User can edit variants before approval.
- Workflow must resume after approval.

## Comment Reply Workflow

Nodes:
- Ingest comment
- Match keyword rules
- Retrieve post and brand context
- Draft reply
- Safety check
- Decide auto-send or approval queue
- Send reply
- Audit

## Publishing Workflow

Nodes:
- Load scheduled job
- Validate entitlement and connection health
- Refresh token if needed
- Publish through provider adapter
- Record attempt
- Retry or mark final status
- Emit analytics and n8n event

## Checkpoint Requirements

- Store workflow state by workspace and run ID.
- Store user approval decisions.
- Store errors in a way the UI can display and retry.
- Attach LangSmith trace IDs to every run.
