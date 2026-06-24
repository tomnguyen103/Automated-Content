> Archived 2026-06-24. Superseded by docs/MASTER_PLAN_v2.md.

# Data Model Spec

## Core Entities

- `users`: Clerk-linked user profile.
- `workspaces`: billing and content ownership boundary.
- `memberships`: user access to workspaces.
- `subscriptions`: Clerk Billing subscription sync.
- `usage_ledger`: durable usage accounting for generation, scheduled posts, media transforms, and replies.
- `connected_accounts`: OAuth/API connections with encrypted token references.
- `media_assets`: ImageKit-backed media metadata.
- `content_topics`: original user briefs and research inputs.
- `content_drafts`: canonical AI-generated content packs.
- `platform_variants`: per-platform copy, media, warnings, and publishing options.
- `scheduled_jobs`: durable schedule state.
- `publish_attempts`: attempts, provider responses, errors, and retry metadata.
- `comment_events`: ingested comments and provider metadata.
- `auto_reply_rules`: keyword matching rules and response templates.
- `reply_attempts`: reply status, audit, and provider response.
- `agent_runs`: LangChain and LangGraph run metadata.
- `n8n_events`: internal workflow dispatch log.

## Ownership Rules

- Every content object belongs to a workspace.
- Every provider connection belongs to a workspace.
- Route handlers must check workspace membership before reading or writing data.
- User-owned data must never be queried only by row ID without workspace scope.

## Persistence Rules

- Store external tokens encrypted or via a token vault abstraction.
- Store media metadata, not raw files.
- Store AI structured output and trace IDs for debugging.
- Store scheduled jobs before queue enqueue.

## Future Migrations

The first Drizzle implementation should keep tables explicit and boring. Avoid premature polymorphic schemas until provider behavior proves the need.
