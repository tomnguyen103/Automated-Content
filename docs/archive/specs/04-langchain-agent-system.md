> Archived 2026-06-24. Superseded by docs/MASTER_PLAN_v2.md.

# LangChain Agent System Spec

## Purpose

LangChain is the main AI agent harness. It owns model selection, prompts, tool calls, middleware, structured outputs, and agent execution boundaries.

## Agent Files

- `lib/agents/langchain/model-factory.ts`
- `lib/agents/langchain/middleware.ts`
- `lib/agents/langchain/content-agent.ts`
- `lib/agents/langchain/comment-agent.ts`
- `lib/agents/langchain/scheduler-agent.ts`

## Tool Files

- `lib/agents/tools/research-topic.ts`
- `lib/agents/tools/read-brand-profile.ts`
- `lib/agents/tools/retrieve-past-posts.ts`
- `lib/agents/tools/generate-platform-variant.ts`
- `lib/agents/tools/check-platform-policy.ts`
- `lib/agents/tools/suggest-schedule.ts`
- `lib/agents/tools/save-draft.ts`
- `lib/agents/tools/create-scheduled-job.ts`

## Schemas

- `lib/agents/schemas/content-pack.ts`
- `lib/agents/schemas/platform-variant.ts`
- `lib/agents/schemas/schedule-suggestion.ts`
- `lib/agents/schemas/comment-reply.ts`
- `lib/agents/schemas/agent-run.ts`

## Model Routing

Use `AI_PROVIDER=openai|gemini` and a model factory so providers can be swapped without rewriting agents. All agents must return structured outputs through Zod-compatible schemas.

## Agent Types

Content agent:
- Inputs: topic, audience, tone, goal, sources, platforms, media metadata.
- Tools: research, brand profile, past posts, platform variants, policy check, schedule suggestion, save draft.
- Output: content pack with ideas, captions, posts, variants, hashtags, CTA options, warnings.

Comment agent:
- Inputs: comment text, post context, keyword rules, brand voice, platform.
- Tools: keyword match, retrieve context, draft reply, safety check, approval route.
- Output: reply action, reply draft, confidence, approval requirement, audit notes.

Scheduler agent:
- Inputs: content variants, user preferences, platform constraints, usage limits.
- Tools: policy check, schedule suggestion, create scheduled job.
- Output: schedule recommendation and validation warnings.

## Safety Rules

- Never publish content directly from generation without user review in MVP.
- Auto replies are allowed only for keyword rules and approved templates.
- Non-keyword AI reply suggestions require approval.
- All agent runs must be logged with status, model, tool calls, trace ID, and error reason.
