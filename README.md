# Srocial

Srocial is a self-hosted social-media publishing, scheduling, monitoring, lifecycle-management, and business-messaging dashboard.

Instagram, Facebook Pages, Threads, and TikTok share the social publishing runtime. WhatsApp Business is intentionally a separate contacts/templates/campaign subsystem that reuses the same repository, scheduler infrastructure, verified-webhook layer, and Operations Center.

## Current Status — V19

The runnable foundation now includes:

- vanilla HTML/CSS/JavaScript dashboard, Accounts, Media Library, composer, **Draft workspace**, Operations Center, WhatsApp operator surface, **Queue**, and **Calendar**;
- provider-neutral OAuth/account infrastructure with encrypted credentials;
- Instagram professional-account OAuth plus image/Reel publishing and status flows;
- Facebook Pages OAuth plus deterministic Page selection and text/image/Reel publishing;
- Threads OAuth plus text/image/video publishing and status flows;
- TikTok Login Kit OAuth, Creator Info, privacy/interaction-aware Direct Post for one photo/video, rotating refresh tokens, and async status polling;
- direct JPEG/PNG/WebP/MP4 upload, local or S3-compatible storage, Media Library reuse/deletion/quota, and optional orphan cleanup;
- one persistent scheduler with stale-lock recovery, retry/backoff, status checks, token refresh, idempotency guards, and execution-domain filtering;
- JSON development persistence and PostgreSQL production persistence with transaction-safe job claims and checksum-verified migrations;
- **atomic social post/media/publication/job schedule creation** for JSON and PostgreSQL;
- **atomic WhatsApp campaign/recipient/job schedule creation** for JSON and PostgreSQL;
- opt-in single-administrator application authentication, signed HttpOnly sessions, same-origin mutation protection, and process-local rate limiting;
- publication-attempt history, verified Meta/TikTok/WhatsApp webhooks, provider health, and active rate-limit visibility;
- WhatsApp Business contacts with explicit consent/eligibility, approved-template synchronization, scheduled campaigns, recipient/message state, and duplicate-send-safe execution;
- **month/week/day social publishing calendar with Previous/Today/Next navigation**;
- **drag-to-reschedule with browser-local time-of-day preservation**;
- **operational Queue filters by platform/account/state**;
- **state-safe edit, reschedule, cancel, duplicate, retry, bulk cancel, and bulk reschedule actions**;
- **server-persisted drafts with delayed autosave, recovery, optimistic revisions, and stale-write conflict protection**;
- **reusable caption templates, hashtag collections, and saved destination groups**;
- **per-platform caption/media overrides persisted on publications and resolved by provider adapters at execution time**;
- **live effective-content previews, platform character counts, and server-side pre-publish compatibility reports**;
- protected Operations, WhatsApp, post-lifecycle, and composer-workflow management APIs plus browser UI;
- GitHub Actions coverage against PostgreSQL 17.

Safe execution defaults remain:

```text
SCHEDULER_ENABLED=false
ALLOW_REAL_PUBLISH=false
ALLOW_REAL_WHATSAPP=false
```

The scheduler starts only when `SCHEDULER_ENABLED=true` and at least one execution gate is explicitly enabled. Social jobs and WhatsApp campaign jobs are claimed independently, so enabling WhatsApp cannot trigger social publishing and vice versa. Draft/resource/compatibility writes never enqueue scheduler work.

## Supported Channels

| Channel | Current state |
| --- | --- |
| Instagram | account management + OAuth + long-lived token refresh + image/Reel publish/status adapter + publication content overrides |
| Facebook Pages | account management + OAuth + Page-token resolution + text/image/Reel publish/status adapter + publication content overrides |
| Threads | account management + OAuth + long-lived token refresh + text/image/video publish/status adapter + publication content overrides |
| TikTok | account management + OAuth + rotating token refresh + Creator Info + privacy-aware photo/video Direct Post + status adapter + publication content overrides |
| WhatsApp Business | contacts + consent + approved templates + scheduled campaigns + recipient/message states + signed delivery webhooks |

## Architecture

```text
Browser
  |
  +--> Admin session
  +--> Accounts / OAuth
  +--> Media Library
  +--> Social Composer
  |     +--> Drafts / autosave
  |     +--> reusable templates / hashtags / destinations
  |     +--> per-platform overrides / previews / compatibility
  +--> Queue / Calendar lifecycle controls
  +--> WhatsApp Contacts / Templates / Campaigns
  +--> Operations Center
  |
  v
Node HTTP application
  |
  +--> Composer Workflow Service
  +--> Compatibility Service
  +--> Social Post Service
  +--> Post Lifecycle Service
  +--> WhatsApp Campaign Services
  +--> Operations API
  +--> Verified Webhook Routes
  |
  v
Repository (JSON | PostgreSQL)
  |
  +--> composer_drafts / reusable composer resources
  +--> atomic social scheduling graph
  +--> atomic lifecycle mutation units
  +--> posts / media / publications (+ content overrides)
  +--> scheduler_jobs
  +--> publication_attempts
  +--> webhook_events / provider_status
  +--> contacts / whatsapp_templates
  `--> campaigns / campaign_recipients / whatsapp_messages
              |
              v
          Scheduler Loop
       claim / lock / retry
        /              \
 Social execution   WhatsApp campaign
      |                    |
 Provider adapters   WhatsApp adapter
```

Provider-specific behavior remains inside provider/messaging modules. SQL stays under `server/db/`. Drafts and reusable resources are management data and do not form a second scheduler. Calendar and Queue remain operator views over the existing social records.

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

Normal `npm start` never applies migrations automatically. See `HOW_TO_RUN.md` for beginner-oriented setup.

## Environment

Important settings are documented in `.env.example`.

```text
SCHEDULER_ENABLED=false
ALLOW_REAL_PUBLISH=false
ALLOW_REAL_WHATSAPP=false
PUBLIC_BASE_URL=http://127.0.0.1:3000

APP_AUTH_ENABLED=false
ADMIN_USERNAME=admin
ADMIN_PASSWORD=
SESSION_SECRET=<at-least-32-random-characters>

DATABASE_DRIVER=json
DATABASE_URL=postgres://...
TOKEN_ENCRYPTION_KEY=<long-random-secret>

INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
THREADS_APP_ID=
THREADS_APP_SECRET=
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=

META_WEBHOOK_VERIFY_TOKEN=
META_WEBHOOK_APP_SECRET=

WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_GRAPH_API_VERSION=v26.0
```

Srocial does not automatically load `.env` files. Supply values through the shell, process manager, container, or deployment environment. Provider credentials, administrator credentials, encryption keys, app/session secrets, database credentials, object-storage credentials, and WhatsApp access tokens are server-only.

## Application Authentication

Authentication remains opt-in for local-development compatibility:

```text
APP_AUTH_ENABLED=false
```

For network/public deployments, enable it and use HTTPS. The current security model is deliberately single-administrator; full database-backed users/RBAC remains tracked separately in `PROBLEMS.md`.

When authentication is enabled, dashboard/management APIs are default-deny. Public exceptions exist only where infrastructure/providers require reachability.

### Public surface

```text
GET       /api/health
POST      /api/auth/login
GET       /api/oauth/:provider/callback
GET/HEAD  /media/:key
GET       /api/webhooks/meta
POST      /api/webhooks/meta
POST      /api/webhooks/tiktok
GET       /api/webhooks/whatsapp
POST      /api/webhooks/whatsapp
GET/HEAD  login document/assets
```

Webhook POST routes are public at the administrator-session layer but accept state-changing provider payloads only after signature verification.

### Protected management surface

```text
GET    /api/auth/session
POST   /api/auth/logout
GET    /api/dashboard
GET    /api/operations

GET    /api/posts?platform=&accountId=&state=&from=&until=
POST   /api/posts
PATCH  /api/posts/:id
POST   /api/posts/:id/cancel
POST   /api/posts/:id/duplicate
POST   /api/publications/:id/retry
POST   /api/posts/bulk/cancel
POST   /api/posts/bulk/reschedule

GET    /api/composer/drafts
POST   /api/composer/drafts
GET    /api/composer/drafts/:id
PATCH  /api/composer/drafts/:id
DELETE /api/composer/drafts/:id
GET    /api/composer/caption-templates
POST   /api/composer/caption-templates
DELETE /api/composer/caption-templates/:id
GET    /api/composer/hashtag-collections
POST   /api/composer/hashtag-collections
DELETE /api/composer/hashtag-collections/:id
GET    /api/composer/destination-groups
POST   /api/composer/destination-groups
DELETE /api/composer/destination-groups/:id
POST   /api/composer/compatibility

GET    /api/accounts
GET    /api/accounts/:id/tiktok/creator-info
POST   /api/accounts/:id/disconnect
POST   /api/oauth/:provider/start
GET    /api/media
POST   /api/media/uploads
DELETE /api/media/:key

GET    /api/whatsapp/contacts
POST   /api/whatsapp/contacts
POST   /api/whatsapp/contacts/:id/consent
GET    /api/whatsapp/templates
POST   /api/whatsapp/templates/sync
GET    /api/whatsapp/campaigns
POST   /api/whatsapp/campaigns
```

Authenticated mutations are same-origin checked. Login/API rate limits are process-local and intentionally do not trust forwarded IP headers.

## Social Accounts and Scheduling

The Accounts UI supports Instagram, Facebook, Threads, and TikTok connect/reconnect/disconnect workflows. Instagram, Threads, and TikTok refresh credentials through account-bound `TOKEN_REFRESH` jobs. TikTok refresh tokens may rotate.

Preferred social scheduling request:

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
      "accountId": "connected-account-id",
      "captionOverride": "Instagram-specific caption",
      "mediaOverride": [
        {
          "type": "image",
          "url": "https://cdn.example.com/instagram.jpg"
        }
      ]
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

Every explicit account must exist, be `CONNECTED`, and match the selected platform. Provider-specific choices and V19 content overrides are stored on the publication rather than the generic post record.

A `null` content override inherits the master post content. An explicit empty media override (`[]`) means no media for that publication and remains distinct from inheritance. Final schedule creation validates the effective caption/media for every destination.

Social scheduling persists the post, master media, publications, and executable scheduler jobs as one all-or-nothing repository operation. PostgreSQL uses a database transaction; the JSON backend persists an isolated candidate snapshot before publishing it as active state.

Legacy platform-only scheduling remains available for backward compatibility and is explicitly tracked under `SR-P007` because it can create unbound publications.

## Drafts + Composer Workflows — V19

V19 implements the source roadmap's draft and richer-composer block.

### Drafts and autosave

Drafts persist on the server in JSON/PostgreSQL rather than in browser-only storage. Drafts can contain incomplete composer state and never create scheduler jobs. The browser performs delayed autosave and provides an explicit Save now action.

Draft updates use optimistic revisions. A stale tab/client receives `409 draft_revision_conflict` instead of overwriting a newer revision. After conflict, automatic writes stop until the saved version is reloaded.

### Reusable content

The composer can save and reuse:

- caption templates;
- normalized hashtag collections;
- destination groups containing platform/account selections.

These records are independent from posts and publications.

### Platform-specific composition

Each selected social destination can override:

- caption;
- media behavior: inherit, no media, or custom image/video.

Provider adapters resolve the effective publication content immediately before provider validation/execution. This keeps one master post with destination-specific publications rather than duplicating posts.

### Compatibility and preview

`POST /api/composer/compatibility` evaluates unscheduled composer state without provider publishing side effects or scheduler writes. It reports effective caption lengths/known limits, account/media issues, and destination compatibility.

The browser renders safe-DOM platform previews with effective caption/media, character counts, and normalized issues. Compatibility is advisory; final scheduling performs the authoritative validation again.

See `docs/V19_DRAFTS_COMPOSER.md`.

## Calendar + Queue Lifecycle — V18

V18 closes the historical source roadmap's unfinished Calendar / Queue / Post Management block.

### Calendar

The browser exposes:

```text
Month
Week
Day
```

with Previous / Today / Next navigation. Scheduled posts render in browser-local time. A post can be dragged to another date; the date changes while the original browser-local time-of-day is preserved before conversion back to UTC.

### Queue

Queue supports:

- platform/account/state filters;
- edit caption;
- reschedule;
- cancel;
- duplicate into a new future schedule;
- retry safe failed publications;
- multi-select;
- bulk reschedule;
- bulk cancel.

### Lifecycle safety

Edit/reschedule are rejected once execution has begun. Cancel and retry fail closed when a provider `externalId` indicates an external side effect may already exist. Bulk operations validate the complete set before making an atomic mutation.

The repository revalidates expected publication/job state at commit time so the scheduler cannot claim a job between service validation and a lifecycle mutation. PostgreSQL locks affected rows inside the lifecycle transaction; JSON performs the equivalent preflight before patching its candidate snapshot. A stale scheduler state becomes a safe lifecycle conflict rather than overwriting newly running work.

Duplicate uses the ordinary scheduling path and revalidates connected accounts/provider requirements rather than cloning execution records blindly.

See `docs/V18_CALENDAR_QUEUE.md`.

## Operations Center — V16

V16 added publication-attempt history, verified Meta/TikTok webhook ingestion, provider health/rate-limit snapshots, TikTok publication/account synchronization, a protected Operations API, and dashboard visibility.

Verified raw webhook bytes are fingerprinted into provider-scoped event IDs so duplicate deliveries are acknowledged without repeating side effects. Raw webhook payloads and provider credentials are not returned by the Operations API.

See `docs/V16_OPERATIONS_CENTER.md`.

## WhatsApp Business — V17

V17 adds a separate messaging subsystem rather than pretending WhatsApp is a social-post destination.

### Contacts and consent

Contacts use E.164 numbers and one of:

```text
UNKNOWN
OPTED_IN
OPTED_OUT
```

Campaigns accept only explicitly `OPTED_IN` recipients. Opt-in requires a recorded consent source.

### Approved templates

Templates are synchronized server-side from the configured WhatsApp Business Account. Campaign creation requires a locally stored provider template whose current status is `APPROVED`.

### Campaign execution

Each campaign creates one `WHATSAPP_CAMPAIGN` scheduler job. Recipient and message state is persisted independently.

Campaign, recipients, and scheduler job are created atomically through the same repository-level consistency rule introduced during V18 hardening.

Message intent is stored before the provider call. Explicit provider rate limits may retry. Ambiguous network/crash delivery does **not** blindly resend; it is terminalized as `DELIVERY_UNCERTAIN` to prevent duplicate external messages.

### Delivery webhooks

```text
GET  /api/webhooks/whatsapp
POST /api/webhooks/whatsapp
```

The challenge uses `WHATSAPP_VERIFY_TOKEN`. POST signatures use `X-Hub-Signature-256` over the exact raw request bytes with `WHATSAPP_APP_SECRET`.

Verified message states support monotonic progression such as:

```text
SENT -> DELIVERED -> READ
```

Failure callbacks record sanitized failure state. Duplicate/retried webhook deliveries use the V16 dedup/resume mechanism.

See `docs/V17_WHATSAPP_BUSINESS.md` for setup, safety behavior, APIs, and the live-provider verification gap.

## Media Uploads and Library

`POST /api/media/uploads` supports JPEG, PNG, WebP, and MP4. Supported types are byte-signature checked rather than trusting MIME declaration alone.

Uploaded media must be provider-reachable when used for publishing. Media Library deletion refuses assets referenced by persisted post media. Storage can be local or S3-compatible.

See `docs/V12_MEDIA_STORAGE.md`.

## Database Backends

### JSON

```text
DATABASE_DRIVER=json
DATA_FILE=./data/srocial.json
```

### PostgreSQL

```text
DATABASE_DRIVER=postgres
DATABASE_URL=postgres://user:password@host:5432/database
```

Migrations are ordered, checksum-recorded, transaction-protected, and guarded by a PostgreSQL advisory lock. Historical migrations are immutable. Scheduler claims use `FOR UPDATE SKIP LOCKED` so multiple workers cannot claim the same due job.

Recent migrations:

```text
005_operations_center.sql
006_whatsapp_business.sql
007_composer_workflows.sql
```

Migration 007 adds persisted V19 draft/reusable-resource records and publication caption/media override fields.

## Data Model

Core runtime records include:

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
composer_drafts
caption_templates
hashtag_collections
destination_groups
contacts
whatsapp_templates
campaigns
campaign_recipients
whatsapp_messages
```

## Verification

CI runs against PostgreSQL 17 and executes:

```bash
npm install --ignore-scripts
npm run db:migrate
npm test
find server client tests -name '*.js' -print0 | xargs -0 -n1 node --check
```

V19 feature implementation run `34855680708` passed **402/402 tests**, applied migrations through `007_composer_workflows.sql`, and passed JavaScript syntax checks.

Coverage includes authentication; PostgreSQL persistence/concurrency/migrations; media lifecycle; Instagram/Facebook/Threads/TikTok provider behavior; V16 signature verification, webhook deduplication and provider telemetry; V17 consent/template/campaign/message behavior; V18 atomic schedule/lifecycle/calendar/queue behavior; and V19 JSON/PostgreSQL draft persistence, optimistic revision conflicts, reusable composer resources, protected APIs, compatibility reporting, publication override persistence, effective-content validation/provider execution, preview/character-count rendering, dashboard wiring, and composer upload regressions.

Real-provider and browser-E2E verification gaps remain in `PROBLEMS.md`. Automated CI cannot substitute for approved provider applications, live credentials, real sender identities, public HTTPS callbacks, or actual browser interaction testing. V19 browser autosave/recovery and stale-revision workflows are specifically tracked under `SR-P001`.

## Repository Structure

```text
srocial/
|- .github/workflows/test.yml
|- README.md
|- HOW_TO_RUN.md
|- PROBLEMS.md
|- updaterules.md
|- client/
|  |- css/pages/
|  |  |- composer.css
|  |  `- queue-calendar.css
|  `- js/
|     |- api/composer-workflows-api.js
|     |- components/
|     |  |- calendar.js
|     |  `- platform-preview.js
|     `- pages/
|        |- composer.js
|        |- composer-workflows.js
|        `- queue-calendar.js
|- server/
|  |- auth/
|  |- db/
|  |- http/
|  |- media/
|  |- messaging/whatsapp/
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
|  |- V16_OPERATIONS_CENTER.md
|  |- V17_WHATSAPP_BUSINESS.md
|  |- V18_CALENDAR_QUEUE.md
|  `- V19_DRAFTS_COMPOSER.md
|- .env.example
`- package.json
```

## Development Direction

With source roadmap items 81–90 implemented by V19, the next unresolved source-defined product work is:

1. **Analytics & Reporting** — begin with source item 98, basic social analytics: normalized channel/post KPI ingestion, storage, API/reporting views, and date/platform/account slices. Source items 91–97 substantially overlap the already-implemented V16 Operations Center, retry/failure tracking, provider health, and verified webhooks;
2. **Browser end-to-end coverage** for critical operator flows including V19 drafts/autosave/recovery/overrides, Calendar/Queue, WhatsApp, Operations Center, authentication, and account management;
3. **Full users/roles security milestone if required** — database-backed identities, RBAC, invitations/session revocation, trusted-proxy handling, and distributed rate limiting;
4. **Legacy scheduling cleanup** — decide whether `SR-P007` platform-only unbound scheduling remains required and remove/migrate it if backward compatibility is no longer needed.

The historical source roadmap's version labels diverged from live implementation order. Live V18 closed the source Calendar/Queue/Post Management gap; live V19 now closes the source Drafts/Autosave/Templates/Reusable Content/Per-Platform Composer block. Analytics/reporting is therefore the next source-aligned product milestone.

## Development Rules

All contributors and AI coding agents must read `updaterules.md` and `PROBLEMS.md` before changing the project.

`README.md` defines current capability and architecture. `updaterules.md` defines how Srocial may evolve. `PROBLEMS.md` is the persistent tracker for unresolved implementation or verification gaps.
