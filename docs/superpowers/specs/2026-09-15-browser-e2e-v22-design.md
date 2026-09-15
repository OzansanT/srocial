# V22 Browser E2E Foundation & Role Verification — Design

## Context

The source feature list is implemented through item 100. The live problem tracker still has `SR-P001` because CI verifies Node tests, migrations, and browser-module contracts but does not execute Srocial in a real browser. V21 also introduced persistent multi-user authentication and four-role RBAC, making browser-level verification the highest-value next production-readiness milestone.

## Goal

Add deterministic real-browser CI coverage for the authentication/RBAC surface without provider credentials or real external side effects. V22 establishes a reusable browser E2E harness and verifies the highest-risk V21 flows: login/logout, Admin-only Users UI, role authorization boundaries, user lifecycle changes, and session revocation.

## Scope

V22 covers:

- unauthenticated dashboard redirect to login;
- administrator login and logout through the real browser UI;
- Admin-only Users navigation/panel visibility;
- Admin creation of Viewer, Editor, Manager, and lifecycle test users through the Users UI;
- Viewer/Editor/Manager/Admin authorization behavior through same-origin browser `fetch` calls using the real session cookie;
- Admin role/status/password updates through the Users UI;
- explicit session revocation and verification that a previously issued session is rejected;
- a reusable CI browser harness based on headless Chrome and the Chrome DevTools Protocol.

V22 does **not** claim complete resolution of `SR-P001`. Account OAuth, media, V19 draft/composer workflows, scheduling, Queue/Calendar, WhatsApp, Operations, and Analytics still require browser E2E coverage in later slices. Real-provider verification remains separate under `SR-P002`, `SR-P003`, `SR-P004`, and `SR-P010`.

## Architecture

### Browser runner

Use the Chrome/Chromium binary already installed on the GitHub-hosted Ubuntu runner. A focused Node helper under `tests/e2e/` launches headless Chrome with a temporary profile and a local remote-debugging port. Node 22's built-in `WebSocket` connects directly to the page target's Chrome DevTools Protocol endpoint.

No Playwright, Selenium, Puppeteer, or other runtime dependency is added. This keeps `package.json` and the production dependency tree minimal while still executing JavaScript, cookies, DOM events, navigation, and network requests in a real Chromium browser.

### Application fixture

The E2E suite starts the real `server/server.js` in a child process with an isolated temporary environment:

- host `127.0.0.1` and an available local port;
- `APP_AUTH_ENABLED=true`;
- deterministic E2E bootstrap administrator credentials;
- a strong test-only `SESSION_SECRET`;
- `DATABASE_DRIVER=json` with a temporary `DATA_FILE`;
- temporary local media directory;
- `SCHEDULER_ENABLED=false`;
- `ALLOW_REAL_PUBLISH=false`;
- `ALLOW_REAL_WHATSAPP=false`;
- orphan cleanup disabled.

The fixture is destroyed after the suite. It cannot use production data or perform provider publishing.

### CDP helper boundary

`tests/e2e/browser-driver.js` owns browser-process and CDP details. Tests consume a small interface:

- `launchBrowser()` / `close()`;
- `navigate(url)`;
- `evaluate(expression)`;
- `waitFor(expression, options)`;
- `fill(selector, value)`;
- `click(selector)`;
- `submit(selector)`.

Tests must not implement their own WebSocket/CDP protocol handling.

### E2E server helper

`tests/e2e/srocial-server.js` owns temporary directories, free-port selection, server process startup, health polling, and cleanup. It returns `baseUrl`, bootstrap credentials, and a cleanup function.

## Authorization assertions

The suite uses the real browser session cookie and same-origin `fetch` for boundary checks:

- Viewer: protected GET allowed; post mutation denied with `403`.
- Editor: social-content mutation reaches normal validation rather than `403`; provider-account mutation denied with `403`.
- Manager: provider-account mutation reaches normal provider/config validation rather than `403`; `/api/users` denied with `403`.
- Admin: `/api/users` allowed.

The test does not require configured provider apps; for authorized Manager operations, any safe non-403 response proves the RBAC boundary while external provider execution remains unavailable.

## User lifecycle assertions

Through the real Admin Users UI:

1. create a user;
2. update role/display name/status and observe rendered state;
3. change password and verify old credentials fail/new credentials succeed;
4. disable the user and verify login fails;
5. create another active session using the normal login API, click **Revoke sessions** in the browser UI, then verify that existing session becomes unauthorized.

Password hashes or raw persisted session tokens are never inspected or exposed by the browser suite.

## CI integration

Add `npm run test:e2e` using explicit `node --test tests/e2e/*.e2e.js` so the existing `npm test` unit/integration discovery remains unchanged. GitHub Actions runs the E2E step after migrations, unit/integration tests, and JavaScript syntax checks.

The Chrome helper discovers `CHROME_PATH` first, then common Linux Chrome/Chromium locations. Failure to find a supported browser is a hard E2E failure rather than a skipped test.

## Failure handling

- Child server/browser processes are terminated in `after` cleanup even after assertion failures.
- Browser-driver protocol errors include the CDP method/error code but do not dump credentials or persisted data.
- Startup health polling has bounded timeouts.
- Browser wait helpers have bounded timeouts and report the expression that did not become true.
- External provider calls are never required.

## Security constraints

- Safe publish defaults remain off.
- E2E secrets are test-only constants passed to the child server process.
- Temporary JSON/media paths live under OS temporary directories and are removed after tests.
- No test-only HTTP route is added to production.
- No raw password hash/session token is returned by Srocial APIs or printed by tests.

## Problem tracker outcome

After V22, `SR-P001` changes from a broad `VERIFY` gap to `PARTIAL`: real-browser authentication/RBAC/Admin-user flows are covered, while the remaining operator surfaces are listed explicitly for later browser E2E slices. No other active problem is resolved by V22.
