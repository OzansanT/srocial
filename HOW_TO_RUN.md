# How to Run Srocial — Beginner Guide

This guide explains how to install and run Srocial, use the default JSON repository, optionally configure PostgreSQL, connect Instagram, schedule posts, manage uploaded media, and keep real publishing disabled until you intentionally enable it.

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

V10 uses the PostgreSQL `pg` client package, so dependency installation is required even if you plan to use the default JSON repository.

Run:

```bash
npm install
```

## 4. Start in safe JSON mode

The default database configuration is:

```text
DATABASE_DRIVER=json
DATA_FILE=./data/srocial.json
```

You do not need PostgreSQL for ordinary local development.

Start Srocial:

```bash
npm start
```

Open:

```text
http://127.0.0.1:3000
```

Publishing safety defaults are:

```text
ALLOW_REAL_PUBLISH=false
SCHEDULER_ENABLED=false
```

Keep both false while learning or testing.

## 5. What V10 adds

V10 makes PostgreSQL a real production repository instead of only a future schema target.

It adds:

- explicit `DATABASE_DRIVER=json|postgres` selection;
- complete PostgreSQL persistence for accounts, OAuth state, posts, media, publications, and scheduler jobs;
- atomic concurrent scheduler claims using PostgreSQL row locks and `SKIP LOCKED`;
- stale-lock recovery with the same rules as the JSON repository;
- explicit checksum-verified migrations through `npm run db:migrate`;
- startup schema verification without automatic migrations;
- database-aware `/api/health` responses;
- graceful PostgreSQL pool shutdown;
- real PostgreSQL integration tests in GitHub Actions.

The dashboard, Media Library, Instagram connection flow, and safe publishing gates continue to work as before.

## 6. Use PostgreSQL instead of JSON

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

## 7. Run PostgreSQL migrations

Before the first PostgreSQL startup, run:

```bash
npm run db:migrate
```

A successful run prints migration names and whether each migration was applied or skipped.

Run the command again whenever a new migration is shipped.

### Important migration rule

`npm start` does **not** apply migrations automatically.

When PostgreSQL is selected, startup verifies that the required tables already exist. If they do not, startup fails with:

```text
DATABASE_MIGRATIONS_REQUIRED
```

Run `npm run db:migrate`, then start the application again.

Applied migrations are recorded in `srocial_migrations` with SHA-256 checksums. If an already-applied migration file is later changed, the migration command refuses to continue. Add a new migration instead of editing historical migration files.

## 8. Start with PostgreSQL

After migrations:

```bash
npm start
```

The same dashboard is available at the configured `HOST` and `PORT`.

When the process stops, Srocial closes the PostgreSQL connection pool after stopping the scheduler and HTTP server.

## 9. Check health

Open or request:

```text
GET /api/health
```

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

With PostgreSQL selected, `backend` is `postgres` and the health check performs a live database query.

If database health fails, Srocial returns HTTP `503` with sanitized information only. Database passwords, hosts, usernames, connection strings, and raw driver errors are not returned.

## 10. Configure Instagram

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
$env:PUBLIC_BASE_URL="http://127.0.0.1:3000"
npm start
```

Srocial does not automatically load `.env` files through `dotenv`. Supply settings through your shell, process manager, container, or deployment environment.

## 11. Configure the Instagram callback

With the default local address, the callback is:

```text
http://127.0.0.1:3000/api/oauth/instagram/callback
```

Your Instagram/Meta application must allow the exact callback URI used by Srocial.

For deployment, set `PUBLIC_BASE_URL` to the actual externally reachable HTTPS Srocial origin and configure the matching callback at the provider.

## 12. Connect Instagram

1. Start Srocial with the Instagram environment variables configured.
2. Open the dashboard.
3. Go to **Accounts**.
4. Click **Connect Instagram**.
5. Complete provider authorization.
6. Instagram redirects to Srocial.
7. Srocial exchanges the result server-side, encrypts the credential, and returns you to **Accounts**.

The dashboard URL receives only safe values such as:

```text
?oauth=instagram&status=connected
```

or a sanitized error code. Provider access tokens, authorization codes, OAuth state values, and raw provider errors are not copied into the browser URL.

## 13. Reconnect or disconnect Instagram

For an existing account:

- **Reconnect** starts OAuth again.
- **Disconnect** clears stored credential material and marks the account `DISCONNECTED`.

After disconnect, the account can no longer be selected for a new publication.

## 14. Schedule an Instagram post

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

## 15. Manage the Media Library

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

Uploads are public to anyone with their URL. The application does not yet provide login/upload authorization, so do not expose `/api/` publicly without an authentication and request-limiting layer.

## 16. Enable real scheduled publishing

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

## 17. Scheduler behavior

The scheduler performs:

```text
find due jobs
 -> atomically claim
 -> lock to one worker
 -> dispatch to provider adapter
 -> store provider result
 -> complete / retry / status-check
```

With PostgreSQL, the claim operation uses `FOR UPDATE SKIP LOCKED` so concurrent workers do not claim the same due row. Stale running locks can still be recovered after the configured lock timeout.

## 18. Local data and backups

With JSON mode, runtime records are stored in:

```text
data/srocial.json
```

Uploaded files are stored separately in:

```text
data/uploads/
```

Back up both when using local JSON/media storage.

With PostgreSQL mode, back up the PostgreSQL database using your normal database backup process **and** back up `MEDIA_UPLOAD_DIR`. PostgreSQL persistence does not move uploaded file bytes into the database.

## 19. Run tests

Install dependencies first, then run:

```bash
npm test
```

The normal local test suite may skip PostgreSQL integration tests unless `TEST_POSTGRES_URL` is configured.

GitHub Actions automatically starts PostgreSQL 17, runs the real migration command, runs all tests including PostgreSQL integration/concurrency tests, and performs JavaScript syntax checks.

## 20. Stop Srocial

Press:

```text
Ctrl + C
```

Srocial stops the scheduler, closes the HTTP server, then closes the selected repository. JSON close is a no-op; PostgreSQL closes its owned pool.

## 21. Common problems

### `Cannot find package 'pg'`

Run:

```bash
npm install
```

### `DATABASE_URL_REQUIRED`

You selected `DATABASE_DRIVER=postgres` without a nonempty `DATABASE_URL`.

### `DATABASE_DRIVER_UNSUPPORTED`

Use only:

```text
DATABASE_DRIVER=json
```

or:

```text
DATABASE_DRIVER=postgres
```

### `DATABASE_MIGRATIONS_REQUIRED`

The PostgreSQL database is reachable but required Srocial tables are missing. Run:

```bash
npm run db:migrate
```

then start again.

### `MIGRATION_CHECKSUM_MISMATCH:<file>`

An already-applied historical migration file changed. Restore the original migration and put the new schema change in a new migration file.

### `/api/health` returns 503

The repository health check failed. For PostgreSQL, verify database availability and credentials. The API deliberately does not reveal the raw connection error.

### All composer platforms are disabled

No connected account exists. Use **Accounts > Connect Instagram**.

### Upload fails

Use a nonempty JPEG, PNG, WebP, or MP4. Check per-file quota, total quota, upload-directory write permissions, and available disk space.

### Media cannot be deleted

The asset is referenced by a persisted post. This protection is intentional.

### Real posting does not start

Confirm both `ALLOW_REAL_PUBLISH=true` and `SCHEDULER_ENABLED=true`, plus valid provider credentials.

### `EADDRINUSE`

Another process is using the configured port. Change `PORT` or stop the conflicting process.

## 22. Reset JSON development data

For JSON mode only:

1. Stop Srocial.
2. Delete `data/srocial.json` to reset records.
3. Delete `data/uploads/` only if you also want to erase uploaded media.
4. Start Srocial again.

Do not use this procedure for PostgreSQL. Use database-specific administrative tools and backups instead.

## Quick Start — Safe JSON Mode

```text
1. Install Node.js 20+.
2. Download or clone Srocial.
3. Run: npm install
4. Keep DATABASE_DRIVER=json.
5. Run: npm start
6. Open: http://127.0.0.1:3000
7. Keep ALLOW_REAL_PUBLISH=false.
8. Keep SCHEDULER_ENABLED=false.
9. Configure Instagram only when needed.
10. Use Media to reuse or safely delete uploaded assets.
11. Run npm test to verify the project.
12. Press Ctrl + C to stop.
```

## Quick Start — PostgreSQL Mode

```text
1. Install Node.js 20+ and PostgreSQL.
2. Download or clone Srocial.
3. Run: npm install
4. Set DATABASE_DRIVER=postgres.
5. Set DATABASE_URL to your database connection string.
6. Run: npm run db:migrate
7. Run: npm start
8. Check: GET /api/health
9. Keep real publishing flags false until intentionally enabled.
10. Press Ctrl + C to stop.
```
