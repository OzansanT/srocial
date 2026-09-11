# Srocial

Srocial is a self-hosted social-media publishing, scheduling, monitoring, and business-messaging dashboard.

The project uses one scheduling engine with isolated provider adapters. Instagram, Facebook, Threads, TikTok, and WhatsApp Business therefore do not become five unrelated applications. WhatsApp remains a separate messaging/campaign subsystem rather than a public-post adapter.

## Current Status — V9

The runnable foundation now includes:

- vanilla HTML/CSS/JavaScript dashboard, Accounts panel, Media Library, and account-bound composer;
- provider-neutral Accounts/OAuth infrastructure;
- browser Instagram Connect, Reconnect, and Disconnect controls;
- safe OAuth browser callbacks that return to the Accounts panel;
- explicit JSON OAuth callback compatibility for API clients;
- encrypted provider-token persistence with AES-256-GCM;
- one-time hashed OAuth state with expiry/replay protection;
- a real Instagram professional-account provider using Instagram Login;
- Instagram single-image and Reel publishing/status flows;
- explicit account-bound social destinations;
- post media persistence using externally reachable HTTPS URLs;
- direct JPEG/PNG/WebP/MP4 uploads with streamed local storage and composer controls;
- a Media Library with preview, reuse, URL copying, reference-protected deletion, usage reporting, and total-storage quotas;
- account/platform compatibility validation before scheduling;
- one publication and scheduler job per selected destination;
- atomic job claiming, worker locks, stale-lock recovery, retries, status checks, and idempotency guards;
- a recurring scheduler runtime with overlap protection;
- double-gated real publishing;
- JSON development persistence and PostgreSQL production-target migrations;
- GitHub Actions plus built-in Node.js tests.

The safe defaults remain deliberately off:

```text
ALLOW_REAL_PUBLISH=false
SCHEDULER_ENABLED=false
```

**Real scheduled publishing starts only when both values are explicitly set to `true`.**

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
  +--> Accounts UI --> OAuth start --> Instagram authorization
  |                                      |
  |                                Srocial callback
  |                                      |
  |                             encrypted Account store
  |                                      |
  +<---------- safe dashboard redirect <-+
  |
  +--> Media Library <--> Local media store
  |       |                    |
  |       | use in composer    `--> /media/:key
  |       v
  +--> Composer
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

Provider-specific endpoints, validation, scopes, and response shapes stay inside provider modules. The generic scheduler, account service, media-library service, and post service do not contain Instagram endpoint logic.

## Technology

- **Frontend:** HTML, CSS, vanilla JavaScript ES modules
- **Backend:** Node.js >= 20, built-in HTTP server
- **Development persistence:** `data/srocial.json`
- **Local uploaded media:** `data/uploads/`
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
MEDIA_UPLOAD_DIR=./data/uploads
MEDIA_UPLOAD_MAX_BYTES=52428800
MEDIA_UPLOAD_TOTAL_MAX_BYTES=5368709120
DATABASE_URL=postgres://...
TOKEN_ENCRYPTION_KEY=<long-random-secret>
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
INSTAGRAM_API_VERSION=v26.0
```

The current project does not automatically load `.env` files. Environment values must be supplied by the process/shell or deployment environment.

Provider credentials and encryption keys are server-only. Never expose them in HTML, frontend JavaScript, browser storage, API responses, logs, or Git history.

## Accounts UI — V7

The dashboard contains an Accounts section.

For Instagram, the browser supports:

```text
Connect Instagram
Reconnect
Disconnect
```

Connect/Reconnect uses:

```text
POST /api/oauth/instagram/start
```

The browser receives only an authorization URL and navigates to Instagram. Provider secrets and tokens remain server-side.

Disconnect uses:

```text
POST /api/accounts/:id/disconnect
```

After an account changes, the Accounts panel and composer account selectors refresh so a disconnected account can no longer be selected for a new publication.

Stored account metadata is rendered through DOM text nodes rather than raw HTML interpolation.

## OAuth Callback Behavior

Srocial keeps one callback endpoint:

```text
GET /api/oauth/:provider/callback
```

### Browser navigation

When the request prefers HTML, a successful OAuth callback returns `303 See Other` to:

```text
/?oauth=instagram&status=connected#accounts
```

A sanitized failure returns to the same Accounts area with a safe Srocial error code, for example:

```text
/?oauth=instagram&status=error&code=oauth_state_invalid#accounts
```

Authorization codes, OAuth state values, provider tokens, raw provider error messages, and stack traces are never copied into the dashboard URL.

The Accounts module converts the safe code into user-facing feedback and removes handled OAuth parameters from browser history.

### Explicit JSON clients

Clients that send:

```http
Accept: application/json
```

keep the existing API behavior and receive the safe JSON callback payload/status rather than a browser redirect.

## Scheduling API

### Preferred account-bound request

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

Generic media rules:

- `type` is `image` or `video`;
- URL must be valid HTTPS;
- at most 10 media records per post at the generic layer;
- provider adapters may impose stricter rules.

The current Instagram adapter accepts one externally reachable HTTPS image or one Reel video. Uploaded files and Media Library assets reuse the same URL-based post contract. Provider-specific format requirements still apply.

### Legacy compatibility

The old development request remains accepted:

```json
{
  "caption": "Development record",
  "platforms": ["instagram", "threads"],
  "scheduledAt": "2026-09-11T10:00:00.000Z"
}
```

It creates publications with `accountId = null`. This exists for backward compatibility and internal development. **Do not use legacy unbound publications for real provider publishing.**

### Public API surface

```text
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

Account responses contain safe metadata only; access/refresh token fields are not returned.

## Composer

The browser composer loads safe connected accounts from `GET /api/accounts`.

For each platform it presents:

```text
[ ] Platform     [ Connected account ▼ ]
```

A destination is enabled only when a connected account exists for that provider. The submitted payload contains the selected account ID rather than only a platform name.

The composer accepts one image/video HTTPS URL, a directly uploaded file, or an asset selected from the Media Library. Uploading locks media controls and scheduling until it finishes; errors preserve the previous URL and allow retry. Manual URL entry remains supported.

## Direct media uploads — V8

`POST /api/media/uploads` accepts the raw file body with one of these declared MIME types: `image/jpeg`, `image/png`, `image/webp`, or `video/mp4`. It returns `{ upload: { key, type, contentType, size, url, isHttps } }`. SVG/HTML MIME types are rejected. This is a MIME allowlist, not content-signature inspection or malware scanning.

Files stream to `data/uploads/` by default under generated UUID filenames. `MEDIA_UPLOAD_DIR` changes that directory. `MEDIA_UPLOAD_MAX_BYTES` changes the per-file limit (default `52428800`, 50 MiB). `MEDIA_UPLOAD_TOTAL_MAX_BYTES` changes the total local-media quota (default `5368709120`, 5 GiB). Empty, failed, oversized, and over-quota partial uploads are removed.

Uploaded assets are **public to anyone with their URL**, served with trusted MIME headers and `nosniff`. This development server still has no application login or upload authorization: protect the dashboard and `/api/` behind authenticated access and request limits before exposing it, while allowing provider retrieval of `/media/`.

Local HTTP uploads work for storage testing, but the scheduling API still requires HTTPS. Set `PUBLIC_BASE_URL` to the actual externally reachable HTTPS origin serving Srocial before uploading media for provider publishing. Changing this setting does not rewrite old URLs; re-upload or select/enter the correct HTTPS URL. An HTTPS URL alone does not prove public reachability.

## Media Library — V9

The dashboard Media section lists local uploaded assets with previews, media type, file size, storage usage, and actions.

`GET /api/media` returns the local asset inventory and aggregate quota information. File-system paths are never returned. Assets are marked `referenced: true` when a persisted post-media URL points to their `/media/:key` path.

`DELETE /api/media/:key` deletes only unused local assets. If a persisted post references the asset, deletion returns:

```http
409 Conflict
```

```json
{ "error": "media_in_use" }
```

This reference check compares the `/media/:key` portion rather than the host, so changing `PUBLIC_BASE_URL` does not make a referenced asset appear unused. Deletion never cascades into posts or publication records.

The browser provides **Use in composer**, **Copy URL**, and **Delete** actions. Referenced assets display an **In use** state and cannot be deleted from the library.

The local media store remains behind a storage interface, allowing a future R2/S3 implementation without changing the composer/post contract. Multiple-media composer UI, object-storage adapters, authentication, file-signature inspection, malware scanning, and automatic orphan-retention cleanup remain future work.

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

OAuth flow:

```text
Accounts UI
 -> POST /api/oauth/instagram/start
 -> one-time state
 -> Instagram authorization
 -> Srocial callback
 -> token exchange
 -> professional account identity
 -> encrypted account persistence
 -> dashboard Accounts redirect
```

Publishing resolves `publication.accountId` server-side and decrypts the credential only for the provider call.

## Scheduler Runtime

The scheduler starts only when:

```text
ALLOW_REAL_PUBLISH=true
SCHEDULER_ENABLED=true
```

Default interval:

```text
SCHEDULER_INTERVAL_MS=30000
```

The recurring loop uses one worker identity for its lifetime and refuses overlapping ticks. Repository locks and publication idempotency checks remain deeper duplicate-publication protections.

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

A provider result of `PROCESSING` uses a status-check path rather than publishing the original content again.

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

The Media Library inventory is derived from the configured media store; persisted `media` records remain post-media references. V9 therefore does not create a second upload metadata table.

The PostgreSQL schema already contains `media`, `publications.account_id`, and `scheduler_jobs.account_id` for the production target.

## Security Boundary

```text
Browser
   |
   | safe account IDs / metadata / safe OAuth result codes
   v
Srocial backend
   |
   | encrypted credential store
   | raw token only in provider-call memory
   v
Provider API
```

OAuth state is random, stored as a SHA-256 hash, expires, and is single-use. Provider tokens are encrypted at rest. Browser callback redirects use fixed Srocial-relative destinations and sanitized error codes. Real publishing remains default-off behind two independent switches.

Media-library responses expose public media metadata but never local disk paths. Media deletion validates generated keys and refuses referenced assets.

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
|  |- css/pages/
|  |  |- accounts.css
|  |  `- media-library.css
|  `- js/
|     |- api/
|     |  |- accounts-api.js
|     |  `- media-library-api.js
|     `- pages/
|        |- accounts.js
|        `- media-library.js
|- server/
|  |- auth/
|  |- db/
|  |- media/
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

1. add object-storage adapters, upload authorization, file-signature inspection, and automatic orphan-retention cleanup;
2. add long-lived Instagram token refresh jobs;
3. implement Threads and Facebook provider adapters;
4. implement TikTok OAuth and Content Posting;
5. add real provider webhook processing;
6. implement WhatsApp contacts, templates, campaigns, and recipient-level delivery tracking;
7. implement the production PostgreSQL repository with transaction-safe claims;
8. add calendar/queue operational controls and analytics.

## Development Rules

All contributors and AI coding agents must read `updaterules.md` before changing the project.

`README.md` defines current capability and architecture. `updaterules.md` defines how Srocial is allowed to evolve.
