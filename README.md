# Srocial

Srocial is a self-hosted social-media publishing, scheduling, monitoring, and business-messaging dashboard.

The project uses one scheduling engine with isolated provider adapters. Instagram, Facebook, Threads, TikTok, and WhatsApp Business therefore do not become five unrelated applications. WhatsApp remains a separate messaging/campaign subsystem rather than a public-post adapter.

## Current Status — V6

The runnable foundation now includes:

- vanilla HTML/CSS/JavaScript dashboard and composer;
- provider-neutral Accounts/OAuth infrastructure;
- encrypted provider-token persistence with AES-256-GCM;
- one-time hashed OAuth state with expiry/replay protection;
- a real Instagram professional-account provider using Instagram Login;
- Instagram single-image and Reel publishing/status flows;
- explicit account-bound social destinations;
- post media persistence using externally reachable HTTPS URLs;
- account/platform compatibility validation before a post is scheduled;
- one publication and scheduler job per selected destination;
- atomic job claiming, worker locks, stale-lock recovery, retries, status checks, and idempotency guards;
- a recurring scheduler runtime with overlap protection;
- double-gated real publishing;
- JSON development persistence and PostgreSQL production-target migrations;
- GitHub Actions plus built-in Node.js tests.

The safe defaults are deliberately off:

```text
ALLOW_REAL_PUBLISH=false
SCHEDULER_ENABLED=false
```

**Real scheduled publishing starts only when both values are explicitly set to `true`.**

## Supported Channels

| Channel | Current state |
| --- | --- |
| Instagram | OAuth + account identity + image/Reel publish/status adapter |
| Facebook Pages | scheduling model ready; provider adapter not implemented |
| Threads | scheduling model ready; provider adapter not implemented |
| TikTok | scheduling model ready; provider adapter not implemented |
| WhatsApp Business | planned separate messaging/campaign subsystem |

## Architecture

```text
Browser
  |
  | safe account metadata + scheduling API
  v
Composer
  |
  | destination = platform + accountId
  | media = HTTPS URL + type
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
    worker    worker
        \      /
      Platform Adapter
           |
      Provider API

Repository
  |- JSON development storage
  `- PostgreSQL production target
```

Provider-specific endpoints, validation, scopes, and response shapes stay inside provider modules. The generic scheduler and post service do not contain Instagram endpoint logic.

## Technology

- **Frontend:** HTML, CSS, vanilla JavaScript ES modules
- **Backend:** Node.js >= 20, built-in HTTP server
- **Development persistence:** `data/srocial.json`
- **Production database target:** PostgreSQL
- **CI:** GitHub Actions
- **External npm dependencies:** none in the current runtime

## Run Locally

Requirements:

```text
Node.js >= 20
```

Start:

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

See `HOW_TO_RUN.md` for the beginner-oriented setup guide.

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
DATABASE_URL=postgres://...
TOKEN_ENCRYPTION_KEY=<long-random-secret>
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
INSTAGRAM_API_VERSION=v26.0
```

The current project does not automatically load `.env` files. Environment values must be supplied by the process/shell or deployment environment.

Provider credentials and encryption keys are server-only. Never expose them in HTML, frontend JavaScript, browser storage, API responses, logs, or Git history.

## Scheduling API

### Preferred V6 request

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

For every explicit destination, Srocial verifies that:

- the platform is supported by the social scheduling model;
- `accountId` exists;
- the account is `CONNECTED`;
- the account provider matches the destination platform.

Destinations are deduplicated by `(platform, accountId)`.

Generic media rules in V6:

- `type` is `image` or `video`;
- URL must be valid HTTPS;
- at most 10 media records per post at the generic layer;
- provider adapters may impose stricter rules.

The current Instagram adapter accepts one externally reachable HTTPS image or one Reel video. Object/file upload is not implemented yet.

### Legacy compatibility

The old request remains accepted:

```json
{
  "caption": "Development record",
  "platforms": ["instagram", "threads"],
  "scheduledAt": "2026-09-11T10:00:00.000Z"
}
```

This creates publications with:

```text
accountId = null
```

It exists for backward compatibility and internal development. **Do not use legacy unbound publications for real provider publishing.**

### Other APIs

```text
GET  /api/posts
GET  /api/dashboard
GET  /api/accounts
POST /api/accounts/:id/disconnect
POST /api/oauth/:provider/start
GET  /api/oauth/:provider/callback
```

Account responses contain safe metadata only; access/refresh token fields are not returned.

## Composer V6

The browser composer now loads safe connected accounts from `GET /api/accounts`.

For each platform it presents:

```text
[ ] Platform     [ Connected account ▼ ]
```

A destination is enabled only when a connected account exists for that provider. The submitted payload contains the selected account ID rather than only a platform name.

The composer also accepts one image/video HTTPS URL. Multiple-media UI and direct file/object-storage upload are later stages.

## Instagram Provider

Instagram is registered only when these server-side values are present:

```text
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
```

The current provider requests:

```text
instagram_business_basic
instagram_business_content_publish
```

OAuth uses the generic Srocial flow:

```text
POST /api/oauth/instagram/start
 -> one-time state
 -> Instagram authorization
 -> callback
 -> token exchange
 -> professional account identity
 -> encrypted account persistence
```

Publishing resolves `publication.accountId` server-side and decrypts the credential only for the provider call.

## Scheduler Runtime

The existing `runSchedulerTick()` execution engine is now wrapped by a recurring runtime loop.

A production scheduler starts only when:

```text
ALLOW_REAL_PUBLISH=true
SCHEDULER_ENABLED=true
```

Default interval:

```text
SCHEDULER_INTERVAL_MS=30000
```

The loop uses one worker identity for its lifetime and refuses overlapping ticks. Existing repository locks and publication idempotency checks remain the deeper duplicate-publication protections.

Job states:

```text
SCHEDULED
RUNNING
RETRYING
COMPLETED
FAILED
CANCELLED
```

Default retry delays:

```text
1 minute
5 minutes
15 minutes
60 minutes thereafter
```

A provider result of `PROCESSING` creates/uses a status-check path rather than publishing the original content again.

## Data Model

Core records:

```text
accounts
posts
media
publications
scheduler_jobs
oauth_states
webhook_events
```

Relationship for a social publication:

```text
Account
   |
Publication ---- Post ---- Media
   |
Scheduler Job
```

The PostgreSQL schema already contains `media`, `publications.account_id`, and `scheduler_jobs.account_id`; V6 therefore needs no destructive schema migration.

## Security Boundary

```text
Browser
   |
   | safe account IDs / metadata
   v
Srocial backend
   |
   | encrypted credential store
   | raw token only in provider-call memory
   v
Provider API
```

OAuth state is random, stored as a SHA-256 hash, expires, and is single-use. Provider tokens are encrypted at rest. Real publishing is default-off behind two independent runtime switches.

## Verification

Repository CI is defined in:

```text
.github/workflows/test.yml
```

For build branches, pull requests, and `main`, CI runs:

```bash
npm test
find server client tests -name '*.js' -print0 | xargs -0 -n1 node --check
```

## Repository Structure

```text
srocial/
|- .github/workflows/test.yml
|- README.md
|- HOW_TO_RUN.md
|- updaterules.md
|- client/
|  |- index.html
|  |- css/
|  `- js/
|- server/
|  |- auth/
|  |- db/
|  |- routes/
|  |- services/
|  |- scheduler/
|  `- platforms/
|     `- instagram/
|- tests/
|- docs/superpowers/
|- .env.example
`- package.json
```

## Development Direction

Next priorities:

1. build a complete browser Accounts screen and Instagram Connect/Reconnect/Disconnect UX;
2. return the OAuth callback to the dashboard instead of leaving the user on an API JSON response;
3. add direct media upload/object storage so users do not need public URLs;
4. add long-lived Instagram token refresh jobs;
5. implement Threads and Facebook provider adapters;
6. implement TikTok OAuth and Content Posting;
7. add real provider webhook processing;
8. implement WhatsApp contacts, templates, campaigns, and recipient-level delivery tracking;
9. implement the production PostgreSQL repository with transaction-safe claims;
10. add analytics and deeper operational controls.

## Development Rules

All contributors and AI coding agents must read `updaterules.md` before changing the project.

`README.md` defines current capability and architecture. `updaterules.md` defines how Srocial is allowed to evolve.
