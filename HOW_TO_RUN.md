# How to Run Srocial — Beginner Guide

This guide explains how to run Srocial locally, connect Instagram from the browser, schedule account-bound content, and keep real publishing disabled until you intentionally enable it.

## 1. Install Node.js

Srocial requires Node.js 20 or newer.

After installing the current Node.js LTS release, open a new terminal and check:

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
4. Open the extracted `srocial` folder.

### Git clone

```bash
git clone https://github.com/OzansanT/srocial.git
cd srocial
```

## 3. Start in safe mode

The current runtime has no external npm dependencies, so `npm install` is not required.

Run:

```bash
npm start
```

Open:

```text
http://127.0.0.1:3000
```

The default safety configuration is:

```text
ALLOW_REAL_PUBLISH=false
SCHEDULER_ENABLED=false
```

Keep both values false while learning or testing. With these defaults, the recurring real-publish scheduler does not start.

## 4. What V8 includes

The dashboard now contains an **Accounts** section. Instagram can be managed from the browser with:

```text
Connect Instagram
Reconnect
Disconnect
```

You no longer need to manually call the OAuth start API for normal browser use.

The composer still schedules a specific connected account rather than guessing an account from a platform name.

V8 also adds **Upload media** in the composer. Select a JPEG, PNG, WebP, or MP4 file and click **Upload file**. The default limit is 50 MiB. A successful upload fills the media URL and type for you; you can still paste an existing HTTPS media URL instead.

## 5. Configure Instagram

Before the **Connect Instagram** flow can work, the running server needs:

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

Never commit real values to GitHub.

### PowerShell example

```powershell
$env:INSTAGRAM_APP_ID="YOUR_APP_ID"
$env:INSTAGRAM_APP_SECRET="YOUR_APP_SECRET"
$env:TOKEN_ENCRYPTION_KEY="YOUR_LONG_PRIVATE_ENCRYPTION_SECRET"
$env:PUBLIC_BASE_URL="http://127.0.0.1:3000"
npm start
```

### Command Prompt example

```bat
set INSTAGRAM_APP_ID=YOUR_APP_ID
set INSTAGRAM_APP_SECRET=YOUR_APP_SECRET
set TOKEN_ENCRYPTION_KEY=YOUR_LONG_PRIVATE_ENCRYPTION_SECRET
set PUBLIC_BASE_URL=http://127.0.0.1:3000
npm start
```

### macOS/Linux example

```bash
INSTAGRAM_APP_ID="YOUR_APP_ID" \
INSTAGRAM_APP_SECRET="YOUR_APP_SECRET" \
TOKEN_ENCRYPTION_KEY="YOUR_LONG_PRIVATE_ENCRYPTION_SECRET" \
PUBLIC_BASE_URL="http://127.0.0.1:3000" \
npm start
```

The current project does **not** automatically load a `.env` file through `dotenv`. Supply values through your shell/process or deployment environment.

## 6. Configure the Instagram callback

With the default local address, Srocial constructs this callback URI:

```text
http://127.0.0.1:3000/api/oauth/instagram/callback
```

Your Instagram/Meta application must allow the exact callback URI used by the running Srocial installation.

For a deployed installation, set `PUBLIC_BASE_URL` to your actual public HTTPS Srocial base URL and configure the matching callback in the provider application.

## 7. Connect Instagram from the dashboard

1. Start Srocial with the Instagram environment variables configured.
2. Open `http://127.0.0.1:3000`.
3. Scroll to **Accounts**, or click **Accounts** in the sidebar.
4. Click **Connect Instagram**.
5. Complete the provider authorization.
6. Instagram redirects back to the Srocial callback.
7. Srocial exchanges the authorization result server-side, encrypts the token, and redirects you back to the **Accounts** section.
8. The page displays a safe connection result and lists the connected account.

The dashboard URL receives only safe values such as:

```text
?oauth=instagram&status=connected
```

or a sanitized error code such as:

```text
?oauth=instagram&status=error&code=oauth_state_invalid
```

Provider access tokens, authorization codes, OAuth state values, and raw provider errors are not copied into the dashboard URL.

## 8. Reconnect or disconnect an account

For an existing Instagram account:

- **Reconnect** starts the Instagram OAuth flow again.
- **Disconnect** clears stored credential material for that Srocial account and marks it `DISCONNECTED`.

After a disconnect, the Accounts list and composer selectors refresh automatically. A disconnected account can no longer be selected for a new scheduled publication.

## 9. Schedule an Instagram post

Once Instagram is connected:

1. Open **Create social post**.
2. Enter a caption.
3. Check **Instagram**.
4. Choose the connected Instagram account.
5. Under **Upload media**, select a file and click **Upload file**. Wait for the result. The media URL and type are filled automatically.
6. Alternatively, choose **Image** or **Video / Reel** and paste an externally reachable HTTPS media URL.
7. Choose a future publish time.
8. Click **Schedule**.

Srocial creates:

```text
Post
  -> Media
  -> Instagram Publication(accountId)
  -> SOCIAL_PUBLICATION scheduler job
```

The media URL must be HTTPS and reachable by Instagram. A local HTTP upload shows a warning and cannot be scheduled for provider publishing. Set `PUBLIC_BASE_URL` to the actual public HTTPS Srocial address, restart, and upload again (or enter the correct HTTPS URL). Changing the setting does not update previously generated links.

Uploads are accessible to anyone with their link. Upload only media you intend to make public. The development app has no login or upload authorization: before public deployment, protect the dashboard and `/api/` with authenticated access and request limits; keep `/media/` retrievable by the provider.

## 10. Safe local scheduling without a real account

The browser composer intentionally requires a connected account. For internal development testing only, the legacy API can create an unbound publication.

### PowerShell

With Srocial already running:

```powershell
$body = @{
  caption = "My local Srocial test"
  platforms = @("instagram")
  scheduledAt = (Get-Date).AddHours(1).ToUniversalTime().ToString("o")
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri "http://127.0.0.1:3000/api/posts" `
  -Method Post `
  -ContentType "application/json" `
  -Body $body
```

This creates a publication with no real account binding. Do not use legacy unbound publications for real provider publishing.

## 11. Enabling real scheduled publishing

Real recurring execution starts only when **both** flags are true:

```text
ALLOW_REAL_PUBLISH=true
SCHEDULER_ENABLED=true
```

Example PowerShell session:

```powershell
$env:ALLOW_REAL_PUBLISH="true"
$env:SCHEDULER_ENABLED="true"
$env:SCHEDULER_INTERVAL_MS="30000"
npm start
```

Enable this only when:

- the intended provider account is connected;
- the media URL is correct and externally reachable;
- the caption and schedule are correct;
- you intend Srocial to call the real provider API.

Setting only one flag is not enough.

## 12. What the scheduler does

When enabled, Srocial repeatedly performs:

```text
find due jobs
 -> atomically claim
 -> lock to one worker
 -> dispatch to provider adapter
 -> store provider result
 -> complete / retry / status-check
```

The recurring loop refuses overlapping ticks. Repository locks and publication idempotency checks provide additional duplicate-publish protection.

## 13. JSON OAuth API clients

Normal browser OAuth callbacks redirect back to the dashboard.

An API client that explicitly sends:

```http
Accept: application/json
```

continues to receive the safe JSON callback response instead of the browser `303` redirect. This preserves the existing API contract for tests and programmatic clients.

## 14. Local data

Development state is stored in:

```text
data/srocial.json
```

It can contain posts, media, publications, scheduler jobs, accounts, and OAuth-state records.

Uploaded files are stored separately in `data/uploads/`. Keep and back up both locations. Uploads remain even if you do not schedule a post; V8 has no deletion UI or total disk quota. Deleting a file breaks its published URL.

To change upload storage or the per-file limit, stop the server and set these variables before restarting. Example in PowerShell:

```powershell
$env:MEDIA_UPLOAD_DIR="./data/uploads"
$env:MEDIA_UPLOAD_MAX_BYTES="52428800"
npm start
```

The limit is in bytes (`52428800` = 50 MiB). Use the environment-variable syntax in section 5 for other shells. Editing `.env.example` alone does not configure the running server.

Do not manually insert raw provider credentials. Srocial stores connected-account token material encrypted.

## 15. Run tests

```bash
npm test
```

A successful run ends with zero failed tests.

GitHub Actions also runs the full Node test suite and JavaScript syntax checks on build branches, pull requests, and `main`.

## 16. Stop Srocial

Press:

```text
Ctrl + C
```

The HTTP server and recurring scheduler timer stop cleanly. Local JSON data remains on disk.

## 17. Change the port

### Command Prompt

```bat
set PORT=3001
npm start
```

### PowerShell

```powershell
$env:PORT="3001"
npm start
```

### macOS/Linux

```bash
PORT=3001 npm start
```

Then open `http://127.0.0.1:3001` and update `PUBLIC_BASE_URL`/provider callback configuration to match if you are using OAuth.

## 18. Common problems

### All composer platforms are disabled

No connected account exists for those providers. Use **Accounts > Connect Instagram** for Instagram.

### Connect Instagram fails immediately

Confirm `INSTAGRAM_APP_ID` and `INSTAGRAM_APP_SECRET` exist in the running process.

### The page reports OAuth is not configured

Set `TOKEN_ENCRYPTION_KEY` in the running server process.

### OAuth returns an invalid/expired request message

Start a fresh connection from **Accounts > Connect Instagram**. OAuth state is intentionally single-use and expires.

### Instagram returns to the wrong URL

Check that `PUBLIC_BASE_URL` and the callback URI configured in the provider application match exactly.

### Schedule returns an account error

Confirm the account is still `CONNECTED` and belongs to the selected platform.

### Schedule returns a media error

Confirm the URL starts with `https://` and is reachable by the provider.

### Upload fails

Select a nonempty JPEG, PNG, WebP, or MP4 file. If it is too large, choose a smaller file or change `MEDIA_UPLOAD_MAX_BYTES` and restart. For storage failures, ensure `MEDIA_UPLOAD_DIR` is writable and the disk has space. Your previous media URL stays in the form after an upload failure.

### Real posting does not start

Confirm both values are true:

```text
ALLOW_REAL_PUBLISH=true
SCHEDULER_ENABLED=true
```

and that provider credentials are configured.

### `EADDRINUSE`

Another process is already using the selected port. Start Srocial on another port.

## 19. Reset local development data

1. Stop Srocial.
2. Delete `data/srocial.json`.
3. Start Srocial again.

A new empty development data file is created.

## Quick Start — Safe Mode

```text
1. Install Node.js 20+.
2. Download or clone Srocial.
3. Open a terminal in the project folder.
4. Run: npm start
5. Open: http://127.0.0.1:3000
6. Keep ALLOW_REAL_PUBLISH=false.
7. Keep SCHEDULER_ENABLED=false.
8. Configure Instagram credentials only when you want to test account connection.
9. Use Accounts > Connect Instagram.
10. Run npm test whenever you want to verify the project.
11. Press Ctrl + C to stop.
```
