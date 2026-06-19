# Provider Integrations Spec

## MVP Provider Groups

Core social:
- Meta: Instagram and Facebook Pages.
- LinkedIn.
- X.

Messaging/community:
- Discord webhooks.
- Slack messages.

## Adapter Contract

Each provider adapter should expose:
- `connect`
- `refreshToken`
- `validateCapabilities`
- `publish`
- `replyToComment`
- `fetchMetrics`
- `normalizeError`

## Files

- `lib/providers/types.ts`
- `lib/providers/errors.ts`
- `lib/providers/registry.ts`
- `lib/providers/token-vault.ts`
- `lib/providers/capabilities.ts`
- `lib/providers/meta.ts`
- `lib/providers/linkedin.ts`
- `lib/providers/x.ts`
- `lib/providers/slack.ts`
- `lib/providers/discord.ts`
- `lib/providers/mock.ts`

## Capability Matrix

The UI must be driven by capabilities instead of assumptions:
- Text post
- Image post
- Video post
- Carousel
- Scheduled publish
- Immediate publish
- Comment ingest
- Comment reply
- Metrics sync

## Policy

Use official APIs and webhooks only. Do not implement credential sharing, unofficial browser automation, scraping behind login, or methods that violate provider terms.
