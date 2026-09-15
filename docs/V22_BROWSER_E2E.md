# V22 — Browser E2E Foundation & Role Verification

V22 adds a real-browser CI gate for Srocial's authentication and role-management boundary. It is production-readiness work following completion of the supplied source feature list through item 100; it does not add a new provider or publishing capability.

## Goals

- exercise the real login/dashboard DOM in headless Chrome;
- verify Viewer, Editor, Manager, and Admin browser sessions against the server-side RBAC boundary;
- exercise Admin user creation and lifecycle operations through the real Users UI;
- verify password rotation, disabled-user login denial, logout, and explicit session revocation;
- keep all provider publishing and WhatsApp sending disabled during browser tests;
- fail CI when Chrome/browser interaction is unavailable rather than silently skipping coverage.

## Architecture

The E2E suite uses Node.js 22 built-ins and the Chrome DevTools Protocol directly. No Playwright, Puppeteer, Selenium, or browser-testing framework dependency is added.

`tests/e2e/srocial-server.js` starts the real Srocial server against isolated temporary JSON and media storage. The fixture enables application authentication with test-only credentials and explicitly keeps execution disabled:

```text
DATABASE_DRIVER=json
APP_AUTH_ENABLED=true
SCHEDULER_ENABLED=false
ALLOW_REAL_PUBLISH=false
ALLOW_REAL_WHATSAPP=false
MEDIA_ORPHAN_CLEANUP_ENABLED=false
```

`tests/e2e/browser-driver.js` launches headless Chrome with an isolated profile, discovers Chrome's `DevToolsActivePort`, connects to the initial page target over CDP/WebSocket, and exposes bounded navigation/DOM helpers. CDP calls, HTTP fixture startup, scenario execution, browser shutdown, and the CI step all have bounded timeouts so a failed browser process cannot wedge the workflow indefinitely.

Temporary Chrome-profile deletion is best-effort after Chrome termination. A late Chrome filesystem writer cannot convert successful browser assertions into a failed test or prevent the Srocial fixture from shutting down.

## Covered browser flows

The V22 suite verifies:

1. unauthenticated dashboard navigation redirects to the login page;
2. Admin login exposes Admin-only Users navigation and logout returns to login;
3. Admin creates Viewer, Editor, and Manager users through the Users UI;
4. Viewer is read-only and receives `403` for protected mutations;
5. Editor can reach social-content mutation paths but receives `403` for provider-account administration;
6. Manager can reach provider-account administration but receives `403` for application-user administration;
7. Admin can access `/api/users` and the Users surface;
8. Admin updates a user's display name and role through the UI;
9. password change invalidates the old credential and allows the new one;
10. disabling a user denies subsequent login;
11. explicit Admin session revocation invalidates an already-issued session cookie.

The browser probes use the browser's real application session and same-origin requests, so UI visibility is tested together with the authoritative server authorization boundary.

## Commands

Existing deterministic test suite:

```bash
npm test
```

Real-browser suite:

```bash
npm run test:e2e
```

CI also keeps PostgreSQL migration and JavaScript syntax gates. The browser step uses the Chrome installation provided by the GitHub Actions runner and has a hard runtime bound.

## Safety and isolation

V22 adds no production test endpoint, provider credential, provider mock secret, or publishing bypass. Browser fixture credentials exist only in test code/runtime. The scheduler and both real execution gates remain disabled. The E2E suite cannot publish social content or send WhatsApp messages.

## Remaining browser coverage

V22 only closes the authentication/RBAC/Admin-user slice of `SR-P001`. The problem remains `PARTIAL` until real-browser coverage also exercises critical operator flows including:

- provider account connect/reconnect/disconnect UI;
- media upload/library reuse/deletion;
- V19 draft autosave, recovery, stale-revision conflict, reusable resources, per-platform overrides, compatibility, and previews;
- scheduling plus Queue/Calendar lifecycle actions;
- WhatsApp operator workflows;
- Operations Center;
- V20 Analytics.

Live provider verification remains separately tracked because deterministic browser CI cannot substitute for approved provider applications, real credentials, production callbacks, or provider-side delivery/metric evidence.
