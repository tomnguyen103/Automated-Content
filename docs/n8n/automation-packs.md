# n8n Automation Packs

These packs are importable n8n workflow templates for the signed event contract in
`lib/n8n/events.ts`. They are intentionally alert-and-callback workflows only:
they notify operators and write callbacks, but they do not retry publishes,
approve replies, change billing plans, or mutate provider credentials.

## Required App Environment

- `N8N_WEBHOOK_URL`: the production n8n webhook URL that receives app events.
- `N8N_WEBHOOK_SECRET`: shared HMAC secret used by the app and n8n.
- `NEXT_PUBLIC_APP_URL`: production app origin used to build callback URLs.

## Packs

| Pack | Event | Template |
| --- | --- | --- |
| Publish Failure Alert | `publishing.post.failed` | `docs/n8n/packs/publish-failure-alert.json` |
| Reply Approval Reminder | `reply.approval_requested` | `docs/n8n/packs/reply-approval-reminder.json` |
| Usage Threshold Alert | `usage.threshold_reached` | `docs/n8n/packs/usage-threshold-alert.json` |

## n8n Variables

Each imported workflow needs these variables or equivalent credentials:

- `AUTOMATED_CONTENT_WEBHOOK_SECRET`
- `AUTOMATED_CONTENT_CALLBACK_URL`
- One pack-specific notification endpoint:
  - `OPS_ALERT_WEBHOOK_URL`
  - `REVIEW_ALERT_WEBHOOK_URL`
  - `USAGE_ALERT_WEBHOOK_URL`

`AUTOMATED_CONTENT_CALLBACK_URL` should point to:

```text
https://<app-host>/api/webhooks/n8n
```

The templates include a `Validate signature` code node. Confirm the imported
workflow uses the raw webhook body your n8n version exposes before activating
the workflow; the app signs `<timestamp>.<raw body>`.

## Supported Actions

- Validate the signed app event.
- Filter for the pack event type.
- Notify the configured operations or review channel.
- Call back into `/api/webhooks/n8n` with accepted, completed, or failed status.

## Unsupported Actions

- Retrying failed publishes.
- Approving or rejecting reply suggestions.
- Upgrading billing plans or changing entitlements.
- Rotating provider credentials.

Those actions must stay inside the governed app workflow.
