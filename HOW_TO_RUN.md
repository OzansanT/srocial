# How to Run Srocial — Beginner Guide

This guide explains how to install Srocial, start safely with JSON/local media, enable authentication, move to PostgreSQL/S3 when required, use Operations diagnostics, create backups, and restore a deployment.

## 1. Requirements

Srocial requires Node.js 20 or newer.

```text
node -v
npm -v
```

Node 20, 22, or newer is suitable.

## 2. Get the repository

Download the repository ZIP from GitHub, or clone it:

```bash
git clone https://github.com/OzansanT/srocial.git
cd srocial
```

Install dependencies:

```bash
npm install
```

## 3. Start in safe local mode

The default development shape is intentionally non-publishing:

```text
DATABASE_DRIVER=json
DATA_FILE=./data/srocial.json
MEDIA_STORAGE_DRIVER=local
MEDIA_UPLOAD_DIR=./data/uploads
APP_AUTH_ENABLED=false
SCHEDULER_ENABLED=false
ALLOW_REAL_PUBLISH=false
ALLOW_REAL_WHATSAPP=false
ALLOW_LEGACY_PLATFORM_SCHEDULING=false
```

Start the application:

```bash
npm start
```

Open:

```text
http://127.0.0.1:3000
```

Keep the scheduler and both real-execution flags disabled while learning, developing, or running deterministic tests.

## 4. Environment variables

Srocial does **not** automatically load a `.env` file. Set values through your shell, process manager, container platform, or deployment service. `.env.example` is the reference list.

Server-only values include:

- database credentials;
- object-storage credentials;
- provider app secrets/tokens;
- WhatsApp access tokens;
- `TOKEN_ENCRYPTION_KEY`;
- administrator bootstrap password;
- `SESSION_SECRET`.

Never put these values in browser JavaScript, committed files, screenshots, or support messages.

## 5. Enable application authentication

For any non-loopback/network/public deployment, enable authentication and HTTPS.

Minimum bootstrap settings:

```text
APP_AUTH_ENABLED=true
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<at-least-12-characters>
SESSION_SECRET=<at-least-32-random-characters>
PUBLIC_BASE_URL=https://your-srocial-host.example
```

### PowerShell

```powershell
$env:APP_AUTH_ENABLED="true"
$env:ADMIN_USERNAME="admin"
$env:ADMIN_PASSWORD="REPLACE-WITH-YOUR-LONG-PRIVATE-PASSWORD"
$env:SESSION_SECRET="REPLACE-WITH-A-RANDOM-SECRET-AT-LEAST-32-CHARACTERS"
$env:PUBLIC_BASE_URL="https://srocial.example.com"
npm start
```

### Command Prompt

```bat
set APP_AUTH_ENABLED=true
set ADMIN_USERNAME=admin
set ADMIN_PASSWORD=REPLACE-WITH-YOUR-LONG-PRIVATE-PASSWORD
set SESSION_SECRET=REPLACE-WITH-A-RANDOM-SECRET-AT-LEAST-32-CHARACTERS
set PUBLIC_BASE_URL=https://srocial.example.com
npm start
```

### macOS/Linux

```bash
export APP_AUTH_ENABLED="true"
export ADMIN_USERNAME="admin"
export ADMIN_PASSWORD="REPLACE-WITH-YOUR-LONG-PRIVATE-PASSWORD"
export SESSION_SECRET="REPLACE-WITH-A-RANDOM-SECRET-AT-LEAST-32-CHARACTERS"
export PUBLIC_BASE_URL="https://srocial.example.com"
npm start
```

When the persistent user store is empty, these credentials bootstrap the first Admin. After persistent users exist, repository-backed login is authoritative.

The browser receives an opaque HttpOnly session token; persistence stores only a derived token hash. Disabling a user, changing a password, or revoking sessions invalidates affected access.

## 6. Public and protected routes

When authentication is enabled, management surfaces are protected. Important public exceptions are limited to infrastructure/provider needs:

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

Webhook POST routes remain public at the session layer because providers must reach them, but state-changing provider payloads are accepted only after signature verification.

`/api/operations`, Analytics, Accounts, Queue/Calendar lifecycle operations, WhatsApp management, Composer resources, and user administration remain protected.

## 7. PostgreSQL production backend

Set:

```text
DATABASE_DRIVER=postgres
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DATABASE
```

Apply migrations **before** normal startup:

```bash
npm run db:migrate
npm start
```

`npm start` does not run migrations automatically.

Migrations are ordered, checksum-recorded, transaction-protected, and advisory-lock guarded. Do not edit a historical migration after it has been applied. Current migrations run through `010_rate_limit_buckets.sql`.

## 8. Trusted reverse proxies and rate limits

Default request-limit settings are documented in `.env.example`.

`TRUSTED_PROXY_IPS` is an exact comma-separated IPv4/IPv6 allowlist. Leave it empty unless Srocial is directly connected to a reverse proxy you control.

With the setting empty, Srocial ignores `X-Forwarded-For` and uses the direct socket peer. When the direct peer is explicitly trusted, Srocial walks the forwarding chain right-to-left and chooses the nearest untrusted address. Malformed forwarding data falls back to the direct peer.

PostgreSQL deployments share login/API fixed-window buckets between application instances.

See `docs/V26_DISTRIBUTED_RATE_LIMITING.md`.

## 9. Local media storage

Default:

```text
MEDIA_STORAGE_DRIVER=local
MEDIA_UPLOAD_DIR=./data/uploads
MEDIA_UPLOAD_MAX_BYTES=52428800
MEDIA_UPLOAD_TOTAL_MAX_BYTES=5368709120
```

Make sure the application process can create, read, and delete files in the upload directory.

Uploaded media used for provider publishing must be reachable by the provider through the configured public deployment URL.

## 10. S3-compatible media storage

Select S3-compatible storage with:

```text
MEDIA_STORAGE_DRIVER=s3
MEDIA_S3_ENDPOINT=https://your-object-storage.example
MEDIA_S3_REGION=auto
MEDIA_S3_BUCKET=your-bucket
MEDIA_S3_ACCESS_KEY_ID=<private-access-key>
MEDIA_S3_SECRET_ACCESS_KEY=<private-secret-key>
MEDIA_S3_PREFIX=media/
MEDIA_PUBLIC_BASE_URL=https://your-public-media-host.example
```

Do not expose object-storage credentials to the browser.

Srocial's V29 storage health probe validates writeability using a reserved tiny probe object followed by deletion. The protected Operations page reports only normalized health/error codes, not endpoint/bucket/credential values or raw storage errors.

## 11. Connect social providers

Configure the relevant provider app credentials from `.env.example`, start Srocial, then use **Accounts** to connect Instagram, Facebook Pages, Threads, or TikTok.

Use a real HTTPS `PUBLIC_BASE_URL` for provider callback flows. Provider-specific app review, scopes, redirect URLs, verified domains, and publishing eligibility are controlled by the provider and cannot be created by Srocial itself.

Instagram, Threads, and TikTok support account-bound refresh jobs. TikTok refresh tokens may rotate.

Do not enable real publishing until OAuth/account state and provider prerequisites are correct.

## 12. Schedule social content

Normal scheduling uses explicit account-bound destinations. Each selected account must exist, be `CONNECTED`, and match its platform.

The default-off compatibility setting:

```text
ALLOW_LEGACY_PLATFORM_SCHEDULING=false
```

prevents new platform-only jobs from being created without an account binding.

The Composer supports drafts, autosave, reusable caption/hashtag/destination resources, per-platform overrides, compatibility checks, and previews. Queue/Calendar provide lifecycle controls after scheduling.

## 13. Enable the scheduler deliberately

The scheduler starts only when both conditions are satisfied:

1. `SCHEDULER_ENABLED=true`; and
2. at least one real-execution gate is enabled.

Social publishing:

```text
SCHEDULER_ENABLED=true
ALLOW_REAL_PUBLISH=true
ALLOW_REAL_WHATSAPP=false
```

WhatsApp execution only:

```text
SCHEDULER_ENABLED=true
ALLOW_REAL_PUBLISH=false
ALLOW_REAL_WHATSAPP=true
```

Enabling WhatsApp does not authorize social publishing, and enabling social publishing does not authorize WhatsApp sends.

## 14. Use Operations health and diagnostics

Open **Operations** while authenticated.

V29 shows:

- **Database** — normalized repository connectivity/backend health;
- **Storage** — local/S3 accessibility and writeability;
- **Scheduler** — configured/running/stopped/in-flight state plus last tick success/failure telemetry;
- **Provider Health** — existing provider health/rate-limit state;
- **Environment Diagnostics** — configuration errors/warnings using setting names only;
- existing failed/retrying jobs, publication attempts, and verified webhook activity.

A failed storage/database/scheduler probe should degrade only that card; it should not make the full Operations response disappear.

Environment diagnostics never return environment values or secrets. They can identify, for example, a missing `DATABASE_URL`, incomplete S3/provider/WhatsApp configuration, scheduler/execution-gate mismatch, or unsafe public HTTP/auth combinations.

The public `/api/health` endpoint remains intentionally minimal; use protected Operations for detailed diagnostics.

See `docs/V29_OPERATIONAL_HEALTH.md`.

## 15. Create a backup

V28 provides a maintenance-only backup command:

```bash
npm run backup -- --output ./backups/srocial-2026-09-16
```

The command uses the currently configured database and media drivers. It supports:

- JSON + local media;
- JSON + S3 media;
- PostgreSQL + local media;
- PostgreSQL + S3 media.

The backup directory contains a versioned secret-free manifest, a logical database snapshot, media files, and SHA-256 integrity metadata. Environment secrets are not copied into the manifest.

Backups themselves still contain application data and media. Protect the backup directory with appropriate filesystem/object-storage permissions and encryption at rest where required.

## 16. Restore a backup

For disaster recovery or deliberate environment replacement:

1. stop every Srocial application instance using the target database/media store;
2. configure the target environment;
3. for a new PostgreSQL target, run migrations first;
4. restore;
5. start Srocial;
6. verify health/auth/media/Queue/Calendar/account state;
7. only then re-enable real execution gates.

Empty target:

```bash
npm run restore -- --input ./backups/srocial-2026-09-16
```

Intentional destructive replacement:

```bash
npm run restore -- --input ./backups/srocial-2026-09-16 --force
```

`--force` replaces existing application state. It does **not** merge two independent Srocial installations.

Restore validates format/version, database checksum, media file set/sizes/checksums, backend compatibility, and PostgreSQL migration compatibility before mutation.

See `docs/V28_BACKUP_RESTORE.md`.

## 17. Run automated verification

Node tests:

```bash
npm test
```

Real-browser tests require Chrome/Chromium:

```bash
npm run test:e2e
```

The GitHub Actions pipeline also checks PostgreSQL migrations and JavaScript syntax. The Chrome/CDP startup guard currently uses a 30-second default budget with a validated override for unusually slow runners.

Automated tests do not replace real provider verification. TikTok publishing, live webhook delivery, WhatsApp Cloud API sending, and provider analytics permissions/metric behavior remain tracked in `PROBLEMS.md` until real credentials/prerequisites are available.

## 18. Troubleshooting order

When Srocial does not behave as expected:

1. keep real execution gates disabled;
2. open protected **Operations** and check Environment Diagnostics;
3. check Database and Storage health;
4. check Scheduler state;
5. check Provider Health and failed/retrying jobs;
6. confirm `PUBLIC_BASE_URL`, HTTPS, OAuth callback configuration, and provider prerequisites;
7. check server logs for the normalized error code;
8. run `npm test` before changing production settings.

Do not paste secrets into issue reports. Report the diagnostic code, setting **name**, provider error code, and relevant timestamp instead.

## 19. Read the detailed milestone docs

Important references:

- `docs/V12_MEDIA_STORAGE.md`
- `docs/V13_INSTAGRAM_TOKEN_REFRESH.md`
- `docs/V14_META_PROVIDERS.md`
- `docs/V15_TIKTOK_PROVIDER.md`
- `docs/V16_OPERATIONS_CENTER.md`
- `docs/V17_WHATSAPP_BUSINESS.md`
- `docs/V18_CALENDAR_QUEUE.md`
- `docs/V19_DRAFTS_COMPOSER.md`
- `docs/V20_ANALYTICS_REPORTING.md`
- `docs/V21_USERS_ROLES.md`
- `docs/V22_BROWSER_E2E.md`
- `docs/V23_BROWSER_CONTENT_E2E.md`
- `docs/V24_BROWSER_OPERATOR_E2E.md`
- `docs/V25_ACCOUNT_BOUND_SCHEDULING.md`
- `docs/V26_DISTRIBUTED_RATE_LIMITING.md`
- `docs/V28_BACKUP_RESTORE.md`
- `docs/V29_OPERATIONAL_HEALTH.md`

Before development work, also read `updaterules.md` and `PROBLEMS.md`.
