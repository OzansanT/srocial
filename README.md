# Srocial

Srocial is a self-hosted social-media publishing, scheduling, monitoring, and business-messaging dashboard.

The project uses one scheduling engine with isolated provider adapters. Instagram, Facebook, Threads, TikTok, and WhatsApp Business therefore do not become five unrelated applications. WhatsApp remains a separate messaging/campaign subsystem rather than a public-post adapter.

## Current Status — V10

The runnable foundation includes:

- vanilla HTML/CSS/JavaScript dashboard, Accounts panel, Media Library, and account-bound composer;
- provider-neutral Accounts/OAuth infrastructure;
- browser Instagram Connect, Reconnect, and Disconnect controls;
- encrypted provider-token persistence with AES-256-GCM;
- one-time hashed OAuth state with expiry/replay protection;
- Instagram professional-account OAuth plus single-image/Reel publishing and status flows;
- direct JPEG/PNG/WebP/MP4 uploads with streamed local storage;
- Media Library preview, reuse, URL copy, reference-protected deletion, usage reporting, and total-storage quota;
- scheduler jobs with stale-lock recovery, retries, status checks, and idempotency guards;
- JSON development persistence;
- **PostgreSQL production persistence with transaction-safe concurrent scheduler claims**;
- **explicit checksum-verified PostgreSQL migrations**;
- **database-aware health reporting and graceful database-pool shutdown**;
- GitHub Actions coverage against a real PostgreSQL service.

Safe publishing defaults remain:

```text
ALLOW_REAL_PUBLISH=false
SCHEDULER_ENABLED=false
```

Real scheduled publishing starts only when **both** are explicitly `true`.

## Supported Channels

| Channel | Current state |
| --- | --- |
| Instagram | browser account management + OAuth + account identity + image/Reel publish/status adapter |
| Facebook Pages | scheduling model ready; provider adapter not implemented |
| Threads | scheduling model ready; provider adapter not implemented |
| TikTok | scheduling model ready; provider adapter not implemented |
| WhatsApp Business | planned separate messaging/campaign subsystem |

## Architecture

```text
Browser
  |
  +--> Accounts UI --> OAuth --> Instagram
  |
  +--> Media Library <--> Local media store --> /media/:key
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
                /      \
           Publish    Status
                \      /
              Platform Adapter
                   |
              Provider API

Repository interface
  |- JSON repository (default/local development)
  `- PostgreSQL repository (production target)
       `- FOR UPDATE SKIP LOCKED scheduler claims
```

Provider-specific endpoints, validation, scopes, and response shapes stay inside provider modules. SQL stays inside `server/db/`.

## Technology

- **Frontend:** HTML, CSS, vanilla JavaScript ES modules
- **Backend:** Node.js >= 20, built-in HTTP server
- **Database client:** `pg`
- **Development persistence:** `data/srocial.json`
- **Production persistence:** PostgreSQL
- **Local uploaded media:** `data/uploads/`
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

The default repository is JSON, so local startup requires no database:

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

See `HOW_TO_RUN.md` for the beginner-oriented guide and PostgreSQL setup steps.

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
DATA_FILE=./data/srocial.json
MEDIA_UPLOAD_DIR=./data/uploads
MEDIA_UPLOAD_MAX_BYTES=52428800
MEDIA_UPLOAD_TOTAL_MAX_BYTES=5368709120
DATABASE_DRIVER=json
DATABASE_URL=postgres://...
TOKEN_ENCRYPTION_KEY=<long-random-secret>
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
INSTAGRAM_API_VERSION=v26.0
```

Srocial does not automatically load `.env` files. Supply environment values through the shell, process manager, container, or deployment environment.

Provider credentials, database credentials, and encryption keys are server-only. Never expose them in frontend JavaScript, browser storage, API responses, logs, or Git history.

## Database Backends — V10

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

`DATABASE_URL` is ignored by repository selection unless `DATABASE_DRIVER=postgres`.

Before the first PostgreSQL startup, run migrations explicitly:

```bash
npm run db:migrate
```

Normal `npm start` **never applies migrations automatically**. PostgreSQL repository initialization only verifies that required runtime tables exist. If the schema is missing, startup fails with `DATABASE_MIGRATIONS_REQUIRED` rather than silently mutating production data.

### Migration safety

The migration runner:

- applies `server/db/migrations/*.sql` in filename order;
- records applied migrations in `srocial_migrations`;
- stores a SHA-256 checksum for every applied migration;
- rejects a historical migration whose contents changed;
- wraps each migration and ledger insert in one transaction;
- uses a PostgreSQL advisory lock to prevent concurrent migration runners;
- logs migration names/status only, never database credentials.

Historical migrations should remain immutable. Add a new migration for future schema changes.

### Transaction-safe scheduler claims

The PostgreSQL repository claims due work atomically with `FOR UPDATE SKIP LOCKED`. Multiple workers can therefore compete for due jobs without receiving the same job ownership. The claim path retains the existing Srocial rules for due time, `SCHEDULED`/`RETRYING` jobs, stale `RUNNING` locks, attempt counting, and worker IDs.

Scheduler-level idempotency checks remain in place above the database-lock layer.

## Health Endpoint — V10

```text
GET /api/health
```

A healthy JSON installation returns database metadata similar to:

```json
{
  "ok": true,
  "service": "srocial",
  "version": "0.1.0",
  "database": {
    "ok": true,
    "backend": "json"
  }
}
```

PostgreSQL health executes a live `SELECT 1`. If repository health fails, the endpoint returns HTTP `503` and only sanitized metadata:

```json
{
  "ok": false,
  "service": "srocial",
  "version": "0.1.0",
  "database": {
    "ok": false,
    "backend": "unavailable"
  }
}
```

Connection strings, database hosts, usernames, passwords, and raw driver errors are not returned.

During process shutdown, Srocial stops the scheduler, closes the HTTP server, and closes the repository. PostgreSQL closes its owned connection pool; JSON has a no-op close implementation.

## Accounts and OAuth

The dashboard supports Instagram:

```text
Connect Instagram
Reconnect
Disconnect
```

Connect/Reconnect starts:

```text
POST /api/oauth/instagram/start
```

The callback remains:

```text
GET /api/oauth/:provider/callback
```

Browser callbacks redirect back to the Accounts section using only sanitized Srocial result codes. Provider authorization codes, OAuth state values, access tokens, refresh tokens, raw provider errors, and stack traces are not copied into dashboard URLs.

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

Srocial validates that every explicit account exists, is `CONNECTED`, and matches the selected platform. Destinations are deduplicated by `(platform, accountId)`.

Generic media rules:

- type is `image` or `video`;
- URLs must be HTTPS for scheduling;
- at most 10 media records per post at the generic layer;
- provider adapters may impose stricter rules.

Legacy `platforms: [...]` requests remain available for internal development and create unbound publications. Do not use unbound publications for real provider publishing.

## Public API Surface

```text
GET    /api/health
GET    /api/posts
POST   /api/posts
GET    /api/dashboard
GET    /api/accounts
POST   /api/accounts/:id/disconnect
POST   /api/oauth/:provider/start
GET    /api/oauth/:provider/callback
GET    /api/media
POST   /api/media/uploads
DELETE /api/media/:key
GET    /media/:key
HEAD   /media/:key
```

## Media Uploads and Library

`POST /api/media/uploads` accepts raw `image/jpeg`, `image/png`, `image/webp`, or `video/mp4` bodies. SVG/HTML types are rejected. The current check is a declared-MIME allowlist, not content-signature inspection or malware scanning.

Defaults:

```text
MEDIA_UPLOAD_DIR=./data/uploads
MEDIA_UPLOAD_MAX_BYTES=52428800
MEDIA_UPLOAD_TOTAL_MAX_BYTES=5368709120
```

Uploaded assets are public to anyone with their URL. Media Library deletion refuses assets referenced by persisted post media and returns `409 { "error": "media_in_use" }` when protection applies.

The current development app still has no application login or upload authorization. Do not expose `/api/` publicly without an authentication/request-limiting layer. Provider retrieval of `/media/` must remain possible for publishing.

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

Job states:

```text
SCHEDULED
RUNNING
RETRYING
COMPLETED
FAILED
CANCELLED
```

Default retry delays are 1 minute, 5 minutes, 15 minutes, then 60 minutes thereafter. Provider `PROCESSING` results use status-check jobs rather than republishing the original content.

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

Relationship:

```text
Account
   |
Publication ---- Post ---- Media
   |
Scheduler Job
```

## Verification

CI is defined in `.github/workflows/test.yml`. Build branches, pull requests, and `main` run against PostgreSQL 17 and execute:

```bash
npm install --ignore-scripts
npm run db:migrate
npm test
find server client tests -name '*.js' -print0 | xargs -0 -n1 node --check
```

PostgreSQL integration tests cover migrations, repository persistence, schema verification, health, stale-lock recovery, and concurrent `SKIP LOCKED` claims.

## Repository Structure

```text
srocial/
|- .github/workflows/test.yml
|- README.md
|- HOW_TO_RUN.md
|- updaterules.md
|- client/
|- server/
|  |- auth/
|  |- db/
|  |  |- create-repository.js
|  |  |- json-repository.js
|  |  |- postgres-repository.js
|  |  |- migrate.js
|  |  |- migration-runner.js
|  |  `- migrations/
|  |- media/
|  |- routes/
|  |- services/
|  |- scheduler/
|  `- platforms/instagram/
|- tests/
|- docs/superpowers/
|- .env.example
`- package.json
```

## Development Direction

Next priorities:

1. add application authentication, API authorization, and request limiting before public deployment;
2. add object-storage adapters, file-signature inspection, and automatic orphan-retention cleanup;
3. add long-lived Instagram token refresh jobs;
4. implement Threads and Facebook provider adapters;
5. implement TikTok OAuth and Content Posting;
6. add real provider webhook processing;
7. implement WhatsApp contacts, templates, campaigns, and recipient-level delivery tracking;
8. add calendar/queue operational controls and analytics.

## Development Rules

All contributors and AI coding agents must read `updaterules.md` before changing the project.

`README.md` defines current capability and architecture. `updaterules.md` defines how Srocial is allowed to evolve.
