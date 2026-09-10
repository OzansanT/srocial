# Srocial

Srocial is a self-hosted social-media publishing, scheduling, monitoring, and business-messaging dashboard.

The project uses one scheduling engine with isolated provider adapters. Instagram, Facebook, Threads, TikTok, and WhatsApp Business therefore do not become five unrelated applications. WhatsApp remains a separate messaging/campaign subsystem rather than a public-post adapter.

## Current Status — V7

The runnable foundation now includes:

- vanilla HTML/CSS/JavaScript dashboard, Accounts panel, and account-bound composer;
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

Provider-specific endpoints, validation, scopes, and response shapes stay inside provider modules. The generic scheduler, account service, and post service do not contain Instagram endpoint logic.

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

## Accounts UI — V7

The dashboard now contains an Accounts section.

For Instagram, the browser supports:

```text
Connect Instagram
Reconnect
Disconnect
```

Connect/Reconnect uses the existing server OAuth start endpoint:

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

keep the previous API behavior and receive the safe JSON callback payload/status rather than a browser redirect.

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

The current Instagram adapter accepts one externally reachable HTTPS image or one Reel video. Direct object/file upload is not implemented yet.

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
GET  /api/posts
POST /api/posts
GET  /api/dashboard
GET  /api/accounts
POST /api/accounts/:id/disconnect
POST /api/oauth/:provider/start
GET  /api/oauth/:provider/callback
```

Account responses contain safe metadata only; access/refresh token fields are not returned.

## Composer

The browser composer loads safe connected accounts from `GET /api/accounts`.

For each platform it presents:

```text
[ ] Platform     [ Connected account ▼ ]
```

A destination is enabled only when a connected account exists for that provider. The submitted payload contains the selected account ID rather than only a platform name.

The composer currently accepts one image/video HTTPS URL. Multiple-media UI and direct file/object-storage upload are later stages.

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

The PostgreSQL schema already contains `media`, `publications.account_id`, and `scheduler_jobs.account_id`; V7 requires no database migration.

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
|  |  `- pages/accounts.css
|  `- js/
|     |- api/accounts-api.js
|     `- pages/accounts.js
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

1. add direct media upload/object storage so users do not need public URLs;
2. add long-lived Instagram token refresh jobs;
3. implement Threads and Facebook provider adapters;
4. implement TikTok OAuth and Content Posting;
5. add real provider webhook processing;
6. implement WhatsApp contacts, templates, campaigns, and recipient-level delivery tracking;
7. implement the production PostgreSQL repository with transaction-safe claims;
8. add analytics and deeper operational controls.

## Development Rules

All contributors and AI coding agents must read `updaterules.md` before changing the project.

`README.md` defines current capability and architecture. `updaterules.md` defines how Srocial is allowed to evolve.
