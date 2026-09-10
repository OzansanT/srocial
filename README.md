# Srocial

Srocial is a self-hosted social-media publishing, scheduling, monitoring, and business-messaging dashboard for Instagram, Facebook Pages, Threads, TikTok, and WhatsApp Business.

The architecture is intentionally modular: one scheduling engine, isolated provider adapters, a separate WhatsApp messaging subsystem, and server-only handling of OAuth credentials.

## Current Status

The runnable foundation currently includes:

- vanilla HTML/CSS/JavaScript dashboard and social-post composer;
- scheduled posts for Instagram, Facebook, Threads, and TikTok destinations;
- persistent development storage in `data/srocial.json`;
- separate post, publication, and scheduler-job records;
- atomic due-job claiming, worker locks, stale-lock recovery, retries, and idempotency guards;
- social-publication and asynchronous provider-status workers;
- provider-neutral Accounts/OAuth infrastructure;
- AES-256-GCM token encryption before credential persistence;
- one-time hashed OAuth state with expiry and replay protection;
- safe account listing and disconnect APIs that never return token fields;
- PostgreSQL production-target migrations under `server/db/migrations/`;
- dependency-free Node.js runtime and built-in Node tests.

Real social-provider HTTP adapters are **not connected yet**. The safe development default remains:

```text
ALLOW_REAL_PUBLISH=false
```

The server also does not run a recurring live scheduler loop yet. That will be enabled only after real provider adapters are registered and credentials are configured safely.

## Supported Channels

### Social publishing

- Instagram
- Facebook Pages
- Threads
- TikTok

### Business messaging

- WhatsApp Business Cloud API

WhatsApp remains a messaging/campaign subsystem rather than a public-post adapter. It will use contacts, consent, templates, campaigns, recipient-level message records, and delivery webhooks.

## Architecture

```text
Browser
  |
  +--> Posts / Dashboard / Accounts APIs
  |
  +--> OAuth start
          |
          v
     OAuth service
          |
    one-time state
          |
    provider auth adapter
          |
      provider login
          |
     OAuth callback
          |
      token exchange
          |
   identity resolution
          |
    token encryption
          |
          v
       Account

Scheduled content
      |
      v
   Scheduler
      |
 claim / lock
      |
  Dispatcher
   /      \
Publish   Status
worker    worker
   \      /
 Provider adapters
      |
  Repository
   /      \
 JSON    PostgreSQL target
```

Provider-specific endpoints, scopes, and response shapes belong inside provider adapters. They must not leak into the scheduler, generic OAuth services, or frontend.

## Technology

- **Frontend:** HTML, CSS, vanilla JavaScript ES modules.
- **Backend:** Node.js >= 20 using the built-in HTTP server for the current MVP.
- **Development persistence:** `data/srocial.json`.
- **Production database target:** PostgreSQL.
- **Future queue scaling:** Redis/BullMQ only when volume requires it.

No frontend or backend framework is required to run the current version.

## Run Locally

Requirements:

```text
Node.js >= 20
```

Start:

```bash
npm start
```

Default address:

```text
http://127.0.0.1:3000
```

Tests:

```bash
npm test
```

Important environment variables:

```text
APP_ENV=development
ALLOW_REAL_PUBLISH=false
HOST=127.0.0.1
PORT=3000
PUBLIC_BASE_URL=http://127.0.0.1:3000
DATA_FILE=./data/srocial.json
DATABASE_URL=postgres://...
TOKEN_ENCRYPTION_KEY=<long-random-secret>
```

`TOKEN_ENCRYPTION_KEY` is server-only. Do not expose it in frontend code, browser storage, logs, or Git history.

## Social Scheduling API

### Create a scheduled post

```http
POST /api/posts
Content-Type: application/json
```

```json
{
  "caption": "Scheduled content",
  "platforms": ["instagram", "threads"],
  "scheduledAt": "2026-09-11T10:00:00.000Z"
}
```

Rules:

- caption cannot be empty;
- schedule must be in the future;
- supported social destinations are `instagram`, `facebook`, `threads`, and `tiktok`;
- duplicate destinations are deduplicated;
- WhatsApp is rejected by the social-post endpoint;
- request bodies larger than 1 MiB are rejected.

A successful request creates one post plus one publication and one scheduler job per unique platform.

### List posts

```http
GET /api/posts
```

### Dashboard

```http
GET /api/dashboard
```

## Scheduler Execution

Scheduler jobs have their own states:

```text
SCHEDULED
RUNNING
RETRYING
COMPLETED
FAILED
CANCELLED
```

A scheduler tick performs:

```text
due work
 -> atomic claim
 -> RUNNING + lock
 -> dispatch
 -> provider adapter
 -> persist result
 -> complete / retry / reschedule
```

Default retry backoff is bounded:

```text
attempt 1 -> 1 minute
attempt 2 -> 5 minutes
attempt 3 -> 15 minutes
attempt 4+ -> 60 minutes
```

When a provider returns `PROCESSING`, the original publication job completes and a `STATUS_CHECK` job tracks the asynchronous result without republishing the content.

Every publish call receives the stable `publication.id` as its internal idempotency key.

## Accounts and OAuth

V4 introduces the generic connection layer that real provider adapters will use.

### Public API

```text
GET  /api/accounts
POST /api/accounts/:id/disconnect
POST /api/oauth/:provider/start
GET  /api/oauth/:provider/callback
```

`GET /api/accounts` returns safe metadata only. Raw and encrypted access/refresh tokens are deliberately omitted.

### OAuth flow

```text
POST /api/oauth/:provider/start
  -> create random state
  -> store only SHA-256 state hash
  -> provider adapter builds authorization URL

GET /api/oauth/:provider/callback?code=...&state=...
  -> validate provider + one-time state
  -> consume state
  -> exchange authorization code
  -> resolve provider account identity
  -> encrypt tokens with AES-256-GCM
  -> create/update account
  -> return safe account metadata
```

OAuth state defaults to a 10-minute lifetime and cannot be reused. A callback for the wrong provider does not consume the valid state.

### Account states

```text
DISCONNECTED
CONNECTING
CONNECTED
EXPIRED
ERROR
```

Disconnecting an account clears persisted token material and expiry data while retaining safe provider/account identity metadata.

### Provider auth adapter contract

A provider implementation supplies:

```js
{
  getAuthorizationUrl({ state, redirectUri }),
  exchangeCode({ code, redirectUri }),
  getAccountIdentity({ accessToken })
}
```

The generic OAuth service contains no Instagram-, Meta-, TikTok-, or WhatsApp-specific endpoint logic.

No live provider adapters are registered by the runtime yet, so OAuth start currently returns `unsupported_provider` until the next provider-specific integration is added.

## Database Migrations

```text
server/db/migrations/001_initial.sql
server/db/migrations/002_scheduler_execution.sql
server/db/migrations/003_accounts_oauth.sql
```

`003_accounts_oauth.sql` adds account connection metadata and persistent OAuth-state storage for the production PostgreSQL target.

## Security Boundary

```text
Browser
   |
   | safe Srocial API data
   v
Node.js backend
   |
   | encrypted stored credentials
   | raw tokens only during server-side provider calls
   v
Provider APIs
```

Never place provider secrets, access tokens, refresh tokens, application secrets, or encryption keys in HTML, CSS, browser JavaScript, localStorage, sessionStorage, public JSON, or Git history.

## Repository Structure

```text
srocial/
|- README.md
|- updaterules.md
|- client/
|- server/
|  |- auth/
|  |- db/
|  |  `- migrations/
|  |- http/
|  |- routes/
|  |- services/
|  |- scheduler/
|  |  `- workers/
|  |- platforms/
|  `- messaging/
|- tests/
|- docs/superpowers/
|- .env.example
`- package.json
```

## Development Direction

Next priorities:

1. Instagram/Meta OAuth provider adapter and account discovery;
2. Instagram as the first real publishing adapter;
3. account-scoped publications instead of platform-only destinations;
4. recurring scheduler loop with registered real adapters;
5. Threads and Facebook provider adapters;
6. TikTok OAuth and Content Posting integration;
7. media storage and provider-specific media validation;
8. webhook processing with real provider events;
9. WhatsApp contacts, templates, campaigns, and recipient-level delivery tracking;
10. production PostgreSQL repository implementation.

## Development Rules

All contributors and AI coding agents must read `updaterules.md` before changing the project.

`README.md` defines current capability and architecture. `updaterules.md` defines how Srocial is allowed to evolve.
