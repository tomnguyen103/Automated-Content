# Phase 7: LangChain Comment Reply Agent

## Purpose

Ship safe keyword-based reply automation and approval-gated AI reply suggestions.

## Task Packets

### Task 1: Reply Rules Domain

Files:
- `lib/replies/rules.ts`
- `lib/replies/matcher.ts`
- `lib/replies/templates.ts`
- `lib/replies/audit.ts`

Acceptance:
- Keyword rules support platform scope, match type, template, rate limit, and enabled state.

Verification:
- Unit tests for matching and audit output.

### Task 2: Comment Agent and Workflow

Files:
- `lib/agents/langchain/comment-agent.ts`
- `lib/agents/graphs/comment-reply-workflow.ts`
- `lib/replies/approval.ts`

Acceptance:
- Keyword matches can produce approved template replies.
- Non-keyword AI suggestions go to approval.

Verification:
- Integration test with mock provider.

### Task 3: Auto Replies UI

Files:
- `app/(dashboard)/auto-replies/page.tsx`
- `components/replies/rule-builder.tsx`
- `components/replies/approval-queue.tsx`
- `components/replies/reply-log.tsx`

Acceptance:
- User can create rules, inspect inbox, approve suggestions, and read logs.

Verification:
- Playwright auto-reply rule flow.
