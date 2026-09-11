# How to Run Srocial — Beginner Guide

This guide explains how to install and run Srocial, use the default JSON repository, enable V11 administrator authentication, optionally configure PostgreSQL, connect Instagram, schedule posts, manage uploaded media, and keep real publishing disabled until you intentionally enable it.

## 1. Install Node.js

Srocial requires Node.js 20 or newer. Check your installation:

```text
node -v
npm -v
```

Node 20, 22, or newer is suitable.

## 2. Get Srocial

### Download ZIP

1. Open the `OzansanT/srocial` repository on GitHub.
2. Click **Code** > **Download ZIP**.
3. Extract the ZIP.
4. Open the extracted `srocial` folder in a terminal.

### Git clone

```bash
git clone https://github.com/OzansanT/srocial.git
cd srocial
```

## 3. Install dependencies

Run:

```bash
npm install
```

The PostgreSQL `pg` client is a runtime dependency even when you use the default JSON repository.

## 4. Start in safe local JSON mode

Defaults:

```text
DATABASE_DRIVER=json
DATA_FILE=./data/srocial.json
APP_AUTH_ENABLED=false
ALLOW_REAL_PUBLISH=false
SCHEDULER_ENABLED=false
```

You do not need PostgreSQL or a login for ordinary loopback-only local development.

Start Srocial:

```bash
npm start
```

Open:

```text
http://127.0.0.1:3000
```

Keep both publishing flags false while learning or testing.

## 5. What V11 adds

V11 closes the main application-exposure gap that remained after the PostgreSQL V10 work.

It adds:

- opt-in single-administrator sign-in;
- signed, expiring HttpOnly application-session cookies;
- default-deny protection for the dashboard/static app and management APIs when auth is enabled;
- same-origin checks for authenticated POST/PUT/PATCH/DELETE requests;
- a login-attempt limiter;
- a protected-API request limiter;
- a dedicated login page and dashboard Sign out control;
- public exceptions for health checks, provider OAuth callbacks, and provider-readable media;
- regression coverage preserving V10 behavior when auth is disabled.

V11 intentionally does not add database users, multiple roles, invitations, password-reset email, or third-party identity providers.

## 6. Enable administrator authentication

For any network/public deployment, enable application authentication.

Required values:

```text
APP_AUTH_ENABLED=true
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<at-least-12-characters>
SESSION_SECRET=<at-least-32-random-characters>
PUBLIC_BASE_URL=https://your-real-srocial-origin.example
```

Do **not** copy the example secret strings into production. Generate your own private values and never commit them.

### PowerShell example

```powershell
$env:APP_AUTH_ENABLED="true"
$env:ADMIN_USERNAME="admin"
$env:ADMIN_PASSWORD="REPLACE-WITH-YOUR-LONG-PRIVATE-PASSWORD"
$env:SESSION_SECRET="REPLACE-WITH-A-RANDOM-SECRET-AT-LEAST-32-CHARACTERS"
$env:PUBLIC_BASE_URL="https://srocial.example.com"
npm start
```

### Command Prompt example

```bat
set APP_AUTH_ENABLED=true
set ADMIN_USERNAME=admin
set ADMIN_PASSWORD=REPLACE-WITH-YOUR-LONG-PRIVATE-PASSWORD
set SESSION_SECRET=REPLACE-WITH-A-RANDOM-SECRET-AT-LEAST-32-CHARACTERS
set PUBLIC_BASE_URL=https://srocial.example.com
npm start
```

### macOS/Linux example

```bash
export APP_AUTH_ENABLED="true"
export ADMIN_USERNAME="admin"
export ADMIN_PASSWORD="REPLACE-WITH-YOUR-LONG-PRIVATE-PASSWORD"
export SESSION_SECRET="REPLACE-WITH-A-RANDOM-SECRET-AT-LEAST-32-CHARACTERS"
export PUBLIC_BASE_URL="https://srocial.example.com"
npm start
```

When auth is enabled, Srocial fails startup instead of silently exposing the dashboard if:

- `ADMIN_PASSWORD` is shorter than 12 characters;
- `SESSION_SECRET` is shorter than 32 characters;
- `PUBLIC_BASE_URL` is not a valid HTTP/HTTPS URL;
- auth/rate-limit numeric settings are invalid.

## 7. Sign in and sign out

With V11 auth enabled:

1. Open the configured Srocial URL.
2. Protected dashboard navigation redirects to `/login.html`.
3. Enter `ADMIN_USERNAME` and `ADMIN_PASSWORD`.
4. Srocial sets a signed HttpOnly session cookie.
5. The browser returns to the dashboard.
6. Use **Sign out** in the dashboard header to expire the cookie.

The password and `SESSION_SECRET` are not stored in localStorage or sessionStorage.

The session defaults to 8 hours:

```text
SESSION_TTL_SECONDS=28800
```

For an HTTPS `PUBLIC_BASE_URL`, the session cookie includes `Secure`. Use HTTPS for any non-loopback deployment so credentials and cookies are protected in transit.

## 8. Understand public and protected routes

When auth is enabled, only these route groups remain public:

```text
GET       /api/health
POST      /api/auth/login
GET/HEAD  /login.html and its dedicated assets
GET       /api/oauth/:provider/callback
GET/HEAD  /media/:key
```

The OAuth callback remains public because providers must redirect to it. Uploaded media retrieval remains public because Instagram and other providers need to fetch media from the scheduled URL.

Everything else in the dashboard/static app and management API is protected by default.

Unauthenticated protected APIs return:

```text
HTTP 401
{ "error": "unauthorized" }
```

Explicit cross-site authenticated mutations return:

```text
HTTP 403
{ "error": "cross_site_request" }
```

## 9. Request-limit defaults

Defaults:

```text
API_RATE_LIMIT_WINDOW_MS=60000
API_RATE_LIMIT_MAX=120
LOGIN_RATE_LIMIT_WINDOW_MS=900000
LOGIN_RATE_LIMIT_MAX=10
```

That means:

- protected API: 120 requests per 60 seconds per remote address;
- login: 10 attempts per 15 minutes per remote address.

Exceeded limits return HTTP 429 with `Retry-After`.

V11 uses `request.socket.remoteAddress` and deliberately ignores `X-Forwarded-For`. If you later need multiple app instances or proxy-aware client identity, design that as a separate deployment/security change rather than trusting forwarded headers automatically.

## 10. Use PostgreSQL instead of JSON

You need an accessible PostgreSQL database and a connection string such as:

```text
postgres://USER:PASSWORD@HOST:5432/DATABASE
```

Never commit the real connection string to GitHub.

### PowerShell

```powershell
$env:DATABASE_DRIVER="postgres"
$env:DATABASE_URL="postgres://USER:PASSWORD@HOST:5432/DATABASE"
```

### Command Prompt

```bat
set DATABASE_DRIVER=postgres
set DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DATABASE
```

### macOS/Linux

```bash
export DATABASE_DRIVER=postgres
export DATABASE_URL="postgres://USER:PASSWORD@HOST:5432/DATABASE"
```

`DATABASE_URL` does not switch Srocial to PostgreSQL by itself. `DATABASE_DRIVER=postgres` must also be set.

## 11. Run PostgreSQL migrations

Before the first PostgreSQL startup, run:

```bash
npm run db:migrate
```

A successful run prints migration names and whether each migration was applied or skipped.

`npm start` does **not** apply migrations automatically. If required tables are missing, startup fails with:

```text
DATABASE_MIGRATIONS_REQUIRED
```

Applied migrations are recorded in `srocial_migrations` with SHA-256 checksums. Do not edit already-applied historical migration files; add a new migration instead.

## 12. Start with PostgreSQL

After migrations:

```bash
npm start
```

The same dashboard is available at the configured `HOST` and `PORT`. Authentication configuration is independent of database selection, so you can use V11 auth with either JSON or PostgreSQL.

When the process stops, Srocial closes the PostgreSQL pool after stopping the scheduler and HTTP server.

## 13. Check health

Request:

```text
GET /api/health
```

Health remains public for infrastructure monitoring.

A healthy JSON installation includes:

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

With PostgreSQL selected, `backend` is `postgres` and the health check performs a live query.

Repository health failures return HTTP 503 with sanitized information. Database passwords, hosts, usernames, connection strings, and raw driver errors are not returned.

## 14. Configure Instagram

Before **Connect Instagram** can work, the running process needs:

```text
INSTAGRAM_APP_ID
INSTAGRAM_APP_SECRET
TOKEN_ENCRYPTION_KEY
PUBLIC_BASE_URL
```

Optional:

```text
INSTAGRAM_API_VERSION=v26.0
```

### PowerShell example

```powershell
$env:INSTAGRAM_APP_ID="YOUR_APP_ID"
$env:INSTAGRAM_APP_SECRET="YOUR_APP_SECRET"
$env:TOKEN_ENCRYPTION_KEY="YOUR_LONG_PRIVATE_ENCRYPTION_SECRET"
$env:PUBLIC_BASE_URL="https://srocial.example.com"
npm start
```

Srocial does not automatically load `.env` files through `dotenv`. Supply settings through your shell, process manager, container, or deployment environment.

## 15. Configure the Instagram callback

With the default local address, the callback is:

```text
http://127.0.0.1:3000/api/oauth/instagram/callback
```

For deployment, use the actual externally reachable HTTPS origin:

```text
https://srocial.example.com/api/oauth/instagram/callback
```

Your Instagram/Meta application must allow the exact callback URI used by Srocial.

The callback remains public even when V11 auth is enabled because Meta must reach it. OAuth **start** remains protected, so a visitor without a Srocial session cannot initiate account management through the dashboard API.

## 16. Connect Instagram

1. Start Srocial with Instagram configuration and, for deployment, V11 auth enabled.
2. Sign in to Srocial.
3. Go to **Accounts**.
4. Click **Connect Instagram**.
5. Complete provider authorization.
6. Instagram redirects to Srocial.
7. Srocial exchanges the result server-side, encrypts the credential, and redirects toward **Accounts**.

Browser URLs receive only safe status/result values. Provider access tokens, authorization codes, OAuth state values, and raw provider errors are not copied into dashboard URLs.

If your Srocial session expires during OAuth, the callback still completes its own state validation, but the subsequent dashboard request redirects to the Srocial login page.

## 17. Reconnect or disconnect Instagram

For an existing account:

- **Reconnect** starts OAuth again.
- **Disconnect** clears stored credential material and marks the account `DISCONNECTED`.

Both management actions require the V11 application session when auth is enabled.

## 18. Schedule an Instagram post

1. Open **Create social post**.
2. Enter a caption.
3. Check **Instagram**.
4. Choose the connected account.
5. Upload a JPEG, PNG, WebP, or MP4, select an existing asset from **Media**, or enter an HTTPS media URL.
6. Choose a future publish time.
7. Click **Schedule**.

Srocial creates:

```text
Post
  -> Media
  -> Instagram Publication(accountId)
  -> SOCIAL_PUBLICATION scheduler job
```

Instagram must be able to retrieve the media from an externally reachable HTTPS URL.

## 19. Manage the Media Library

Open **Media** in the sidebar.

Available actions:

- **Use in composer**
- **Copy URL**
- **Delete** unused media
- **Refresh**

A persisted post reference marks the asset **In use**. The server refuses deletion even if the UI is bypassed.

Defaults:

```text
MEDIA_UPLOAD_DIR=./data/uploads
MEDIA_UPLOAD_MAX_BYTES=52428800
MEDIA_UPLOAD_TOTAL_MAX_BYTES=5368709120
```

Upload/list/delete management APIs require the V11 session when auth is enabled. The resulting `/media/:key` URL itself stays publicly readable for provider delivery.

The current upload validation checks the declared MIME allowlist; it does not yet inspect file signatures or scan content. That remains a future hardening task.

## 20. Enable real scheduled publishing

Real recurring execution starts only when both values are true:

```text
ALLOW_REAL_PUBLISH=true
SCHEDULER_ENABLED=true
```

PowerShell example:

```powershell
$env:ALLOW_REAL_PUBLISH="true"
$env:SCHEDULER_ENABLED="true"
$env:SCHEDULER_INTERVAL_MS="30000"
npm start
```

Enable this only when the intended account, media, caption, and schedule are correct.

## 21. Scheduler behavior

The scheduler performs:

```text
find due jobs
 -> atomically claim
 -> lock to one worker
 -> dispatch to provider adapter
 -> store provider result
 -> complete / retry / status-check
```

With PostgreSQL, claiming uses `FOR UPDATE SKIP LOCKED` so concurrent workers do not claim the same due row. Stale running locks can still be recovered after the configured timeout.

## 22. Local data and backups

With JSON mode, runtime records are stored in:

```text
data/srocial.json
```

Uploaded files are stored separately in:

```text
data/uploads/
```

Back up both when using local JSON/media storage.

With PostgreSQL mode, back up the database using normal database backup tools **and** back up `MEDIA_UPLOAD_DIR`. PostgreSQL persistence does not move uploaded bytes into the database.

V11 application sessions are stateless signed cookies, so there is no V11 session table to back up.

## 23. Run tests

Install dependencies first, then run:

```bash
npm test
```

The normal local suite may skip PostgreSQL integration tests unless `TEST_POSTGRES_URL` is configured.

GitHub Actions starts PostgreSQL 17, runs the real migration command, runs all tests including V11 authorization/security tests, and performs JavaScript syntax checks.

## 24. Stop Srocial

Press:

```text
Ctrl + C
```

Srocial stops the scheduler, closes the HTTP server, then closes the selected repository.

## 25. Common problems

### `APP_AUTH_PASSWORD_WEAK`

`APP_AUTH_ENABLED=true`, but `ADMIN_PASSWORD` is shorter than 12 characters. Set a longer private password.

### `APP_AUTH_SESSION_SECRET_WEAK`

`APP_AUTH_ENABLED=true`, but `SESSION_SECRET` is shorter than 32 characters. Generate a longer random secret.

### `APP_AUTH_PUBLIC_BASE_URL_INVALID`

`PUBLIC_BASE_URL` is not a valid HTTP/HTTPS URL. Set the exact Srocial origin, for example:

```text
https://srocial.example.com
```

### Login returns 429

Too many sign-in attempts were made from the same remote address inside the configured window. Wait for the `Retry-After` duration or adjust the login limits intentionally.

### Protected API returns 401

The application session is missing, invalid, tampered, or expired. Sign in again.

### Protected mutation returns 403 `cross_site_request`

The browser sent an explicit cross-site origin/fetch context. Use the Srocial dashboard from the configured `PUBLIC_BASE_URL` origin.

### `Cannot find package 'pg'`

Run:

```bash
npm install
```

### `DATABASE_URL_REQUIRED`

You selected `DATABASE_DRIVER=postgres` without a nonempty `DATABASE_URL`.

### `DATABASE_DRIVER_UNSUPPORTED`

Use only `json` or `postgres`.

### `DATABASE_MIGRATIONS_REQUIRED`

Run:

```bash
npm run db:migrate
```

then start again.

### `MIGRATION_CHECKSUM_MISMATCH:<file>`

An applied historical migration changed. Restore it and put the schema change in a new migration file.

### `/api/health` returns 503

The repository health check failed. For PostgreSQL, verify database availability and credentials. Raw connection errors are deliberately hidden.

### All composer platforms are disabled

No connected account exists. Use **Accounts > Connect Instagram**.

### Upload fails

Use a nonempty JPEG, PNG, WebP, or MP4. Check per-file quota, total quota, upload-directory write permissions, and disk space.

### Media cannot be deleted

The asset is referenced by a persisted post. This is intentional.

### Real posting does not start

Confirm both `ALLOW_REAL_PUBLISH=true` and `SCHEDULER_ENABLED=true`, plus valid provider credentials.

### `EADDRINUSE`

Another process is using the configured port. Change `PORT` or stop the conflicting process.

## 26. Reset JSON development data

For JSON mode only:

1. Stop Srocial.
2. Delete `data/srocial.json` to reset records.
3. Delete `data/uploads/` only if you also want to erase uploaded media.
4. Start Srocial again.

Do not use this reset procedure for PostgreSQL.

## Quick Start — Safe Loopback JSON Mode

```text
1. Install Node.js 20+.
2. Download or clone Srocial.
3. Run: npm install
4. Keep DATABASE_DRIVER=json.
5. Keep APP_AUTH_ENABLED=false only for loopback-only local development.
6. Run: npm start
7. Open: http://127.0.0.1:3000
8. Keep ALLOW_REAL_PUBLISH=false.
9. Keep SCHEDULER_ENABLED=false.
10. Run npm test when validating changes.
11. Press Ctrl + C to stop.
```

## Quick Start — Authenticated Deployment

```text
1. Install Node.js 20+.
2. Run: npm install
3. Set PUBLIC_BASE_URL to the real HTTPS Srocial origin.
4. Set APP_AUTH_ENABLED=true.
5. Set ADMIN_USERNAME.
6. Set a private ADMIN_PASSWORD of at least 12 characters.
7. Set a random SESSION_SECRET of at least 32 characters.
8. Choose JSON or PostgreSQL persistence.
9. If PostgreSQL: set DATABASE_URL and run npm run db:migrate.
10. Run: npm start
11. Open the HTTPS Srocial URL and sign in.
12. Keep real publishing flags false until intentionally enabled.
```
