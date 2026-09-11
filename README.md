# Srocial

Srocial is a self-hosted social-media publishing, scheduling, monitoring, and business-messaging dashboard.

The project uses one scheduling engine with isolated provider adapters. Instagram, Facebook, Threads, TikTok, and WhatsApp Business therefore do not become five unrelated applications. WhatsApp remains a separate messaging/campaign subsystem rather than a public-post adapter.

## Current Status — V14

The runnable foundation includes:

- vanilla HTML/CSS/JavaScript dashboard, Accounts panel, Media Library, and account-bound composer;
- provider-neutral Accounts/OAuth infrastructure;
- browser Instagram, Facebook Pages, and Threads Connect / Reconnect / Disconnect controls;
- encrypted provider-token persistence with AES-256-GCM;
- one-time hashed OAuth state with expiry/replay protection;
- Instagram professional-account OAuth plus single-image/Reel publishing and status flows;
- Facebook Pages OAuth plus deterministic Page-token resolution, text/image/Reel publishing, and Reel status flows;
- Threads OAuth plus text/image/video container publishing and status flows;
- automatic long-lived Instagram and Threads access-token refresh through account-bound `TOKEN_REFRESH` scheduler jobs;
- refresh retry, expiry/error state handling, deduplication, and reconnect-race protection;
- direct JPEG/PNG/WebP/MP4 uploads with byte-signature validation;
- Media Library preview, reuse, URL copy, reference-protected deletion, usage reporting, and total-storage quota;
- local media storage plus an S3-compatible object-storage driver using AWS Signature Version 4;
- opt-in bounded orphan-media retention cleanup;
- scheduler jobs with stale-lock recovery, retries, status checks, token refresh, and idempotency guards;
- JSON development persistence;
- PostgreSQL production persistence with transaction-safe concurrent scheduler claims;
- explicit checksum-verified PostgreSQL migrations;
- database-aware health reporting and graceful database-pool shutdown;
- **opt-in single-administrator application authentication with signed HttpOnly sessions**;
- **default-deny dashboard/API authorization when application auth is enabled**;
- **same-origin protection for authenticated mutations**;
- **per-client API and login request limiting**;
- GitHub Actions coverage against a real PostgreSQL service.

Safe publishing defaults remain:

```text
ALLOW_REAL_PUBLISH=false
SCHEDULER_ENABLED=false
```

The recurring scheduler, including token-refresh work, starts only when **both** are explicitly `true`.

Application authentication is also opt-in for local-development compatibility:

```text
APP_AUTH_ENABLED=false
```

For any network/public deployment, enable application authentication and use HTTPS.

## Supported Channels

| Channel | Current state |
| --- | --- |
| Instagram | browser account management + OAuth + automatic long-lived token refresh + account identity + image/Reel publish/status adapter |
| Facebook Pages | browser account management + OAuth + Page access-token resolution + text/image/Reel publish/status adapter |
| Threads | browser account management + OAuth + automatic long-lived token refresh + text/image/video publish/status adapter |
| TikTok | scheduling model ready; provider adapter not implemented |
| WhatsApp Business | planned separate messaging/campaign subsystem |

## Architecture

```text
Browser
  |
  +--> Admin login --> signed HttpOnly session
  |
  +--> Accounts UI --> OAuth --> Instagram / Facebook Pages / Threads
  |
  +--> Media Library <--> Media Store (local | S3-compatible)
  |
  `--> Composer
          |
          v
       Post Service
          |
          +--> Post
          +--> Media
          +--> Publication(accountId)
          `--> Scheduler Job
                   |
                   v
             Scheduler Loop
               claim / lock
                   |
               Dispatcher
             /      |       \
        Publish   Status   Token Refresh
           |        |          |
       Platform  Platform   OAuth Adapter
       Adapter   Adapter       |
           \        /      Provider API
            Provider API

Repository interface
  |- JSON repository (default/local development)
  `- PostgreSQL repository (production target)
       `- FOR UPDATE SKIP LOCKED scheduler claims
```

Provider-specific endpoints, validation, scopes, refresh behavior, and response shapes stay inside provider modules. SQL stays inside `server/db/`. Application authentication stays inside focused `server/auth/` and `server/http/` modules rather than provider adapters.

## Technology

- **Frontend:** HTML, CSS, vanilla JavaScript ES modules
- **Backend:** Node.js >= 20, built-in HTTP server
- **Database client:** `pg`
- **Development persistence:** `data/srocial.json`
- **Production persistence:** PostgreSQL
- **Uploaded media:** local filesystem or S3-compatible object storage
- **Application session:** HMAC-SHA-256 signed HttpOnly cookie
- **CI:** GitHub Actions + PostgreSQL 17 service

## Install and Run

Requirements:

```text
Node.js >= 20
```

Install runtime dependencies:

```bash
npm install
```

The default repository is JSON, media storage is local, and application auth is disabled, so local startup requires no database or login:

```bash
npm start
```

Open:

```text
http://127.0.0.1:3000
```

Run tests:

```bash
npm test
```

See `HOW_TO_RUN.md` for the beginner-oriented guide, authentication setup, and PostgreSQL setup steps. See `docs/V12_MEDIA_STORAGE.md` for media-storage configuration, `docs/V13_INSTAGRAM_TOKEN_REFRESH.md` for token-refresh behavior, and `docs/V14_META_PROVIDERS.md` for Facebook Pages and Threads setup/behavior.

## Environment

Important values from `.env.example`:

```text
APP_ENV=development
ALLOW_REAL_PUBLISH=false
SCHEDULER_ENABLED=false
SCHEDULER_INTERVAL_MS=30000
HOST=127.0.0.1
PORT=3000
PUBLIC_BASE_URL=http://127.0.0.1:3000
APP_AUTH_ENABLED=false
ADMIN_USERNAME=admin
ADMIN_PASSWORD=
SESSION_SECRET=<at-least-32-random-characters>
SESSION_TTL_SECONDS=28800
API_RATE_LIMIT_WINDOW_MS=60000
API_RATE_LIMIT_MAX=120
LOGIN_RATE_LIMIT_WINDOW_MS=900000
LOGIN_RATE_LIMIT_MAX=10
DATA_FILE=./data/srocial.json
MEDIA_STORAGE_DRIVER=local
MEDIA_UPLOAD_DIR=./data/uploads
MEDIA_UPLOAD_MAX_BYTES=52428800
MEDIA_UPLOAD_TOTAL_MAX_BYTES=5368709120
MEDIA_S3_ENDPOINT=
MEDIA_S3_REGION=auto
MEDIA_S3_BUCKET=
MEDIA_S3_ACCESS_KEY_ID=
MEDIA_S3_SECRET_ACCESS_KEY=
MEDIA_S3_PREFIX=media/
MEDIA_PUBLIC_BASE_URL=
MEDIA_ORPHAN_CLEANUP_ENABLED=false
MEDIA_ORPHAN_RETENTION_MS=2592000000
MEDIA_ORPHAN_CLEANUP_INTERVAL_MS=21600000
MEDIA_ORPHAN_CLEANUP_MAX_DELETES=100
DATABASE_DRIVER=json
DATABASE_URL=postgres://...
TOKEN_ENCRYPTION_KEY=<long-random-secret>
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
INSTAGRAM_API_VERSION=v26.0
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
FACEBOOK_API_VERSION=v26.0
FACEBOOK_PAGE_ID=
THREADS_APP_ID=
THREADS_APP_SECRET=
THREADS_API_VERSION=v1.0
```

Srocial does not automatically load `.env` files. Supply environment values through the shell, process manager, container, or deployment environment.

Provider credentials, administrator passwords, session secrets, object-storage credentials, database credentials, and encryption keys are server-only. Never expose them in frontend JavaScript, browser storage, API responses, logs, or Git history.

## Application Authentication — V11+

V11 introduced a small application security boundary for self-hosted deployments. It is intentionally a **single-administrator** model; database-backed users, RBAC, invitations, password reset, and external identity providers are not part of the current implementation.

Enable it explicitly:

```text
APP_AUTH_ENABLED=true
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<at-least-12-characters>
SESSION_SECRET=<at-least-32-random-characters>
```

When `APP_AUTH_ENABLED=true`, startup fails closed if the password is shorter than 12 characters or the session secret is shorter than 32 characters. Invalid `PUBLIC_BASE_URL` or invalid positive rate-limit values also prevent startup.

### Session security

Successful login issues the `srocial_session` cookie. It is:

- HMAC-SHA-256 signed;
- expiring (`SESSION_TTL_SECONDS`, default 8 hours);
- `HttpOnly`;
- `SameSite=Strict`;
- `Path=/`;
- `Secure` when `PUBLIC_BASE_URL` uses HTTPS.

Administrator credentials and the session secret are never placed in browser storage or returned by the API.

Outside loopback-only local development, use an HTTPS `PUBLIC_BASE_URL`. HTTPS protects the credential submission and session cookie in transit.

### Public exceptions

When application auth is enabled, the application is default-deny. Only the following remain public by design:

```text
GET       /api/health
POST      /api/auth/login
GET/HEAD  /login.html and its dedicated login assets
GET       /api/oauth/:provider/callback
GET/HEAD  /media/:key
```

The OAuth callback must remain reachable for provider redirects. Provider media retrieval must remain public because social providers fetch scheduled media by URL. The rest of the dashboard/static application and management API requires a valid Srocial application session.

Unauthenticated protected API requests receive HTTP `401 { "error": "unauthorized" }`. Unauthenticated browser/static navigation is redirected to `/login.html`.

### Same-origin mutation protection

Authenticated `POST`, `PUT`, `PATCH`, and `DELETE` requests are checked before request bodies or business mutations are processed. Explicit foreign `Origin` requests and browser `Sec-Fetch-Site: cross-site` requests are rejected with:

```text
HTTP 403
{ "error": "cross_site_request" }
```

### Request limiting

Defaults:

```text
API_RATE_LIMIT_WINDOW_MS=60000
API_RATE_LIMIT_MAX=120
LOGIN_RATE_LIMIT_WINDOW_MS=900000
LOGIN_RATE_LIMIT_MAX=10
```

The login limiter and protected-API limiter use independent in-memory fixed windows keyed by `request.socket.remoteAddress`. Srocial deliberately does **not** trust `X-Forwarded-For`; reverse-proxy trust configuration is a separate concern. Exceeded limits return HTTP 429 with a `Retry-After` header.

Because limits are process-local, they are appropriate for the current single-process application boundary, not a distributed abuse-prevention system.

## Database Backends — V10+

### JSON — default

If `DATABASE_DRIVER` is absent or set to `json`, Srocial uses:

```text
DATA_FILE=./data/srocial.json
```

This remains the simplest local-development mode.

### PostgreSQL — production target

Select PostgreSQL explicitly:

```text
DATABASE_DRIVER=postgres
DATABASE_URL=postgres://user:password@host:5432/database
```

Before the first PostgreSQL startup, run migrations explicitly:

```bash
npm run db:migrate
```

Normal `npm start` **never applies migrations automatically**. PostgreSQL repository initialization only verifies required runtime tables. If the schema is missing, startup fails with `DATABASE_MIGRATIONS_REQUIRED`.

### Migration safety

The migration runner:

- applies `server/db/migrations/*.sql` in filename order;
- records applied migrations in `srocial_migrations`;
- stores SHA-256 checksums;
- rejects modified historical migrations;
- wraps each migration and ledger insert in one transaction;
- uses a PostgreSQL advisory lock;
- logs migration names/status only, never database credentials.

Historical migrations should remain immutable. Add a new migration for future schema changes.

### Transaction-safe scheduler claims

The PostgreSQL repository claims due work atomically with `FOR UPDATE SKIP LOCKED`. Multiple workers can compete for due jobs without receiving the same job ownership. Existing due-time, stale-lock, attempt-count, and scheduler idempotency rules remain in place.

## Health Endpoint

```text
GET /api/health
```

Health remains public so infrastructure can determine whether Srocial is alive. Repository failures return HTTP `503` and sanitized metadata only. Connection strings, database hosts, usernames, passwords, and raw driver errors are not returned.

During process shutdown, Srocial stops the scheduler and media-retention loop, closes the HTTP server, and closes the selected repository.

## Accounts and OAuth

The dashboard currently supports browser account management for:

```text
Connect Instagram
Connect Facebook
Connect Threads
Reconnect
Disconnect
```

Connect/Reconnect starts the provider-neutral route:

```text
POST /api/oauth/:provider/start
```

When application auth is enabled, OAuth **start** requires the Srocial administrator session. The provider callback remains public:

```text
GET /api/oauth/:provider/callback
```

Browser callbacks redirect back toward the Accounts section using only sanitized Srocial result codes. If the browser no longer has a valid Srocial application session, the redirected dashboard request goes to the login page.

Instagram and Threads connections that return token expiry metadata schedule account-bound long-lived token refresh work through the existing scheduler. Scheduled/retrying refresh jobs are reused on reconnect; running refresh jobs are protected against stale-result overwrite.

For Facebook Pages, `FACEBOOK_PAGE_ID` makes Page selection deterministic. Without it, Srocial auto-selects only if the authenticating Meta user returns exactly one eligible managed Page; multiple Pages fail closed with `PAGE_SELECTION_REQUIRED`.

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
  "scheduledAt": "2026-09-11T10:00:00.000Z"
}
```

With application auth enabled this endpoint requires a valid application session and same-origin mutation validation.

Srocial validates that every explicit account exists, is `CONNECTED`, and matches the selected platform. Destinations are deduplicated by `(platform, accountId)`.

Generic media rules:

- type is `image` or `video`;
- URLs must be HTTPS for scheduling;
- at most 10 media records per post at the generic layer;
- provider adapters may impose stricter rules.

V14 Facebook Pages and Threads adapters accept at most one media item per publication. See `docs/V14_META_PROVIDERS.md` for provider-specific behavior.

## HTTP Surface

### Public when application auth is enabled

```text
GET    /api/health
POST   /api/auth/login
GET    /api/oauth/:provider/callback
GET    /media/:key
HEAD   /media/:key
```

The dedicated login document/assets are also public.

### Protected management surface

```text
GET    /api/auth/session
POST   /api/auth/logout
GET    /api/posts
POST   /api/posts
GET    /api/dashboard
GET    /api/accounts
POST   /api/accounts/:id/disconnect
POST   /api/oauth/:provider/start
GET    /api/media
POST   /api/media/uploads
DELETE /api/media/:key
```

Future management APIs are protected by default unless deliberately added to the narrow public allowlist.

## Media Uploads and Library — V12+

`POST /api/media/uploads` accepts raw `image/jpeg`, `image/png`, `image/webp`, or `video/mp4` bodies. SVG/HTML types are rejected. Supported uploads are inspected for matching JPEG, PNG, WebP, or MP4 byte signatures rather than trusting the declared MIME type alone. Signature mismatch or malformed supported media returns a sanitized HTTP 415 response.

Defaults:

```text
MEDIA_STORAGE_DRIVER=local
MEDIA_UPLOAD_DIR=./data/uploads
MEDIA_UPLOAD_MAX_BYTES=52428800
MEDIA_UPLOAD_TOTAL_MAX_BYTES=5368709120
```

Set `MEDIA_STORAGE_DRIVER=s3` to use the S3-compatible storage adapter. Production S3 endpoints require HTTPS; loopback HTTP remains available for local object-store development. Signed S3 requests do not automatically follow redirects.

Uploaded assets remain public to anyone with their URL because provider APIs need to retrieve them. Upload, library listing, composer reuse, and deletion are protected by the application session when auth is enabled. Media Library deletion refuses assets referenced by persisted post media and returns `409 { "error": "media_in_use" }`.

Automatic orphan cleanup is opt-in and deletes only old unreferenced assets, oldest-first, within the configured batch limit. See `docs/V12_MEDIA_STORAGE.md`.

## Scheduler Runtime

The recurring scheduler starts only when both flags are true:

```text
ALLOW_REAL_PUBLISH=true
SCHEDULER_ENABLED=true
```

Default interval:

```text
SCHEDULER_INTERVAL_MS=30000
```

Job types include publication work, provider status checks, and account-bound token refresh. Job states are:

```text
SCHEDULED
RUNNING
RETRYING
COMPLETED
FAILED
CANCELLED
```

Default retry delays are 1 minute, 5 minutes, 15 minutes, then 60 minutes thereafter. Provider `PROCESSING` results use status-check jobs rather than republishing original content. Instagram and Threads token refresh use the same scheduler and retry policy rather than introducing provider-specific timer subsystems.

## Data Model

Core runtime records:

```text
accounts
posts
media
publications
scheduler_jobs
oauth_states
webhook_events
```

Application sessions are stateless signed cookies; the current implementation does not add user/session database tables for dashboard authentication.

## Verification

CI is defined in `.github/workflows/test.yml`. Build branches, pull requests, and `main` run against PostgreSQL 17 and execute:

```bash
npm install --ignore-scripts
npm run db:migrate
npm test
find server client tests -name '*.js' -print0 | xargs -0 -n1 node --check
```

Coverage includes PostgreSQL migrations/persistence/concurrency; application authentication and same-origin controls; V12 local/S3 media storage, signature validation, quotas, deletion/reference protection, and retention cleanup; V13 Instagram refresh HTTP normalization, refresh scheduling/deduplication, encrypted worker execution, retry/expiry handling, reconnect-race protection, and scheduler dispatch; and V14 Facebook/Threads config, OAuth/token flows, provider HTTP normalization, publishing/status transitions, credential isolation, account registration, and Accounts UI behavior.

## Repository Structure

```text
srocial/
|- .github/workflows/test.yml
|- README.md
|- HOW_TO_RUN.md
|- updaterules.md
|- client/
|  |- login.html
|  `- js/api/auth-api.js
|- server/
|  |- auth/
|  |- http/
|  |- db/
|  |- media/
|  |- routes/
|  |- services/
|  |- scheduler/
|  `- platforms/
|     |- instagram/
|     |- facebook/
|     `- threads/
|- tests/
|- docs/superpowers/
|- .env.example
`- package.json
```

## Development Direction

Next priorities:

1. implement TikTok OAuth and Content Posting;
2. add real provider webhook processing and provider-health/rate-limit visibility;
3. implement WhatsApp contacts, templates, campaigns, and recipient-level delivery tracking;
4. add calendar/queue operational controls, drafts, edit/cancel/retry controls, and analytics;
5. if multi-user access becomes necessary, design database-backed identities, roles, session revocation, and proxy-aware distributed rate limiting as a separate security project.

## Development Rules

All contributors and AI coding agents must read `updaterules.md` before changing the project.

`README.md` defines current capability and architecture. `updaterules.md` defines how Srocial is allowed to evolve.
