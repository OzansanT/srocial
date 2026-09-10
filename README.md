# Srocial

Srocial is a self-hosted social-media publishing, scheduling, monitoring, and business-messaging dashboard for Instagram, Facebook Pages, Threads, TikTok, and WhatsApp Business.

The architecture uses one scheduling engine, isolated provider adapters, a separate WhatsApp messaging subsystem, and server-only handling of OAuth credentials.

## Current Status

The runnable foundation currently includes:

- vanilla HTML/CSS/JavaScript dashboard and social-post composer;
- scheduled posts for Instagram, Facebook, Threads, and TikTok destinations;
- persistent development storage in `data/srocial.json`;
- separate post, media, publication, account, OAuth-state, and scheduler-job records;
- atomic due-job claiming, worker locks, stale-lock recovery, retries, and idempotency guards;
- social-publication and asynchronous provider-status workers;
- provider-neutral Accounts/OAuth infrastructure;
- AES-256-GCM token encryption before credential persistence;
- one-time hashed OAuth state with expiry and replay protection;
- safe account listing/disconnect APIs that never return token fields;
- a real Instagram provider based on Meta's Instagram Login flow for professional accounts;
- Instagram short-token to long-lived-token exchange and professional account identity discovery;
- Instagram single-image and Reel container/publish/status adapter logic;
- PostgreSQL production-target migrations under `server/db/migrations/`;
- dependency-free Node.js runtime and built-in Node tests.

The safe development default remains:

```text
ALLOW_REAL_PUBLISH=false
```

The server does **not** run a recurring live scheduler loop yet. V5 supplies the real Instagram provider boundary, but the existing composer/API still needs to bind selected accounts and media records to publications before scheduled Instagram publishing can be enabled end-to-end.

## Supported Channels

### Social publishing

- Instagram — provider integration available in V5
- Facebook Pages — planned
- Threads — planned
- TikTok — planned

### Business messaging

- WhatsApp Business Cloud API — planned as a separate messaging/campaign subsystem

WhatsApp is not modeled as a public-post adapter. It will use contacts, consent, templates, campaigns, recipient-level message records, and delivery webhooks.

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

Provider-specific endpoints, scopes, validation, and response shapes remain inside provider modules. They must not leak into the generic scheduler, OAuth service, or frontend.

## Technology

- **Frontend:** HTML, CSS, vanilla JavaScript ES modules.
- **Backend:** Node.js >= 20 using the built-in HTTP server.
- **Development persistence:** `data/srocial.json`.
- **Production database target:** PostgreSQL.
- **Future queue scaling:** Redis/BullMQ only when volume requires it.

No npm dependency is required for the current runtime.

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

Base environment:

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

Provider credentials and encryption keys are server-only. Do not expose them in frontend code, browser storage, logs, or Git history.

## Instagram V5 Provider

V5 uses **Instagram API with Instagram Login** for Instagram professional accounts (Business/Creator). It does not require the connected Instagram professional account to be linked to a Facebook Page.

### Required environment variables

```text
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
INSTAGRAM_API_VERSION=v26.0
```

If `INSTAGRAM_APP_ID` or `INSTAGRAM_APP_SECRET` is missing, Instagram is not registered and ordinary development startup continues normally.

### OAuth scopes

Srocial V5 requests only the permissions needed for identity and publishing:

```text
instagram_business_basic
instagram_business_content_publish
```

### OAuth flow

```text
POST /api/oauth/instagram/start
  -> Srocial creates one-time OAuth state
  -> Instagram authorization URL
  -> user authorizes professional account

GET /api/oauth/instagram/callback?code=...&state=...
  -> validate and consume state
  -> POST api.instagram.com/oauth/access_token
  -> receive short-lived token
  -> exchange at graph.instagram.com/access_token
  -> receive long-lived token
  -> GET graph.instagram.com/v26.0/me
  -> encrypt token
  -> create/update Srocial account
```

OAuth responses returned to the browser contain safe account metadata only.

### Instagram publishing contract

V5 supports the provider-side flow for one externally hosted HTTPS image or one Reel video.

Image:

```text
POST /{ig-user-id}/media
  image_url + caption
       |
       v
POST /{ig-user-id}/media_publish
       |
       v
PUBLISHED
```

Reel:

```text
POST /{ig-user-id}/media
  video_url + media_type=REELS + caption
       |
       v
GET /{container-id}?fields=status_code,status
       |
       +--> IN_PROGRESS -> PROCESSING
       |
       +--> FINISHED -> /media_publish -> PUBLISHED
       |
       `--> ERROR / EXPIRED -> FAILED
```

Instagram pulls media from the supplied URL, so V5 requires HTTPS media that is externally reachable.

### Account binding

The Instagram publishing adapter deliberately refuses to guess which connected account should publish a post.

A publishable Instagram publication must contain:

```text
publication.accountId
```

The adapter resolves that account server-side, verifies it is a connected Instagram account, decrypts its access token only for the provider call, and never returns the token to the frontend.

The existing social composer does not create this binding yet. That is the V6 integration step.

### Current media seam

The development JSON repository now includes:

```text
media: []
```

with repository operations:

```text
createMedia(record)
listMediaForPost(postId)
```

Older `data/srocial.json` files without a `media` collection remain compatible and load with an empty media set.

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

Current rules:

- caption cannot be empty;
- schedule must be in the future;
- supported social destinations are `instagram`, `facebook`, `threads`, and `tiktok`;
- duplicate destinations are deduplicated;
- WhatsApp is rejected by the social-post endpoint;
- request bodies larger than 1 MiB are rejected.

A successful request creates one post plus one publication and one scheduler job per unique platform.

V6 will extend this API/UI with connected-account selection and media creation so Instagram publications carry the account/media information required by the V5 adapter.

### List posts

```http
GET /api/posts
```

### Dashboard

```http
GET /api/dashboard
```

## Scheduler Execution

Scheduler jobs use:

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

Default retry backoff:

```text
attempt 1 -> 1 minute
attempt 2 -> 5 minutes
attempt 3 -> 15 minutes
attempt 4+ -> 60 minutes
```

When a provider returns `PROCESSING`, the original publication job completes and a `STATUS_CHECK` job tracks the asynchronous result without republishing the original content.

## Accounts and OAuth

Public API:

```text
GET  /api/accounts
POST /api/accounts/:id/disconnect
POST /api/oauth/:provider/start
GET  /api/oauth/:provider/callback
```

`GET /api/accounts` returns safe metadata only. Raw and encrypted access/refresh tokens are omitted.

OAuth state defaults to a 10-minute lifetime, is stored only as a SHA-256 hash, and cannot be replayed. Credentials are encrypted at rest with AES-256-GCM.

Account states:

```text
DISCONNECTED
CONNECTING
CONNECTED
EXPIRED
ERROR
```

## Database Migrations

```text
server/db/migrations/001_initial.sql
server/db/migrations/002_scheduler_execution.sql
server/db/migrations/003_accounts_oauth.sql
```

The production schema already contains a separate `media` table, so V5's JSON media seam does not require another SQL migration.

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
Instagram / future provider APIs
```

Never place provider secrets, access tokens, refresh tokens, application secrets, or encryption keys in HTML, CSS, browser JavaScript, localStorage, sessionStorage, public JSON, error messages, or Git history.

## Repository Structure

```text
srocial/
|- README.md
|- updaterules.md
|- client/
|- server/
|  |- auth/
|  |- db/
|  |- routes/
|  |- services/
|  |- scheduler/
|  |- platforms/
|  |  `- instagram/
|  |     |- config.js
|  |     |- client.js
|  |     |- auth.js
|  |     |- validator.js
|  |     |- publish.js
|  |     `- index.js
|  `- messaging/
|- tests/
|- docs/superpowers/
|- .env.example
`- package.json
```

## Development Direction

Next priorities:

1. V6: bind connected accounts and media to scheduled publications in the API/composer;
2. wire the recurring scheduler loop after account-bound real publications are available;
3. add Instagram long-lived-token refresh jobs;
4. add media upload/object storage instead of URL-only entry;
5. implement Threads and Facebook provider adapters;
6. implement TikTok OAuth and Content Posting;
7. process real provider webhooks/status events;
8. build WhatsApp contacts, templates, campaigns, and recipient-level delivery tracking;
9. implement the production PostgreSQL repository with transaction-safe job claims;
10. add analytics and operational hardening.

## Development Rules

All contributors and AI coding agents must read `updaterules.md` before changing the project.

`README.md` defines current capability and architecture. `updaterules.md` defines how Srocial is allowed to evolve.
