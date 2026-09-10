# How to Run Srocial — Beginner Guide

This guide explains how to open the current Srocial project locally, test it safely, connect Instagram when you are ready, and understand the two switches that control real publishing.

## 1. Install Node.js

Srocial requires Node.js 20 or newer.

Download the current LTS release from the official Node.js website and install it with the normal options. Then open a new Command Prompt/PowerShell/Terminal and check:

```text
node -v
npm -v
```

You should see version numbers. Node 20, 22, or newer is suitable.

## 2. Get the project

### Easiest: Download ZIP

1. Open the `OzansanT/srocial` repository on GitHub.
2. Click **Code**.
3. Click **Download ZIP**.
4. Extract the ZIP.
5. Open the extracted `srocial` folder.

### With Git

```bash
git clone https://github.com/OzansanT/srocial.git
cd srocial
```

The project folder should contain:

```text
README.md
HOW_TO_RUN.md
package.json
client/
server/
tests/
```

## 3. No `npm install` is required right now

The current runtime uses Node.js built-in modules and has no external npm dependency.

You can therefore start directly with:

```text
npm start
```

## 4. Start Srocial safely

Open a terminal inside the project folder and run:

```bash
npm start
```

The default address is:

```text
http://127.0.0.1:3000
```

Open that address in Chrome, Edge, Firefox, or Safari.

The default configuration does **not** publish real content because both publishing switches are off:

```text
ALLOW_REAL_PUBLISH=false
SCHEDULER_ENABLED=false
```

Keep these defaults while learning or testing locally.

## 5. What you see in the V6 composer

The composer now schedules **accounts**, not only platform names.

A destination looks conceptually like:

```text
[ ] Instagram      [ @connected_account ▼ ]
```

If no connected account exists for a platform, its checkbox/select is disabled. This is intentional; Srocial will not guess which real account should publish a post.

The composer also contains:

```text
Caption
Media type: Image / Video
Media URL: https://...
Publish time
```

The media URL must be HTTPS and must be reachable by the provider. Direct file upload is not implemented yet.

## 6. Safe local test without connecting Instagram

The browser composer requires a connected account. If you only want to test the internal database/scheduler records without provider credentials, use the legacy development API.

### Windows PowerShell

Run Srocial in one terminal:

```powershell
npm start
```

Open another PowerShell window inside the same project folder and run:

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

This creates an **unbound development publication** with no real account attached. With the default safety flags it cannot be published automatically.

### macOS / Linux

With Srocial running, open another terminal and use a future UTC date:

```bash
curl -X POST http://127.0.0.1:3000/api/posts \
  -H 'content-type: application/json' \
  -d '{
    "caption":"My local Srocial test",
    "platforms":["instagram"],
    "scheduledAt":"2027-01-01T12:00:00.000Z"
  }'
```

The date must be in the future when you run the command.

## 7. Where local data is stored

Development data is stored in:

```text
data/srocial.json
```

It can contain:

```text
posts
media
publications
scheduler jobs
accounts
oauth states
```

Do not manually place real raw provider tokens in this file. Connected-account tokens are written by the server in encrypted form.

## 8. Run automated tests

From the project folder:

```bash
npm test
```

A successful run ends with zero failed tests.

The repository also runs the test suite and JavaScript syntax checks automatically through GitHub Actions on build branches, pull requests, and `main`.

## 9. Stop Srocial

Return to the terminal running the server and press:

```text
Ctrl + C
```

Srocial stops its recurring scheduler timer, closes the HTTP server, and leaves your local JSON data on disk.

## 10. Change the port

### Windows Command Prompt

```bat
set PORT=3001
npm start
```

### Windows PowerShell

```powershell
$env:PORT="3001"
npm start
```

### macOS / Linux

```bash
PORT=3001 npm start
```

Then open:

```text
http://127.0.0.1:3001
```

## 11. Environment variables

The repository contains `.env.example`, which documents supported settings.

Important defaults:

```text
APP_ENV=development
ALLOW_REAL_PUBLISH=false
SCHEDULER_ENABLED=false
SCHEDULER_INTERVAL_MS=30000
HOST=127.0.0.1
PORT=3000
PUBLIC_BASE_URL=http://127.0.0.1:3000
DATA_FILE=./data/srocial.json
```

The current project does **not** automatically read a `.env` file with a package such as `dotenv`. Set values in the shell/process environment or in your deployment environment.

## 12. Instagram configuration

The Instagram adapter is registered only when both of these values are supplied:

```text
INSTAGRAM_APP_ID
INSTAGRAM_APP_SECRET
```

Optional API-version override:

```text
INSTAGRAM_API_VERSION=v26.0
```

Token encryption also requires:

```text
TOKEN_ENCRYPTION_KEY=<a long private random value>
```

Never commit real values to GitHub.

### Example — PowerShell development session

Use your own values; the examples below are names, not credentials:

```powershell
$env:INSTAGRAM_APP_ID="YOUR_APP_ID"
$env:INSTAGRAM_APP_SECRET="YOUR_APP_SECRET"
$env:TOKEN_ENCRYPTION_KEY="YOUR_LONG_PRIVATE_ENCRYPTION_SECRET"
$env:PUBLIC_BASE_URL="http://127.0.0.1:3000"
npm start
```

### Example — Command Prompt

```bat
set INSTAGRAM_APP_ID=YOUR_APP_ID
set INSTAGRAM_APP_SECRET=YOUR_APP_SECRET
set TOKEN_ENCRYPTION_KEY=YOUR_LONG_PRIVATE_ENCRYPTION_SECRET
set PUBLIC_BASE_URL=http://127.0.0.1:3000
npm start
```

Your provider application must be configured to accept the exact OAuth callback URI used by Srocial. With the default local base URL, Srocial constructs:

```text
http://127.0.0.1:3000/api/oauth/instagram/callback
```

For a deployed installation, set `PUBLIC_BASE_URL` to the actual public base address and configure the matching callback in the provider application.

## 13. Connect Instagram with the current V6 API

A complete browser Accounts screen is the next UI stage. In V6, the OAuth backend works, but starting the connection is still an API action.

With Instagram configuration present, send:

```http
POST /api/oauth/instagram/start
Content-Type: application/json

{}
```

The response contains an `authorizationUrl`. Open that URL in your browser and complete the provider authorization.

After authorization, the provider sends the browser to Srocial's callback endpoint. The current callback returns safe JSON account metadata. V7 will turn this into a normal dashboard redirect/connection screen.

After a successful connection, reload the dashboard. The Instagram account should be available in the composer selector.

## 14. Schedule an account-bound Instagram post

Once the account is connected:

1. Reload Srocial.
2. Enter a caption.
3. Check **Instagram**.
4. Choose the connected Instagram account.
5. Choose **Image** or **Video / Reel**.
6. Enter an externally reachable HTTPS media URL.
7. Choose a future publish time.
8. Click **Schedule**.

This creates:

```text
Post
  -> Media
  -> Instagram Publication(accountId)
  -> SOCIAL_PUBLICATION scheduler job
```

At this point the record is scheduled, but it will still not be sent automatically while the production switches remain off.

## 15. Enabling real scheduled publishing

This is the important safety section.

Real recurring execution starts **only if both flags are true**:

```text
ALLOW_REAL_PUBLISH=true
SCHEDULER_ENABLED=true
```

For example in PowerShell:

```powershell
$env:ALLOW_REAL_PUBLISH="true"
$env:SCHEDULER_ENABLED="true"
$env:SCHEDULER_INTERVAL_MS="30000"
npm start
```

Do this only after:

- the correct provider account is connected;
- the media URL is valid and externally reachable;
- the caption and schedule are correct;
- you intend Srocial to call the real provider API.

Setting only one flag is not enough; the recurring scheduler remains off.

## 16. What the scheduler does

When enabled, approximately every configured interval it:

```text
finds due jobs
 -> atomically claims them
 -> locks them to one worker
 -> calls the correct provider adapter
 -> stores the result
 -> completes/retries/status-checks as required
```

The loop also refuses to start a second overlapping tick while the previous tick is still running.

The underlying worker/repository layers still provide their own locking and idempotency guards.

## 17. Common problems

### `node` or `npm` is not recognized

Install Node.js 20+ and open a new terminal.

### `EADDRINUSE`

Port 3000 is already being used. Start Srocial on another port, for example 3001.

### All platform choices are disabled

There are no connected accounts in Srocial yet. Configure/connect a provider account, then reload the dashboard.

### Instagram OAuth start says `unsupported_provider`

`INSTAGRAM_APP_ID` and/or `INSTAGRAM_APP_SECRET` are not configured in the running server process.

### OAuth callback says `oauth_not_configured`

`TOKEN_ENCRYPTION_KEY` is missing from the server process.

### Schedule returns a destination/account error

Check that:

- the selected account still exists;
- its state is `CONNECTED`;
- its provider matches the selected platform.

### Schedule returns a media error

Check that the URL begins with `https://`, is syntactically valid, and points to media the provider can reach.

### Real posting does not start

Check both values:

```text
ALLOW_REAL_PUBLISH=true
SCHEDULER_ENABLED=true
```

Also confirm the account/provider credentials are configured.

## 18. Delete local development data

To reset local state:

1. Stop Srocial with `Ctrl + C`.
2. Delete `data/srocial.json`.
3. Start Srocial again.

A new empty development data file will be created.

## 19. Updating later

If cloned with Git:

```bash
git pull
```

Then read `README.md` and `HOW_TO_RUN.md` for changes.

If downloaded as ZIP, download/extract the newer release into a new folder. Preserve any `data/srocial.json` you intentionally want to keep.

## Quick Start — Safe Mode

```text
1. Install Node.js 20+.
2. Download/clone Srocial.
3. Open a terminal in the project folder.
4. Run: npm start
5. Open: http://127.0.0.1:3000
6. Keep ALLOW_REAL_PUBLISH=false.
7. Keep SCHEDULER_ENABLED=false.
8. Run npm test whenever you want to verify the project.
9. Press Ctrl + C to stop.
```

That is the correct starting mode for a new user.