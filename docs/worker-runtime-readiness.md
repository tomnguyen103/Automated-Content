# Worker Runtime Readiness

Last updated: 2026-06-22

## Purpose

The app can run without Redis in local preview, but deployable publishing and agent missions require the web app and worker process to share the same queue configuration.

## Runtime Topology

- Web app: creates scheduled rows, enqueues BullMQ jobs, and exposes queue health.
- Social worker: consumes `social-publishing` and `agent-missions`.
- Redis: stores BullMQ queue state, delayed jobs, retries, failures, and worker presence.
- Database: remains the source of truth for scheduled jobs, publish attempts, mission audit, and duplicate-send protection.

## Required Environment

```powershell
REDIS_URL=rediss://default:<password>@<host>:<port>
DATABASE_URL=postgres://...
PROVIDER_TOKEN_ENCRYPTION_KEY=<32+ byte secret>
```

LinkedIn live publishing also requires:

```powershell
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
LINKEDIN_REDIRECT_URI=https://<app-host>/api/connections/linkedin/callback
LINKEDIN_SCOPES="openid profile w_member_social"
LINKEDIN_API_VERSION=202606
```

## Local Preview

Local preview may leave `REDIS_URL` empty. In that mode:

- Agent missions can run inline.
- Mock publishing remains available for UI and automated tests.
- Worker health reports `preview` instead of treating Redis as an outage.

## Production Startup

Run the web app and worker as separate processes with the same environment.

```powershell
npm run build
npm run start
```

Start the worker through the deployment platform's worker command. The worker entrypoint is:

```powershell
npm run worker
```

The `worker` script runs the TypeScript entrypoint with `tsx --conditions react-server` so the same `@/` path aliases and server-only modules used by the app resolve in the worker process. If the host does not run TypeScript directly, compile or bundle the worker with the same Next.js build step used for server code.

## Failure Handling

- `queue_not_configured`: set `REDIS_URL` before relying on queued publishing.
- `redis_unavailable`: check Redis credentials, network access, TLS, and firewall rules.
- `worker_not_running`: start the worker process and confirm it uses the same `REDIS_URL`.
- `jobs_failed`: inspect publish attempts and retry only queue enqueue or provider transient failures.
- `jobs_waiting`: confirm delayed execution is expected or that workers are processing jobs.

## Safe Retry Rules

Automatic retry is allowed only for retryable queue or provider-transient failures. The retry endpoint blocks:

- already-published jobs
- jobs with a successful publish attempt
- provider configuration failures
- provider capability failures
- token scope failures
- policy blocks
- invalid content

The scheduled job row and publish attempts remain the duplicate-send guard.
