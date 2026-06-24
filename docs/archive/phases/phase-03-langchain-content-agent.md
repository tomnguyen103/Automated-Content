> Archived 2026-06-24. Superseded by docs/MASTER_PLAN_v2.md.

# Phase 3: LangChain Content Agent

## Purpose

Build the first real AI agent: topic input to structured content pack and platform variants.

## Task Packets

### Task 1: Model Factory and Schemas

Files:
- `lib/agents/langchain/model-factory.ts`
- `lib/agents/schemas/content-pack.ts`
- `lib/agents/schemas/platform-variant.ts`
- `lib/agents/schemas/schedule-suggestion.ts`
- `lib/agents/schemas/agent-run.ts`

Acceptance:
- `AI_PROVIDER=openai|gemini` selects the provider.
- Schemas validate generated content packs.

Verification:
- Unit tests for schema parsing and provider selection.

### Task 2: LangChain Tools

Files:
- `lib/agents/tools/research-topic.ts`
- `lib/agents/tools/read-brand-profile.ts`
- `lib/agents/tools/retrieve-past-posts.ts`
- `lib/agents/tools/generate-platform-variant.ts`
- `lib/agents/tools/check-platform-policy.ts`
- `lib/agents/tools/suggest-schedule.ts`
- `lib/agents/tools/save-draft.ts`

Acceptance:
- Tools are typed, testable, and safe with mock dependencies.

Verification:
- Unit tests for each tool with fixture inputs.

### Task 3: Content Agent API and UI

Files:
- `lib/agents/langchain/content-agent.ts`
- `lib/agents/langchain/middleware.ts`
- `app/api/ai/generate/route.ts`
- `app/api/agent-runs/[id]/route.ts`
- `app/(dashboard)/create/page.tsx`
- `components/create/brief-form.tsx`
- `components/create/generation-timeline.tsx`
- `components/create/draft-editor.tsx`
- `components/create/platform-tabs.tsx`

Acceptance:
- User submits a topic and receives structured drafts.
- Agent run metadata is visible.

Verification:
- Integration test with mock model.
- Manual create flow.
