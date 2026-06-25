> Archived 2026-06-24. Superseded by docs/MASTER_PLAN.md.

# Product PRD

## Objective

Build a SaaS product that helps users research topics, generate high-quality social content, tailor variations by platform, schedule posts, publish automatically, and manage keyword-based comment replies.

## Target Users

- Solo creators who need consistent posting without burnout.
- Founders and operators who want a strong online presence.
- Social media managers who need multi-platform workflows.
- Small teams that need content planning, scheduling, and basic automation.

## MVP Outcome

Users can generate and schedule up to seven posts per day on supported platforms, see scheduled content on a calendar, connect social accounts, upload media, and configure keyword-based reply automation.

## In Scope for MVP

- Landing screen.
- Clerk auth and billing.
- Free and Premium plans.
- AI content generation from topics, source material, and goals.
- Platform-specific variants.
- Media upload and ImageKit transformation.
- Calendar scheduling.
- Durable publishing queue.
- Core social and messaging providers.
- Keyword-based comment replies.
- Analytics/counting dashboard.
- Internal n8n automation hooks.
- LangChain, LangGraph, and LangSmith agent ecosystem.

## Out of Scope for MVP

- Unofficial browser-based social posting.
- Fully autonomous comment replies for all comments.
- Public end-user n8n workflow builder.
- Advanced team permissions beyond basic workspace membership.
- White-label agency workspaces.
- Mobile native apps.

## Success Criteria

- User can sign up, connect a provider, generate content, attach media, schedule it, and see it in calendar.
- User can run a LangChain content agent that produces structured outputs.
- User can approve or adjust generated variants before scheduling.
- Scheduled jobs persist in the database before queue enqueue.
- Queue failures are visible and retryable.
- Premium limits gate seven-post-per-day automation.
- Keyword replies are audited and safe by default.
