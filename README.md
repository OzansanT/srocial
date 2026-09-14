# Srocial

Srocial is a self-hosted social-media publishing, scheduling, monitoring, and business-messaging dashboard.

The project uses one scheduler with isolated provider adapters. Instagram, Facebook Pages, Threads, and TikTok share the publishing runtime; WhatsApp Business remains a separate messaging/campaign subsystem.

## Current Status — V16

The runnable foundation includes:

- vanilla HTML/CSS/JavaScript dashboard, Accounts, Media Library, composer, queue, and Operations Center;
- provider-neutral OAuth/account infrastructure with encrypted credentials;
- Instagram professional-account OAuth plus image/Reel publishing and status flows;
- Facebook Pages OAuth plus deterministic Page selection and text/image/Reel publishing;
- Threads OAuth plus text/image/video publishing and status flows;
- TikTok Login Kit OAuth, Creator Info, privacy/interaction-aware Direct Post for one photo/video, rotating refresh tokens, and async status polling;
- direct JPEG/PNG/WebP/MP4 upload, local or S3-compatible storage, Media Library reuse/deletion/quota, and optional orphan cleanup;
- one persistent scheduler with stale-lock recovery, retry/backoff, status checks, token refresh, and idempotency guards;
- JSON development persistence and PostgreSQL production persistence with transaction-safe job claims and checksum-verified migrations;
- opt-in single-administrator application authentication, signed HttpOnly sessions, same-origin mutation protection, and process-local rate limiting;
- **publication-attempt history for external publishing calls**;
- **verified Meta and TikTok webhook ingestion with duplicate-delivery protection**;
- **TikTok Content Posting webhook synchronization and authorization-removal handling**;
- **provider health and active rate-limit visibility**;
- **protected Operations API plus Operations Center dashboard UI**;
- GitHub Actions coverage against PostgreSQL 17.

Safe publishing defaults remain:

```text
ALLOW_REAL_PUBLISH=false
SCHEDULER_ENABLED=false
```

The recurring scheduler starts only when both values are explicitly `true`.

## Supported Channels

| Channel | Current state |
| --- | --- |
| Instagram | account management + OAuth + long-lived token refresh + image/Reel publish/status adapter |
| Facebook Pages | account management + OAuth + Page-token resolution + text/image/Reel publish/status adapter |
| Threads | account management + OAuth + long-lived token refresh + text/image/video publish/status adapter |
| TikTok | account management + OAuth + rotating token refresh + Creator Info + privacy-aware photo/video Direct Post + status adapter |
| WhatsApp Business | planned separate messaging/campaign subsystem |

## Architecture

```text
Browser
  |
  +--> Admin session
  +--> Accounts / OAuth
  +--> Media Library
  +--> Composer
  +--> Operations Center
  |
  v
Node HTTP application
  |
  +--> Post Service
  +--> Operations API
  +--> Verified Webhook Routes
  |
  v
Repository (JSON | PostgreSQL)
  |
  +--> posts / media / publications
  +--> scheduler_jobs
  +--> publication_attempts
  +--> webhook_events
  `--> provider_status
          |
          v
      Scheduler Loop
    claim / lock / retry
       /      |       \
  Publish   Status   Token Refresh
       \      |      /
        Provider adapters
              |
     Instagram / Facebook / Threads / TikTok
```

Provider-specific API behavior remains inside provider modules. SQL stays under `server/db/`. Operations telemetry observes the existing scheduler rather than creating a second execution system.

## Technology

- **Frontend:** HTML, CSS, vanilla JavaScript ES modules
- **Backend:** Node.js >= 20, built-in HTTP server
- **Database client:** `pg`
- **Development persistence:** JSON file
- **Production persistence:** PostgreSQL
- **Media:** local filesystem or S3-compatible object storage
- **Sessions:** HMAC-SHA-256 signed HttpOnly cookie
- **CI:** GitHub Actions + PostgreSQL 17

## Install and Run

Requirements:

```text
Node.js >= 20
```

```bash
npm install
npm start
```

Default local URL:

```text
http://127.0.0.1:3000
```

Run tests:

```bash
npm test
```

For PostgreSQL, run migrations before startup:

```bash
npm run db:migrate
```

Normal `npm start` never applies migrations automatically.

See `HOW_TO_RUN.md` for the beginner-oriented setup guide.

## Environment

Important settings are documented in `.env.example`. Key groups are:

```text
ALLOW_REAL_PUBLISH=false
SCHEDULER_ENABLED=false
PUBLIC_BASE_URL=http://127.0.0.1:3000

APP_AUTH_ENABLED=false
ADMIN_USERNAME=admin
ADMIN_PASSWORD=
SESSION_SECRET=<at-least-32-random-characters>

DATABASE_DRIVER=json
DATABASE_URL=postgres://...
TOKEN_ENCRYPTION_KEY=<long-random-secret>

MEDIA_STORAGE_DRIVER=local
MEDIA_UPLOAD_DIR=./data/uploads
MEDIA_PUBLIC_BASE_URL=

INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
THREADS_APP_ID=
THREADS_APP_SECRET=
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
TIKTOK_SCOPES=user.info.basic,video.publish

META_WEBHOOK_VERIFY_TOKEN=
META_WEBHOOK_APP_SECRET=
```

Srocial does not automatically load `.env` files. Supply values through the shell, process manager, container, or deployment environment.

Provider credentials, administrator credentials, encryption keys, app secrets, session secrets, database credentials, and object-storage credentials are server-only.

## Application Authentication

Application authentication is opt-in for local-development compatibility:

```text
APP_AUTH_ENABLED=false
```

For network/public deployments, enable it and use HTTPS. The current security model is deliberately single-administrator; multi-user identities/RBAC are a later project.

When authentication is enabled, management APIs and dashboard assets are default-deny. Public exceptions exist only where infrastructure/providers require reachability.

### Public surface

```text
GET       /api/health
POST      /api/auth/login
GET       /api/oauth/:provider/callback
GET/HEAD  /media/:key
GET       /api/webhooks/meta
POST      /api/webhooks/meta
POST      /api/webhooks/tiktok
GET/HEAD  login document/assets
```

Webhook POST routes are public at the application-session layer but accept state-changing payloads only after provider signature verification.

### Protected management surface

```text
GET    /api/auth/session
POST   /api/auth/logout
GET    /api/dashboard
GET    /api/operations
GET    /api/posts
POST   /api/posts
GET    /api/accounts
GET    /api/accounts/:id/tiktok/creator-info
POST   /api/accounts/:id/disconnect
POST   /api/oauth/:provider/start
GET    /api/media
POST   /api/media/uploads
DELETE /api/media/:key
```

Authenticated mutations are same-origin checked. Login/API rate limits are process-local and intentionally do not trust forwarded IP headers.

## Accounts and OAuth

The dashboard supports:

```text
Connect Instagram
Connect Facebook
Connect Threads
Connect TikTok
Reconnect
Disconnect
```

OAuth starts at:

```text
POST /api/oauth/:provider/start
```

Provider callback:

```text
GET /api/oauth/:provider/callback
```

Instagram, Threads, and TikTok token refresh uses account-bound `TOKEN_REFRESH` jobs through the same scheduler. TikTok additionally supports refresh-token rotation.

For Facebook Pages, `FACEBOOK_PAGE_ID` can make Page selection deterministic. Without it, Srocial auto-selects only when exactly one eligible Page is returned.

For TikTok, current Creator Info is loaded before scheduling and rechecked before publishing. Production `PULL_FROM_URL` media must come from a domain/prefix accepted by the TikTok developer application. See `docs/V15_TIKTOK_PROVIDER.md`.

## Scheduling API

Preferred request:

```http
POST /api/posts
Content-Type: application/json
```

```json
{
  "caption": "Scheduled content",
  "destinations": [
    {
      "platform": "instagram",
      "accountId": "connected-account-id"
    }
  ],
  "media": [
    {
      "type": "image",
      "url": "https://cdn.example.com/post.jpg"
    }
  ],
  "scheduledAt": "2026-09-14T15:00:00.000Z"
}
```

Every explicit account must exist, be `CONNECTED`, and match the selected platform. Provider-specific user choices are stored on the publication rather than the generic post record.

## Operations Center — V16

V16 adds the operational layer requested by the roadmap.

### Publication attempts

Before an external publish call, Srocial creates a `publication_attempts` record. Completion/retry/failure updates the same attempt without persisting raw provider exception text or credentials.

### Provider health

Provider status values are:

```text
UNKNOWN
HEALTHY
DEGRADED
ERROR
```

Successful publish/status/token-refresh work marks the provider healthy. Transient network/provider/rate-limit failures mark it degraded. Authentication/permission failures mark it error. Rate-limit failures record `limitedUntil` from the scheduler retry time.

### Meta webhooks

```text
GET  /api/webhooks/meta
POST /api/webhooks/meta
```

The GET route performs the Meta subscription challenge with `META_WEBHOOK_VERIFY_TOKEN`.

POST verifies `X-Hub-Signature-256` against the exact raw body using HMAC-SHA256 with `META_WEBHOOK_APP_SECRET`. Only verified bodies are parsed/persisted.

### TikTok webhooks

```text
POST /api/webhooks/tiktok
```

The `TikTok-Signature` is verified over:

```text
<timestamp>.<raw request body>
```

using `TIKTOK_CLIENT_SECRET`. Deliveries outside the five-minute freshness window are rejected.

Verified Content Posting events can synchronize `PUBLISHED` / `FAILED` state using TikTok `publish_id`. `authorization.removed` disconnects the matching TikTok account and clears encrypted credentials.

### Duplicate delivery protection

Verified raw request bytes are SHA-256 fingerprinted into a provider-scoped external event ID. A duplicate delivery is acknowledged without repeating side effects.

### Operations API

```text
GET /api/operations
```

Returns sanitized:

```text
providers
failedJobs
attempts
webhooks
```

Raw webhook payloads and provider credentials are not returned to the browser.

See `docs/V16_OPERATIONS_CENTER.md` for the complete operational runbook.

## Media Uploads and Library

`POST /api/media/uploads` supports JPEG, PNG, WebP, and MP4. Supported types are byte-signature checked rather than trusting MIME declaration alone.

Uploaded media must be reachable by provider APIs when used for publishing. Media Library deletion refuses assets referenced by persisted post media. Storage can be local or S3-compatible.

See `docs/V12_MEDIA_STORAGE.md`.

## Database Backends

### JSON

Default local-development mode:

```text
DATABASE_DRIVER=json
DATA_FILE=./data/srocial.json
```

### PostgreSQL

Production target:

```text
DATABASE_DRIVER=postgres
DATABASE_URL=postgres://user:password@host:5432/database
```

Migrations are ordered, checksum-recorded, transaction-protected, and guarded by a PostgreSQL advisory lock. Historical migrations are immutable.

Scheduler claims use `FOR UPDATE SKIP LOCKED` so multiple workers cannot claim the same due job.

V16 migration `005_operations_center.sql` extends webhook metadata and creates `provider_status`.

## Data Model

Core runtime records now include:

```text
accounts
posts
media
publications
scheduler_jobs
publication_attempts
oauth_states
webhook_events
provider_status
```

## Verification

CI runs against PostgreSQL 17 and executes:

```bash
npm install --ignore-scripts
npm run db:migrate
npm test
find server client tests -name '*.js' -print0 | xargs -0 -n1 node --check
```

Coverage includes application authentication; PostgreSQL persistence/concurrency/migrations; media storage/lifecycle; Instagram token refresh; Facebook/Threads provider adapters; TikTok OAuth/refresh/Creator Info/Direct Post/status behavior; and V16 operations repository parity, Meta/TikTok signature verification, TikTok replay-age rejection, webhook deduplication, provider state synchronization, publication attempts, provider health/rate-limit telemetry, Operations API sanitization, and Operations UI wiring.

Real provider verification gaps remain in `PROBLEMS.md`. Automated CI cannot substitute for approved provider applications and public HTTPS callbacks.

## Repository Structure

```text
srocial/
|- .github/workflows/test.yml
|- README.md
|- HOW_TO_RUN.md
|- PROBLEMS.md
|- updaterules.md
|- client/
|- server/
|  |- auth/
|  |- db/
|  |- http/
|  |- media/
|  |- operations/
|  |- platforms/
|  |- routes/
|  |- scheduler/
|  |- services/
|  `- webhooks/
|- tests/
|- docs/
|  |- V12_MEDIA_STORAGE.md
|  |- V13_INSTAGRAM_TOKEN_REFRESH.md
|  |- V14_META_PROVIDERS.md
|  |- V15_TIKTOK_PROVIDER.md
|  `- V16_OPERATIONS_CENTER.md
|- .env.example
`- package.json
```

## Development Direction

With V16 implemented, the source roadmap advances to:

1. **WhatsApp Business subsystem** — contacts, consent/eligibility, approved templates, campaigns, recipient-level message state, delivery/read/failure webhooks, and retries;
2. **Calendar + queue lifecycle controls** — drafts, edit, cancel, retry, duplicate, bulk queue operations, and operational calendar views;
3. **Analytics/reporting** — publishing/channel/post metrics after lifecycle controls produce stable operator workflows;
4. **Browser end-to-end coverage** for critical operator flows, including Operations Center;
5. if multi-user access becomes necessary, database-backed identities, roles, session revocation, and proxy-aware distributed rate limiting as a separate security project.

## Development Rules

All contributors and AI coding agents must read `updaterules.md` and `PROBLEMS.md` before changing the project.

`README.md` defines current capability and architecture. `updaterules.md` defines how Srocial may evolve. `PROBLEMS.md` is the persistent tracker for unresolved implementation or verification gaps.
