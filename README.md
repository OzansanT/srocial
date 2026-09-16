# Srocial

Srocial is a self-hosted social-media publishing, scheduling, monitoring, analytics, lifecycle-management, access-control, operations, backup/recovery, and business-messaging dashboard.

Instagram, Facebook Pages, Threads, and TikTok share the social publishing and analytics runtime. WhatsApp Business is intentionally a separate contacts/templates/campaign subsystem that reuses the same repository, scheduler infrastructure, verified-webhook layer, and Operations Center.

## Current Status — V31

The runnable foundation includes:

- vanilla HTML/CSS/JavaScript dashboard with Accounts, Media Library, Composer, Drafts, Operations, WhatsApp, Queue, Calendar, Analytics, and Admin Users;
- provider-neutral OAuth/account infrastructure with encrypted credentials plus token-expiration warnings and reconnect-needed account health;
- Instagram professional-account OAuth, token refresh, image/Reel plus ordered 2–10-item carousel publishing/status, and analytics;
- Facebook Pages OAuth with deterministic Page selection, text/image/Reel publishing, and analytics;
- Threads OAuth, token refresh, text/image/video publishing/status, and analytics;
- TikTok Login Kit OAuth, Creator Info, privacy/interaction-aware Direct Post, rotating refresh tokens, async status polling, and analytics;
- direct JPEG/PNG/WebP/MP4 upload using local or S3-compatible storage, Media Library reuse/deletion/quota, and optional orphan cleanup;
- ordered 1–10-item Composer media with append-from-upload/Media-Library behavior and full draft/state restoration;
- one persistent scheduler with stale-lock recovery, retry/backoff, status checks, token refresh, idempotency guards, and execution-domain filtering;
- JSON development persistence and PostgreSQL production persistence with transaction-safe job claims and checksum-verified migrations;
- atomic social and WhatsApp scheduling graphs;
- persisted multi-user authentication with Viewer, Editor, Manager, and Admin roles;
- salted `scrypt` password hashing and opaque revocable HttpOnly sessions whose raw tokens are never persisted;
- centralized RBAC, same-origin mutation protection, last-active-Admin protection, trusted-proxy-aware client attribution, and shared PostgreSQL login/API rate limiting;
- publication-attempt history, verified Meta/TikTok/WhatsApp webhooks, provider health, and rate-limit visibility;
- WhatsApp Business contacts, consent/eligibility, approved templates, scheduled campaigns, recipient/message state, and duplicate-send-safe execution;
- month/week/day Calendar, Queue filtering, drag/reschedule, edit, cancel, duplicate, retry, and bulk lifecycle controls;
- server-persisted drafts with autosave, optimistic revisions, reusable caption/hashtag/destination resources, per-platform overrides, previews, and compatibility checks;
- append-only social metric snapshots, normalized Analytics KPIs, filtering, per-post reporting, freshness, and bounded/manual refresh;
- account-bound scheduling as the default contract with legacy platform-only scheduling behind a default-off compatibility gate;
- portable JSON/PostgreSQL + local/S3 backup and restore commands with checksum validation and fail-closed destructive restore rules;
- protected operational diagnostics for database, storage writeability, scheduler runtime state, provider state, and secret-safe environment/configuration issues;
- GitHub Actions coverage against PostgreSQL 17 plus a bounded real-Chrome/CDP E2E gate.

Safe execution defaults remain:

```text
SCHEDULER_ENABLED=false
ALLOW_REAL_PUBLISH=false
ALLOW_REAL_WHATSAPP=false
```

The scheduler starts only when `SCHEDULER_ENABLED=true` and at least one execution gate is explicitly enabled. Social jobs and WhatsApp jobs are claimed independently, so enabling WhatsApp cannot trigger social publishing and vice versa.

## Supported Channels

| Channel | Current state |
| --- | --- |
| Instagram | OAuth + account management + long-lived token refresh + account health + image/Reel + ordered carousel publish/status + analytics + content overrides |
| Facebook Pages | OAuth + Page-token resolution + account health + text/image/Reel publish/status + analytics + content overrides |
| Threads | OAuth + long-lived token refresh + account health + text/image/video publish/status + analytics + content overrides |
| TikTok | OAuth + rotating token refresh + account health + Creator Info + privacy-aware photo/video Direct Post + status + analytics + content overrides |
| WhatsApp Business | contacts + consent + approved templates + scheduled campaigns + recipient/message state + signed delivery webhooks |

## Architecture

```text
Browser
  |
  +--> Role-based application session / Admin Users
  +--> Accounts / OAuth
  +--> Media Library / Composer / Drafts
  +--> Queue / Calendar
  +--> Analytics
  +--> WhatsApp
  +--> Operations Center
  |
  v
Node HTTP application
  |
  +--> Authentication + centralized RBAC
  +--> Trusted-proxy client attribution + rate limiting
  +--> Social / lifecycle / composer services
  +--> Analytics service
  +--> WhatsApp services
  +--> Operations diagnostics
  +--> Verified webhooks
  |
  v
Repository (JSON | PostgreSQL)
  |
  +--> users / sessions / rate limits
  +--> accounts / posts / media / publications
  +--> metrics / drafts / reusable composer resources
  +--> scheduler jobs / publication attempts
  +--> webhook events / provider status
  `--> WhatsApp contacts/templates/campaigns/messages
              |
              v
          Scheduler Loop
         /              \
 Social execution   WhatsApp execution
      |                    |
 Provider adapters   WhatsApp adapter
```

Provider-specific behavior remains inside provider/messaging modules. Analytics refresh reads already-published content and appends snapshots; it does not publish or enqueue scheduler jobs. Backup/restore is a maintenance-only path and does not start the HTTP server or scheduler.

## Technology

- **Frontend:** HTML, CSS, vanilla JavaScript ES modules
- **Backend:** Node.js >= 20, built-in HTTP server
- **Database:** JSON for development; PostgreSQL via `pg` for production
- **Media:** local filesystem or S3-compatible object storage
- **Passwords:** salted Node.js `scrypt`
- **Sessions:** opaque random HttpOnly cookie token; persistence stores only a derived hash
- **Browser E2E:** installed headless Chrome controlled through CDP
- **CI:** GitHub Actions + PostgreSQL 17 + Chrome E2E

## Install and Run

Requirements:

```text
Node.js >= 20
```

Install and start:

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
npm run test:e2e
```

For PostgreSQL, apply migrations before startup:

```bash
npm run db:migrate
```

Normal `npm start` never applies migrations automatically. See `HOW_TO_RUN.md` for the beginner-oriented deployment guide.

## Safe Environment Defaults

Important settings are documented in `.env.example`.

```text
SCHEDULER_ENABLED=false
ALLOW_REAL_PUBLISH=false
ALLOW_REAL_WHATSAPP=false
ALLOW_LEGACY_PLATFORM_SCHEDULING=false
PUBLIC_BASE_URL=http://127.0.0.1:3000

APP_AUTH_ENABLED=false
ADMIN_USERNAME=admin
ADMIN_PASSWORD=
SESSION_SECRET=<at-least-32-random-characters>
TRUSTED_PROXY_IPS=

DATABASE_DRIVER=json
DATABASE_URL=postgres://...
TOKEN_ENCRYPTION_KEY=<long-random-secret>

MEDIA_STORAGE_DRIVER=local
MEDIA_UPLOAD_DIR=./data/uploads
MEDIA_S3_ENDPOINT=
MEDIA_S3_BUCKET=
MEDIA_S3_ACCESS_KEY_ID=
MEDIA_S3_SECRET_ACCESS_KEY=
MEDIA_PUBLIC_BASE_URL=
```

Srocial does not automatically load `.env` files. Supply values through the shell, process manager, container, or deployment environment. Provider credentials, bootstrap administrator credentials, encryption keys, session secrets, database credentials, object-storage credentials, and WhatsApp access tokens are server-only.

`TRUSTED_PROXY_IPS` is an exact comma-separated IPv4/IPv6 allowlist. Leave it empty unless Srocial is directly connected to a reverse proxy you control. See `docs/V26_DISTRIBUTED_RATE_LIMITING.md`.

## Application Authentication & RBAC — V21

Authentication remains opt-in for loopback development:

```text
APP_AUTH_ENABLED=false
```

For network/public deployments, enable it and use HTTPS. When authentication is enabled and the user store is empty, `ADMIN_USERNAME` / `ADMIN_PASSWORD` bootstrap the first Admin. After persistent users exist, repository-backed login is authoritative.

| Role | Access boundary |
| --- | --- |
| Viewer | Authenticated read-only application access |
| Editor | Viewer + social/composer mutations and media upload |
| Manager | Editor + provider/OAuth administration, media deletion, WhatsApp operations, Analytics refresh |
| Admin | Manager + user administration and fail-closed unclassified protected mutations |

The server-side authorization boundary is authoritative. Disabling a user invalidates access immediately; role changes apply to subsequent requests; password changes and explicit session revocation revoke sessions. The raw session token is never persisted.

Public infrastructure/provider routes are narrowly scoped to health, login, OAuth callbacks, provider-readable media, and verified webhook endpoints. Management APIs including `/api/operations` remain protected.

See `docs/V21_USERS_ROLES.md`.

## Social Accounts and Scheduling

The Accounts UI supports Instagram, Facebook, Threads, and TikTok connect/reconnect/disconnect workflows. Instagram, Threads, and TikTok refresh credentials through account-bound `TOKEN_REFRESH` jobs; TikTok refresh tokens may rotate.

V30 adds an operator-facing health projection without creating another refresh system. Connected accounts inside the existing 30-day refresh horizon are shown as `EXPIRING` with an exact whole-day warning such as `Token expires in 8 days.` Accounts that are disconnected, expired, permission-revoked, in an account error state, or still recorded as connected after their token expiry are shown as `RECONNECT_NEEDED` with a safe reason and the existing provider `Reconnect` action. TikTok authorization removal now preserves the safe `PERMISSION_REVOKED` diagnostic so the UI can distinguish it from an ordinary disconnect.

V31 adds ordered Instagram carousel scheduling. The master Composer now accepts up to 10 ordered image/video rows; uploads and Media Library selections append to the list, drafts restore the complete order, and Instagram accepts 1–10 items while Facebook, Threads, and TikTok retain their existing single-item limits. For Instagram, one item follows the existing image/Reel path and 2–10 items follow the carousel child-to-parent workflow.

Preferred scheduling request:

```json
{
  "caption": "Scheduled content",
  "destinations": [
    {
      "platform": "instagram",
      "accountId": "connected-account-id",
      "captionOverride": "Instagram-specific caption"
    }
  ],
  "media": [
    { "type": "image", "url": "https://cdn.example.com/carousel-1.jpg" },
    { "type": "image", "url": "https://cdn.example.com/carousel-2.jpg" }
  ],
  "scheduledAt": "2026-09-16T15:00:00.000Z"
}
```

Every explicit account must exist, be `CONNECTED`, and match the selected platform. Social scheduling persists the post, master media, publications, and executable jobs as one all-or-nothing repository operation. Legacy platform-only scheduling is rejected unless `ALLOW_LEGACY_PLATFORM_SCHEDULING=true` is explicitly enabled.

See `docs/V25_ACCOUNT_BOUND_SCHEDULING.md`, `docs/V30_ACCOUNT_TOKEN_HEALTH.md`, and `docs/V31_INSTAGRAM_CAROUSEL.md`.

## Instagram Carousel & Multi-Image Composer — V31

V31 closes source roadmap items **#24 Instagram carousel posts** and **#25 Instagram multi-image composer UI**.

- Composer media order is the visible row order and is persisted through scheduling/drafts.
- Instagram supports 1–10 ordered image/video items; 2–10 creates a carousel.
- Carousel child containers are created in order, video children can be status-polled until ready, and the parent container is created/published after all children are ready.
- Resumable provider state is stored in `providerOptions.instagramCarousel` so worker retries/status checks continue the same workflow instead of intentionally recreating completed steps.
- Social publication/status workers persist adapter-returned provider state before later execution steps.
- Automated browser coverage verifies two-item Instagram scheduling and persisted `sortOrder`.

Source items **#26–28**—Instagram image aspect-ratio, video-duration, and file-size validation—remain separate follow-on validation work and are the next source-defined milestone.

Real provider carousel delivery remains `SR-P011` until verified with an approved Instagram Professional account and production public-HTTPS media.

See `docs/V31_INSTAGRAM_CAROUSEL.md`.

## Media Storage

`POST /api/media/uploads` supports JPEG, PNG, WebP, and MP4. Supported types are byte-signature checked rather than trusting MIME declaration alone. Uploaded media must be provider-reachable when used for publishing.

V29 adds read-only operational writeability probes:

- local storage creates and removes a tiny probe file;
- S3-compatible storage performs a reserved probe PUT followed by DELETE;
- paths, endpoint/bucket values, credentials, authorization headers, and raw provider errors are not exposed in the Operations payload.

See `docs/V12_MEDIA_STORAGE.md` and `docs/V29_OPERATIONAL_HEALTH.md`.

## Operations & Diagnostics — V16/V29

V16 added publication-attempt history, verified Meta/TikTok webhook ingestion, provider health/rate-limit snapshots, and the protected Operations Center.

V29 completes source operational-health items **#16–20** by consolidating these checks in that existing protected surface:

- database connectivity/backend health;
- local/S3 media writeability;
- scheduler configured/running/stopped/in-flight state and last tick success/failure telemetry;
- existing provider health/rate-limit state;
- secret-safe environment/configuration diagnostics.

A failing infrastructure probe degrades only its own result; it does not erase the existing Operations summaries. Environment diagnostics emit only static codes/messages and setting names—never setting values. The public `/api/health` route remains intentionally minimal.

See `docs/V16_OPERATIONS_CENTER.md` and `docs/V29_OPERATIONAL_HEALTH.md`.

## Analytics & Reporting — V20

Analytics stores append-only publication metric snapshots and computes reports from the latest snapshot per publication, preventing cumulative provider counters from being double-counted.

Normalized metrics are `views`, `reach`, `likes`, `comments`, `shares`, and `saves`; unsupported metrics remain `null` rather than being invented as zero. Reports support date/platform/account filters, daily series, per-publication rows, freshness, one-publication refresh, and bounded recent refresh.

Real-provider metric permission/response verification remains `SR-P010` in `PROBLEMS.md`.

See `docs/V20_ANALYTICS_REPORTING.md`.

## WhatsApp Business — V17

WhatsApp is a separate messaging subsystem, not a social-post destination. Contacts use explicit consent state; campaign creation requires approved templates and opted-in recipients; campaign/recipient/job creation is atomic; signed webhooks update monotonic message state with duplicate-delivery protection.

Real Cloud API campaign verification remains `SR-P004`.

See `docs/V17_WHATSAPP_BUSINESS.md`.

## Backup & Restore — V28

V28 closes source roadmap items **#14 Backup command** and **#15 Restore command**.

```bash
npm run backup -- --output ./backups/srocial-2026-09-16
npm run restore -- --input ./backups/srocial-2026-09-16
npm run restore -- --input ./backups/srocial-2026-09-16 --force
```

Backups support JSON/PostgreSQL plus local/S3 media and use a versioned secret-free manifest with SHA-256 checksums. Restore validates the complete backup before mutation, verifies backend/migration compatibility, preserves exact media keys, and refuses a non-empty target unless `--force` is explicitly supplied.

`--force` is destructive replacement, not dataset merge. Stop application instances using the target before restore.

See `docs/V28_BACKUP_RESTORE.md`.

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

Migrations are ordered, checksum-recorded, transaction-protected, and advisory-lock guarded. Historical migrations are immutable. Scheduler claims use `FOR UPDATE SKIP LOCKED`; shared PostgreSQL rate limiting serializes per bucket.

Current migrations run through:

```text
010_rate_limit_buckets.sql
```

## Browser E2E Hardening — V22–V31

The real-browser suite launches the real Srocial server against isolated JSON/media state and controls installed headless Chrome through CDP. Browser fixtures keep external execution gates disabled and contain no live provider token.

Coverage includes authentication/RBAC/Admin-user flows, Composer/drafts/reusable resources/overrides/compatibility, media lifecycle including V31 append/remove semantics, account-bound scheduling, ordered two-image Instagram carousel scheduling/persistence, Accounts, WhatsApp, Operations, Analytics, Queue/Calendar lifecycle controls, drag/drop, native Reschedule prompt accept/invalid/dismiss paths, individual cancellation, and V30 permission-revoked reconnect health.

V28 raised the guarded Chrome startup default to **30 seconds** after a real Actions cold-start exceeded the prior 20-second budget; the override remains validated and bounded.

See `docs/V22_BROWSER_E2E.md`, `docs/V23_BROWSER_CONTENT_E2E.md`, `docs/V24_BROWSER_OPERATOR_E2E.md`, and `docs/V31_INSTAGRAM_CAROUSEL.md`.

## Distributed Rate Limiting & Trusted Proxies — V26

With `TRUSTED_PROXY_IPS=` empty, Srocial ignores `X-Forwarded-For` and uses the direct socket peer. When the direct peer is explicitly trusted, the forwarding chain is evaluated right-to-left and the nearest untrusted address becomes client identity. Malformed forwarding data falls back to the direct peer.

PostgreSQL deployments use shared transactional fixed-window buckets so multiple application instances enforce the same login/API allowance.

See `docs/V26_DISTRIBUTED_RATE_LIMITING.md`.

## Verification

CI runs against PostgreSQL 17 and executes:

```bash
npm install --ignore-scripts
npm run db:migrate
npm test
find server client tests -name '*.js' -print0 | xargs -0 -n1 node --check
timeout --signal=TERM --kill-after=5s 75s npm run test:e2e
```

V31 adds deterministic carousel/Composer/compatibility contracts and expands the real Chrome/CDP suite with ordered Instagram carousel scheduling plus Media Library append/remove regression coverage. Exact final-head and merged-main workflow evidence is required before the milestone is considered integrated.

Automated CI cannot substitute for approved provider applications, live provider credentials, real WhatsApp sender identities, public HTTPS callbacks, analytics permissions/metric availability, live Instagram carousel delivery, or an operator's real reverse-proxy/load-balancer topology. Those external prerequisites remain separately tracked.

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
|  `- js/
|     |- api/
|     |- components/
|     `- pages/
|- server/
|  |- analytics/
|  |- auth/
|  |- db/
|  |- http/
|  |- maintenance/
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
|  |- V23_BROWSER_CONTENT_E2E.md
|  |- V24_BROWSER_OPERATOR_E2E.md
|  |- V25_ACCOUNT_BOUND_SCHEDULING.md
|  |- V26_DISTRIBUTED_RATE_LIMITING.md
|  |- V28_BACKUP_RESTORE.md
|  |- V29_OPERATIONAL_HEALTH.md
|  |- V30_ACCOUNT_TOKEN_HEALTH.md
|  `- V31_INSTAGRAM_CAROUSEL.md
|- .env.example
`- package.json
```

## Development Direction

A fresh audit of the supplied source roadmap found production-readiness items after the product UI milestones. The repository therefore no longer treats source item #100 as proof that all source-defined work is exhausted.

Source-aligned post-product work completed so far includes:

1. **V22/V23/V24/V27 — Browser E2E expansion (`SR-P001`)**;
2. **V25 — Account-Bound Scheduling Migration (`SR-P007`)**;
3. **V26 — Distributed/Trusted-Proxy Rate Limiting (`SR-P006`)**;
4. **V28 — Portable Backup & Restore**, closing source **#14–15**;
5. **V29 — Operational Health & Environment Diagnostics**, closing source **#16–20** by reusing existing database/provider health and adding storage, scheduler, and environment diagnostics;
6. **V30 — Account Token Expiration & Reconnect Health**, closing source **#22–23** while reusing the already implemented source **#21** token-refresh subsystem;
7. **V31 — Instagram Carousel & Multi-Image Composer**, closing source **#24–25** with ordered 1–10 Instagram media, resumable carousel provider state, and real-browser Composer scheduling coverage.

The next source-defined development is the bounded Instagram validation milestone **#26 image aspect-ratio validation**, **#27 video duration validation**, and **#28 file-size validation** before scheduling.

The persistent external-verification work remains:

- `SR-P002` — live TikTok developer-app publishing verification;
- `SR-P003` — live provider webhook/public HTTPS delivery verification;
- `SR-P004` — live WhatsApp Business Cloud API campaign verification;
- `SR-P010` — live provider analytics permission/metric verification;
- `SR-P011` — live Instagram carousel delivery/retry verification.

See `PROBLEMS.md` for exact prerequisites and evidence rules.

## Development Rules

All contributors and AI coding agents must read `updaterules.md` and `PROBLEMS.md` before changing the project.

`README.md` defines current capability and architecture. `updaterules.md` defines how Srocial may evolve. `PROBLEMS.md` is the persistent tracker for unresolved implementation or verification gaps. Dedicated milestone documents under `docs/` hold the detailed behavior and verification evidence.