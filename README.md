# Srocial

Srocial is a self-hosted social-media publishing, scheduling, monitoring, analytics, lifecycle-management, access-control, and business-messaging dashboard.

Instagram, Facebook Pages, Threads, and TikTok share the social publishing and analytics runtime. WhatsApp Business is intentionally a separate contacts/templates/campaign subsystem that reuses the same repository, scheduler infrastructure, verified-webhook layer, and Operations Center.

## Current Status — V23

The runnable foundation now includes:

- vanilla HTML/CSS/JavaScript dashboard, Accounts, Media Library, composer, Draft workspace, Operations Center, WhatsApp operator surface, Queue, Calendar, Analytics, and an Admin-only Users surface;
- provider-neutral OAuth/account infrastructure with encrypted credentials;
- Instagram professional-account OAuth plus image/Reel publishing/status and analytics adapters;
- Facebook Pages OAuth plus deterministic Page selection, text/image/Reel publishing, and analytics adapter;
- Threads OAuth plus text/image/video publishing/status and analytics adapters;
- TikTok Login Kit OAuth, Creator Info, privacy/interaction-aware Direct Post for one photo/video, rotating refresh tokens, async status polling, and analytics adapter;
- direct JPEG/PNG/WebP/MP4 upload, local or S3-compatible storage, Media Library reuse/deletion/quota, and optional orphan cleanup;
- one persistent scheduler with stale-lock recovery, retry/backoff, status checks, token refresh, idempotency guards, and execution-domain filtering;
- JSON development persistence and PostgreSQL production persistence with transaction-safe job claims and checksum-verified migrations;
- atomic social post/media/publication/job schedule creation for JSON and PostgreSQL;
- atomic WhatsApp campaign/recipient/job schedule creation for JSON and PostgreSQL;
- opt-in persisted multi-user authentication with Viewer, Editor, Manager, and Admin roles;
- salted `scrypt` password hashing and opaque revocable HttpOnly application sessions whose raw tokens are never persisted;
- centralized server-side RBAC, same-origin mutation protection, atomic last-active-Admin protection, and process-local rate limiting;
- Admin user creation, role/status management, password rotation, session revocation, and immediate disabled-user invalidation;
- real headless-Chrome CI coverage for authentication/RBAC/Admin-user flows plus V19 draft/reusable-content/override/compatibility/preview workflows, local media upload/reuse/delete, account-bound Facebook scheduling, and Queue/Calendar bulk lifecycle actions;
- publication-attempt history, verified Meta/TikTok/WhatsApp webhooks, provider health, and active rate-limit visibility;
- WhatsApp Business contacts with explicit consent/eligibility, approved-template synchronization, scheduled campaigns, recipient/message state, and duplicate-send-safe execution;
- month/week/day social publishing calendar with Previous/Today/Next navigation;
- drag-to-reschedule with browser-local time-of-day preservation;
- operational Queue filters by platform/account/state;
- state-safe edit, reschedule, cancel, duplicate, retry, bulk cancel, and bulk reschedule actions;
- server-persisted drafts with delayed autosave, recovery, optimistic revisions, and stale-write conflict protection;
- reusable caption templates, hashtag collections, and saved destination groups;
- per-platform caption/media overrides persisted on publications and resolved by provider adapters at execution time;
- live effective-content previews, platform character counts, and server-side pre-publish compatibility reports;
- append-only social metric snapshots with latest-snapshot report semantics;
- normalized Analytics KPIs for views/reach/likes/comments/shares/saves when providers support them;
- date/platform/account Analytics filtering, daily series, per-post performance, freshness visibility, and bounded/manual refresh;
- protected Operations, Analytics, WhatsApp, post-lifecycle, composer-workflow, and user-management APIs plus browser UI;
- GitHub Actions coverage against PostgreSQL 17 plus a separate bounded real-browser Chrome gate.

Safe execution defaults remain:

```text
SCHEDULER_ENABLED=false
ALLOW_REAL_PUBLISH=false
ALLOW_REAL_WHATSAPP=false
```

The scheduler starts only when `SCHEDULER_ENABLED=true` and at least one execution gate is explicitly enabled. Social jobs and WhatsApp campaign jobs are claimed independently, so enabling WhatsApp cannot trigger social publishing and vice versa. Draft/resource/compatibility writes, Analytics refreshes, and user-management actions never enqueue scheduler work.

## Supported Channels

| Channel | Current state |
| --- | --- |
| Instagram | account management + OAuth + long-lived token refresh + image/Reel publish/status + analytics adapter + publication content overrides |
| Facebook Pages | account management + OAuth + Page-token resolution + text/image/Reel publish/status + analytics adapter + publication content overrides |
| Threads | account management + OAuth + long-lived token refresh + text/image/video publish/status + analytics adapter + publication content overrides |
| TikTok | account management + OAuth + rotating token refresh + Creator Info + privacy-aware photo/video Direct Post + status + analytics adapter + publication content overrides |
| WhatsApp Business | contacts + consent + approved templates + scheduled campaigns + recipient/message states + signed delivery webhooks |

## Architecture

```text
Browser
  |
  +--> Role-based application session
  +--> Admin Users & Roles
  +--> Accounts / OAuth
  +--> Media Library
  +--> Social Composer
  |     +--> Drafts / autosave
  |     +--> reusable templates / hashtags / destinations
  |     +--> per-platform overrides / previews / compatibility
  +--> Queue / Calendar lifecycle controls
  +--> Analytics reports / bounded refresh
  +--> WhatsApp Contacts / Templates / Campaigns
  +--> Operations Center
  |
  v
Node HTTP application
  |
  +--> Authentication + centralized RBAC boundary
  +--> User Management Service
  +--> Composer Workflow Service
  +--> Compatibility Service
  +--> Social Post Service
  +--> Post Lifecycle Service
  +--> Analytics Service
  +--> WhatsApp Campaign Services
  +--> Operations API
  +--> Verified Webhook Routes
  |
  v
Repository (JSON | PostgreSQL)
  |
  +--> app users / hashed sessions
  +--> composer_drafts / reusable composer resources
  +--> atomic social scheduling graph
  +--> atomic lifecycle mutation units
  +--> posts / media / publications (+ content overrides)
  +--> publication_metric_snapshots
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

Analytics provider adapters are separate from publishing execution. Analytics refresh reads already-published provider content and appends snapshots; it does not publish content or create/claim scheduler jobs.

Provider-specific behavior remains inside provider/messaging modules. SQL stays under `server/db/`. Drafts, reusable resources, analytics snapshots, users, and application sessions are management/security data and do not form a second scheduler. Calendar and Queue remain operator views over the existing social records.

## Technology

- **Frontend:** HTML, CSS, vanilla JavaScript ES modules
- **Backend:** Node.js >= 20, built-in HTTP server
- **Database client:** `pg`
- **Development persistence:** JSON file
- **Production persistence:** PostgreSQL
- **Media:** local filesystem or S3-compatible object storage
- **Passwords:** salted Node.js `scrypt`
- **Sessions:** opaque random HttpOnly cookie token; persistence stores only a derived token hash
- **Browser E2E:** Node.js 22 built-ins + installed headless Chrome over the Chrome DevTools Protocol
- **CI:** GitHub Actions + PostgreSQL 17 + bounded Chrome E2E gate

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

Run deterministic tests:

```bash
npm test
```

Run real-browser tests when Chrome/Chromium is installed:

```bash
npm run test:e2e
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

Srocial does not automatically load `.env` files. Supply values through the shell, process manager, container, or deployment environment. Provider credentials, bootstrap administrator credentials, encryption keys, app/session secrets, database credentials, object-storage credentials, and WhatsApp access tokens are server-only.

## Browser E2E Critical Content Workflow — V23

V23 extends the V22 real-browser foundation into the critical social-content workflow. The same isolated Node.js + headless-Chrome/CDP harness now verifies server-persisted draft autosave/recovery/stale-revision conflict behavior, reusable caption/hashtag/destination resources, Facebook caption/media overrides, compatibility/previews, local file upload and Media Library reuse/deletion, account-bound text-only Facebook scheduling, and Queue/Calendar bulk reschedule/cancel behavior.

Browser fixtures may seed deterministic connected-account metadata, but they contain no live provider token and make no provider HTTP request. The scheduler and both external execution gates remain disabled.

V23 browser testing also exposed and fixed two product-state defects: Queue bulk reschedule could leave a visibly checked row while its internal selection set was empty, and Media Library deletion success feedback was overwritten by the immediate refresh. Both behaviors are now regression-covered.

`SR-P001` remains `PARTIAL`. Remaining real-browser work includes Accounts/OAuth management, WhatsApp, Operations, Analytics, Calendar drag/drop, and additional edit/duplicate/retry/filter lifecycle paths. Live provider verification remains separately tracked.

See `docs/V23_BROWSER_CONTENT_E2E.md`.

## Browser E2E Foundation — V22

V22 added a separate real-browser CI gate without adding Playwright, Puppeteer, Selenium, or another runtime dependency. Node.js launches the real Srocial server against isolated temporary JSON/media storage and controls installed headless Chrome directly through CDP/WebSocket.

The E2E runtime enables application authentication but explicitly keeps every execution gate off. It uses fixture-only credentials, adds no production test endpoint, and cannot publish social posts or send WhatsApp messages.

V22 coverage includes unauthenticated redirect, Admin login/logout, role-appropriate Users visibility, server-side Viewer/Editor/Manager/Admin permission boundaries, Admin user creation/update, role changes, password rotation, disabled-user login denial, and explicit session revocation.

See `docs/V22_BROWSER_E2E.md`.

## Application Authentication & RBAC — V21

Authentication remains opt-in for local-development compatibility:

```text
APP_AUTH_ENABLED=false
```

For network/public deployments, enable it and use HTTPS. When authentication is enabled and the persistent user store is empty, the configured `ADMIN_USERNAME` / `ADMIN_PASSWORD` is used to bootstrap the first Admin. Once a persistent user exists, those environment credentials are not a parallel login path: login is repository-backed.

Every authenticated request resolves the persisted session and current user. Disabling a user therefore invalidates access immediately; role changes affect subsequent requests; password changes and explicit session revocation revoke existing sessions. The raw session token exists only in the browser cookie; persistence stores its derived hash.

The source-defined access levels are implemented as:

| Role | Access boundary |
| --- | --- |
| Viewer | Authenticated read-only application access. |
| Editor | Viewer + social/composer content mutations and media upload. |
| Manager | Editor + provider account/OAuth administration, media deletion, WhatsApp operations, and Analytics refresh. |
| Admin | Manager + application-user administration and fail-closed access to otherwise unclassified protected mutations. |

The server-side authorization boundary is authoritative. Hidden browser controls are only a usability layer. Unknown protected mutations fail closed to Admin rather than inheriting a weaker role accidentally.

Administrators can create users, change display names/roles/status, rotate passwords, and revoke sessions. Srocial refuses self-demotion/self-disable for the current Admin and protects the last active Admin atomically. JSON evaluates the invariant inside its serialized mutation queue; PostgreSQL uses a transaction advisory lock plus `FOR UPDATE` so concurrent Admin demotions cannot both remove the final administrator.

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

Webhook POST routes are public at the application-session layer but accept state-changing provider payloads only after signature verification.

### Protected management surface

```text
GET    /api/auth/session
POST   /api/auth/logout
GET    /api/dashboard
GET    /api/operations

GET    /api/users
POST   /api/users
PATCH  /api/users/:id
POST   /api/users/:id/password
POST   /api/users/:id/sessions/revoke

GET    /api/analytics?platform=&accountId=&from=&until=
POST   /api/analytics/refresh
POST   /api/analytics/publications/:id/refresh

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

Authenticated mutations are same-origin checked. Login/API rate limits are process-local and intentionally do not trust forwarded IP headers. Multi-instance/shared limiting and trusted-proxy attribution remain tracked under `SR-P006`.

See `docs/V21_USERS_ROLES.md`.

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
        { "type": "image", "url": "https://cdn.example.com/instagram.jpg" }
      ]
    }
  ],
  "media": [
    { "type": "image", "url": "https://cdn.example.com/post.jpg" }
  ],
  "scheduledAt": "2026-09-14T15:00:00.000Z"
}
```

Every explicit account must exist, be `CONNECTED`, and match the selected platform. Provider-specific choices and content overrides are stored on the publication rather than the generic post record.

A `null` content override inherits the master post content. An explicit empty media override (`[]`) means no media for that publication and remains distinct from inheritance. Final schedule creation validates the effective caption/media for every destination.

Social scheduling persists the post, master media, publications, and executable scheduler jobs as one all-or-nothing repository operation. PostgreSQL uses a database transaction; the JSON backend persists an isolated candidate snapshot before publishing it as active state.

Legacy platform-only scheduling remains available for backward compatibility and is explicitly tracked under `SR-P007` because it can create unbound publications.

## Analytics & Reporting — V20

V20 implements source roadmap item 98: basic social analytics without a separate warehouse.

Analytics stores append-only publication metric snapshots in JSON/PostgreSQL and calculates current reports from the **latest snapshot per publication**, preventing repeated cumulative provider counters from being double-counted.

Normalized metrics are:

```text
views
reach
likes
comments
shares
saves
```

Provider-specific safe counters can be retained in `extraMetrics`. Unsupported or unavailable metrics remain `null`; Srocial does not invent zeroes.

The Analytics UI/API supports date, platform, and account slices; KPI totals; daily series; per-publication rows; freshness timestamps; one-publication refresh; and bounded recent-publication refresh. Bulk refresh is sequential and limited to 25 eligible publications per request.

Analytics refresh requires an already-published, account-bound publication with a provider external ID. Provider failures create no metric snapshot. Refresh does not create scheduler jobs, republish content, retry publication execution, or mutate publication lifecycle state.

New OAuth connections request analytics permissions where required: Instagram `instagram_business_manage_insights`, Threads `threads_manage_insights`, and TikTok `video.list`. Existing connections may need reconnecting to obtain these scopes. Real-provider verification remains `SR-P010` in `PROBLEMS.md`.

See `docs/V20_ANALYTICS_REPORTING.md`.

## Drafts + Composer Workflows — V19

V19 implements the source roadmap's draft and richer-composer block.

Drafts persist on the server in JSON/PostgreSQL rather than in browser-only storage. Drafts can contain incomplete composer state and never create scheduler jobs. The browser performs delayed autosave and provides an explicit Save now action.

Draft updates use optimistic revisions. A stale tab/client receives `409 draft_revision_conflict` instead of overwriting a newer revision. After conflict, automatic writes stop until the saved version is reloaded.

The composer can save and reuse caption templates, normalized hashtag collections, and destination groups. Each selected destination can override caption/media behavior. Provider adapters resolve effective content immediately before provider validation/execution.

`POST /api/composer/compatibility` evaluates unscheduled composer state without provider publishing side effects or scheduler writes. The browser renders safe-DOM previews with effective caption/media, character counts, and normalized issues. Final scheduling remains authoritative.

See `docs/V19_DRAFTS_COMPOSER.md`.

## Calendar + Queue Lifecycle — V18

V18 closes the historical source roadmap's unfinished Calendar / Queue / Post Management block.

Calendar supports Month/Week/Day with Previous/Today/Next navigation and drag-to-reschedule while preserving browser-local time-of-day. Queue supports platform/account/state filters, edit, reschedule, cancel, duplicate, safe retry, multi-select, bulk reschedule, and bulk cancel.

Lifecycle mutations fail closed once execution has begun or provider side effects may already exist. PostgreSQL locks/rechecks affected rows inside transactions; JSON preflights its candidate snapshot before mutation.

See `docs/V18_CALENDAR_QUEUE.md`.

## Operations Center — V16

V16 added publication-attempt history, verified Meta/TikTok webhook ingestion, provider health/rate-limit snapshots, TikTok publication/account synchronization, a protected Operations API, and dashboard visibility.

Verified raw webhook bytes are fingerprinted into provider-scoped event IDs so duplicate deliveries are acknowledged without repeating side effects. Raw webhook payloads and provider credentials are not returned by the Operations API.

See `docs/V16_OPERATIONS_CENTER.md`.

## WhatsApp Business — V17

V17 adds a separate messaging subsystem rather than pretending WhatsApp is a social-post destination.

Contacts use E.164 numbers and explicit `UNKNOWN`, `OPTED_IN`, or `OPTED_OUT` consent. Campaign creation requires approved templates and opted-in recipients. Campaign, recipients, and scheduler job are created atomically.

Message intent is stored before provider calls. Explicit rate limits may retry; ambiguous network/crash delivery does not blindly resend and is terminalized as `DELIVERY_UNCERTAIN`.

WhatsApp GET/POST webhook routes verify challenge/signature and apply monotonic sent/delivered/read/failure state with duplicate-delivery protection.

See `docs/V17_WHATSAPP_BUSINESS.md`.

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
008_analytics.sql
009_users_roles.sql
```

Migration 007 adds persisted V19 draft/reusable-resource records and publication caption/media override fields. Migration 008 adds append-only V20 publication metric snapshots and provider/account/publication capture indexes. Migration 009 adds persisted V21 users and revocable application sessions.

## Data Model

Core runtime records include:

```text
app_users
app_user_sessions
accounts
posts
media
publications
publication_metric_snapshots
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
timeout --signal=TERM --kill-after=5s 75s npm run test:e2e
```

V23 implementation exact-head run `34972361989` on commit `98601015a31e1129a2d6e9999d9d1050beb2c531` passed **447/447 Node tests**, applied migrations through `009_users_roles.sql`, passed JavaScript syntax, and passed all **6/6 real-Chrome E2E scenarios**. Documentation/tracker promotion is followed by a fresh exact-head release run before PR/merge.

Deterministic coverage includes persisted authentication/session bootstrap and revocation; Viewer/Editor/Manager/Admin authorization; JSON/PostgreSQL user/session parity; concurrent last-active-Admin protection; PostgreSQL persistence/concurrency/migrations; media lifecycle; Instagram/Facebook/Threads/TikTok provider behavior; V16 signature/webhook/provider telemetry; V17 WhatsApp behavior; V18 atomic schedule/lifecycle/calendar/queue behavior; V19 drafts/reusable resources/overrides/compatibility/previews; V20 JSON/PostgreSQL analytics persistence, latest-snapshot aggregation, provider normalization/scopes, protected analytics API behavior, refresh safety/bounds, and Analytics UI wiring.

Real-browser V23 coverage independently exercises login/logout, role-specific UI visibility, authoritative server `403` boundaries, Admin user lifecycle/session revocation, V19 Composer workflows, local media lifecycle, account-bound text-only scheduling, and Queue/Calendar bulk lifecycle actions. Remaining actual-browser coverage is tracked under `SR-P001` as `PARTIAL`, while real-provider verification stays in the provider-specific `VERIFY` items.

Automated CI still cannot substitute for approved provider applications, live credentials, real sender identities, public HTTPS callbacks, provider analytics permissions/metric availability, or a multi-instance shared rate limiter.

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
|  |  |- analytics.css
|  |  |- composer.css
|  |  |- queue-calendar.css
|  |  `- users.css
|  `- js/
|     |- api/
|     |  |- analytics-api.js
|     |  |- composer-workflows-api.js
|     |  `- users-api.js
|     |- components/
|     |  |- calendar.js
|     |  `- platform-preview.js
|     `- pages/
|        |- analytics.js
|        |- composer.js
|        |- composer-workflows.js
|        |- queue-calendar.js
|        `- users.js
|- server/
|  |- analytics/
|  |- auth/
|  |- db/
|  |  `- migrations/009_users_roles.sql
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
|  `- e2e/
|     |- auth-rbac.e2e.js
|     |- browser-driver.js
|     |- content-workflow.e2e.js
|     `- srocial-server.js
|- docs/
|  |- V12_MEDIA_STORAGE.md
|  |- V13_INSTAGRAM_TOKEN_REFRESH.md
|  |- V14_META_PROVIDERS.md
|  |- V15_TIKTOK_PROVIDER.md
|  |- V16_OPERATIONS_CENTER.md
|  |- V17_WHATSAPP_BUSINESS.md
|  |- V18_CALENDAR_QUEUE.md
|  |- V19_DRAFTS_COMPOSER.md
|  |- V20_ANALYTICS_REPORTING.md
|  |- V21_USERS_ROLES.md
|  |- V22_BROWSER_E2E.md
|  `- V23_BROWSER_CONTENT_E2E.md
|- .env.example
`- package.json
```

## Development Direction

V21 closed source roadmap item **100 — Users / Roles**. Item 100 is the final major product feature in the supplied source feature list. Source items 91–97 substantially overlap the already-implemented V16 Operations Center; item 98 is V20 Analytics; item 99 is V17 WhatsApp Business. V22 therefore began post-roadmap production-readiness work rather than inventing a source item 101.

V23 extends `SR-P001` across the critical content workflow and keeps the item `PARTIAL` only for operator surfaces not yet covered in the real browser. The next development order is:

1. **V24 — Browser E2E Operator Surfaces (`SR-P001`)** — cover deterministic Accounts connect/reconnect/disconnect UI state, WhatsApp operator workflows with execution disabled, Operations Center, V20 Analytics, Calendar drag/drop, and remaining edit/duplicate/retry/filter lifecycle paths without pretending to verify live providers;
2. **Legacy scheduling cleanup (`SR-P007`)** — decide whether platform-only unbound publication compatibility is still required and migrate/remove it if not;
3. **Distributed/trusted-proxy rate limiting (`SR-P006`)** — add a shared limiter and explicit trusted-proxy client attribution before multi-instance/proxy-fronted production deployment;
4. **Live provider verification (`SR-P002`, `SR-P003`, `SR-P004`, `SR-P010`)** — complete approved-app/provider checks where real credentials and public callbacks are available.

The historical source roadmap's version labels diverged from live implementation order. Live V18 closed Calendar/Queue/Post Management, V19 closed Drafts/Autosave/Templates/Reusable Content/Per-Platform Composer, V20 closed Basic Social Analytics, V21 closed Users/Roles, V22 added the first real-browser production-readiness gate, and V23 extends that gate across the critical social-content workflow.

## Development Rules

All contributors and AI coding agents must read `updaterules.md` and `PROBLEMS.md` before changing the project.

`README.md` defines current capability and architecture. `updaterules.md` defines how Srocial may evolve. `PROBLEMS.md` is the persistent tracker for unresolved implementation or verification gaps.
