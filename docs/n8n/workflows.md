# n8n Workflow Integration

Phase 8 uses signed webhooks for internal workflow automation. The app can emit outbound events to n8n, and n8n can call back into the app after a workflow accepts, completes, or fails.

## Environment

Set these values in the runtime that emits events and receives callbacks:

- `N8N_WEBHOOK_URL`: n8n production webhook URL for inbound app events.
- `N8N_WEBHOOK_SECRET`: shared secret used for HMAC signatures.

Do not expose either value to the browser.

## Outbound App Events

Use `createN8nClient().emit(...)` from server-side code. The client sends JSON to `N8N_WEBHOOK_URL` with these headers:

- `content-type: application/json`
- `x-automated-content-event`
- `x-automated-content-timestamp`
- `x-automated-content-signature`

The signature is `sha256=<hmac>` over `<timestamp>.<raw body>` using `N8N_WEBHOOK_SECRET`.

Supported event names:

- `content.workflow.review_requested`
- `content.workflow.approved`
- `content.draft.saved`
- `publishing.post.queued`
- `publishing.post.published`
- `publishing.post.failed`
- `reply.approval_requested`
- `reply.sent`
- `reply.failed`
- `usage.threshold_reached`

Example payload:

```json
{
  "id": "evt_123",
  "event": "publishing.post.failed",
  "workspaceId": "00000000-0000-0000-0000-000000000001",
  "occurredAt": "2026-06-20T18:00:00.000Z",
  "data": {
    "scheduledJobId": "job_123",
    "provider": "linkedin",
    "errorCode": "provider_rate_limited"
  }
}
```

## Callback Endpoint

n8n calls back to:

```text
POST /api/webhooks/n8n
```

The callback must use the same timestamp and signature headers. Payload shape:

```json
{
  "id": "callback_123",
  "workflow": "publish-failure-alert",
  "status": "completed",
  "eventId": "evt_123",
  "workspaceId": "00000000-0000-0000-0000-000000000001",
  "message": "Slack alert delivered",
  "data": {
    "executionId": "42"
  }
}
```

The app rejects missing, stale, or invalid signatures before parsing the callback payload.

## Initial Workflows

Recommended n8n workflows for release:

- Publish failure alert: listen for `publishing.post.failed`, notify the ops channel, and call back with `status: completed`.
- Reply approval reminder: listen for `reply.approval_requested`, delay for one hour, notify if still pending, and call back with `status: accepted`.
- Usage threshold alert: listen for `usage.threshold_reached`, notify workspace owners, and call back with `status: completed`.

## Local Test Path

1. Set `N8N_WEBHOOK_SECRET` to a local shared secret.
2. Use the unit tests in `tests/n8n` to verify signing and callback validation.
3. For a live n8n smoke test, point `N8N_WEBHOOK_URL` at an n8n test webhook and emit a sample event from a server route or script.
