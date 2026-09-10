# How to Run Srocial — Beginner Guide

This guide is written for someone who has never run a Node.js project before.

You do **not** need to understand programming to start the current local version of Srocial.

> Important: the current version can create and save scheduled social posts locally, but it does **not** publish them to Instagram, Facebook, Threads, TikTok, or WhatsApp yet. Real provider publishing is intentionally disabled while those integrations are still being developed.

---

## 1. What You Need

For the current version, you only need:

- a Windows, macOS, or Linux computer;
- Node.js version 20 or newer;
- the Srocial project folder;
- a web browser such as Chrome, Edge, Firefox, or Safari.

You do **not** need these yet just to open Srocial locally:

- PostgreSQL;
- Redis;
- Meta API keys;
- TikTok API keys;
- WhatsApp API keys;
- Instagram login information.

Srocial currently uses a local JSON file for development data.

---

# Windows — Easiest Method

## 2. Install Node.js

1. Open your browser.
2. Go to:

   https://nodejs.org/

3. Download the current **LTS** version.
4. Run the installer.
5. Keep the normal/default installer options.
6. Finish the installation.
7. Close any Command Prompt or PowerShell windows that were already open.

Now open a new terminal.

An easy way:

1. Press the Windows key.
2. Type:

   ```text
   cmd
   ```

3. Open **Command Prompt**.

Check that Node.js works:

```bat
node -v
```

You should see something similar to:

```text
v20.x.x
```

or a newer version such as Node 22.

Also check npm:

```bat
npm -v
```

If both commands show version numbers, Node.js is installed correctly.

---

## 3. Download Srocial

You have two options.

### Option A — Download ZIP

This is the easiest option for a beginner.

1. Open:

   https://github.com/OzansanT/srocial

2. Click the green **Code** button.
3. Click **Download ZIP**.
4. Wait for the download to finish.
5. Right-click the ZIP file.
6. Choose **Extract All**.
7. Open the extracted folder.

You should see files such as:

```text
README.md
HOW_TO_RUN.md
package.json
client
server
tests
```

### Option B — Git Clone

Use this only if Git is already installed.

Open Command Prompt and run:

```bat
git clone https://github.com/OzansanT/srocial.git
cd srocial
```

---

## 4. Open a Terminal Inside the Project Folder

If you downloaded the ZIP:

1. Open the extracted `srocial` folder in File Explorer.
2. Click the address bar at the top of File Explorer.
3. Type:

   ```text
   cmd
   ```

4. Press Enter.

A Command Prompt window should open directly inside the Srocial folder.

You can check that you are in the correct folder by running:

```bat
dir
```

You should see `package.json` in the list.

---

## 5. You Do Not Need `npm install` Yet

The current Srocial runtime intentionally uses Node.js built-in modules and has no external npm dependencies.

That means you can currently skip:

```text
npm install
```

If dependencies are added in a later version, this guide will be updated.

---

## 6. Start Srocial

Inside the Srocial project folder, run:

```bat
npm start
```

You should see something similar to:

```text
Srocial listening on http://127.0.0.1:3000
```

**Do not close this terminal window while using Srocial.**

The Node.js server is running inside that window.

---

## 7. Open Srocial in Your Browser

Open Chrome, Edge, Firefox, or another browser.

Go to:

```text
http://127.0.0.1:3000
```

You should now see the Srocial dashboard.

You can also use:

```text
http://localhost:3000
```

---

# First Test

## 8. Create a Test Scheduled Post

On the dashboard:

1. Find **Create social post**.
2. Enter a caption, for example:

   ```text
   My first Srocial test post
   ```

3. Select one or more platforms:
   - Instagram
   - Facebook
   - Threads
   - TikTok
4. Choose a date and time in the future.
5. Click **Schedule**.

You should see a success message.

The post should then appear in the **Upcoming posts** section.

The dashboard **Scheduled** counter should also increase.

### Important

Selecting Instagram, Facebook, Threads, or TikTok here does **not** currently send anything to those services.

The application currently creates the internal post, publication, and scheduler records only.

This makes it safe to test the scheduler without accidentally publishing real content.

---

## 9. Where Is My Data Saved?

The development version saves data here:

```text
data/srocial.json
```

You normally do not need to edit this file manually.

The file stores development data such as:

- scheduled posts;
- publication records;
- scheduler jobs.

The file is created automatically after Srocial starts using its local repository.

---

## 10. Stop Srocial

Go back to the terminal window where Srocial is running.

Press:

```text
Ctrl + C
```

The server will stop.

Your saved development posts remain in:

```text
data/srocial.json
```

---

## 11. Start It Again Later

Open a terminal inside the Srocial folder again and run:

```bat
npm start
```

Then open:

```text
http://127.0.0.1:3000
```

Your previously saved local posts should still be available.

---

# Test the Project

## 12. Run Automated Tests

Srocial includes automated tests.

Stop the running server first if you want a clean terminal, then run:

```bat
npm test
```

You should see the test results in the terminal.

A successful run should finish with zero failed tests.

You can start the application again afterwards with:

```bat
npm start
```

---

# Configuration

## 13. What Is `.env.example`?

The repository contains:

```text
.env.example
```

This file shows configuration variables that Srocial will use as the project grows.

Examples include:

```text
HOST=127.0.0.1
PORT=3000
DATA_FILE=./data/srocial.json
ALLOW_REAL_PUBLISH=false
```

It also contains empty placeholders for future Meta, TikTok, and WhatsApp credentials.

### You do not need to fill these API values in yet.

The current project also does **not** automatically load a `.env` file through a package such as `dotenv`.

For normal beginner use, simply run:

```bat
npm start
```

and keep the defaults.

---

## 14. Change the Port on Windows

The normal port is:

```text
3000
```

If port 3000 is already being used by another program, use a different port.

### Command Prompt

```bat
set PORT=3001
npm start
```

Then open:

```text
http://127.0.0.1:3001
```

### PowerShell

```powershell
$env:PORT="3001"
npm start
```

Then open:

```text
http://127.0.0.1:3001
```

The changed environment variable only needs to be set for that terminal session.

---

# macOS / Linux

## 15. Install Node.js

Install Node.js 20 or newer using the official Node.js installer or your preferred package manager.

Check it with:

```bash
node -v
npm -v
```

---

## 16. Download the Project

Either download the ZIP from:

```text
https://github.com/OzansanT/srocial
```

or clone it:

```bash
git clone https://github.com/OzansanT/srocial.git
cd srocial
```

---

## 17. Start Srocial

Run:

```bash
npm start
```

Open:

```text
http://127.0.0.1:3000
```

Stop it with:

```text
Ctrl + C
```

Run tests with:

```bash
npm test
```

To use port 3001 instead:

```bash
PORT=3001 npm start
```

Then open:

```text
http://127.0.0.1:3001
```

---

# Common Problems

## Problem: `node` is not recognized

Example:

```text
'node' is not recognized as an internal or external command
```

### Fix

1. Install Node.js from https://nodejs.org/.
2. Finish the installer.
3. Close the terminal.
4. Open a new terminal.
5. Run:

   ```bat
   node -v
   ```

---

## Problem: `npm` is not recognized

Node.js may not have installed correctly or the terminal was opened before Node was installed.

Close the terminal, open a new one, and try:

```bat
npm -v
```

If it still fails, reinstall Node.js.

---

## Problem: PowerShell says `npm.ps1` cannot be loaded

Some Windows PowerShell configurations block script execution.

You do **not** need to change Windows security settings just to run Srocial.

Use **Command Prompt** instead and run:

```bat
npm start
```

Or, from PowerShell, you can usually run:

```powershell
npm.cmd start
```

Tests can be run with:

```powershell
npm.cmd test
```

---

## Problem: `EADDRINUSE`

Example:

```text
Error: listen EADDRINUSE
```

This means another program is already using port 3000.

On Command Prompt:

```bat
set PORT=3001
npm start
```

Then open:

```text
http://127.0.0.1:3001
```

---

## Problem: Browser says the page cannot be reached

Check these things:

1. Is the terminal still open?
2. Did `npm start` show a Srocial listening message?
3. Are you opening the correct address?

Default:

```text
http://127.0.0.1:3000
```

If you changed the port, use the new port instead.

---

## Problem: Schedule button returns an error

Make sure:

- the caption is not empty;
- at least one social platform is selected;
- the selected date and time are in the future.

WhatsApp is not part of the social-post composer because WhatsApp Business will use a separate campaign and messaging workflow.

---

## Problem: I Want to Delete All Local Test Data

1. Stop Srocial with `Ctrl + C`.
2. Open the Srocial project folder.
3. Open the `data` folder.
4. Delete:

   ```text
   srocial.json
   ```

5. Run Srocial again:

   ```bat
   npm start
   ```

Srocial will create a new empty development data file.

---

# Updating Srocial Later

## If You Used Git Clone

Inside the project folder run:

```bash
git pull
```

Then check `README.md` and this guide for any new setup steps.

If future versions add npm packages, you may also need:

```bash
npm install
```

## If You Downloaded the ZIP

The simplest beginner method is:

1. download the latest ZIP again;
2. extract it into a new folder;
3. read this guide again before starting the newer version.

Be careful not to accidentally delete development data you want to keep from the old `data/srocial.json` file.

---

# Current Quick Start

For someone who already installed Node.js, the complete current process is only:

```text
1. Download/extract Srocial.
2. Open Command Prompt inside the Srocial folder.
3. Run: npm start
4. Open: http://127.0.0.1:3000
5. Use the social-post composer.
6. Press Ctrl + C when finished.
```

For the current development build, that is enough to run Srocial locally.