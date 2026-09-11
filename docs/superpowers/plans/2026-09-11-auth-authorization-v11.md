# V11 Authentication and Authorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in single-admin application authentication boundary, protected management APIs, same-origin mutation checks, and in-memory request limiting without changing provider-public media retrieval or the existing OAuth callback contract.

**Architecture:** Compose small server-side auth primitives under `server/auth/` and `server/http/`, then inject one `appAuth` boundary into the existing HTTP request handler. Authentication remains disabled by default for V10-compatible local development; when enabled, the server validates administrator/session configuration before listening. The browser receives only an HttpOnly signed session cookie and safe authentication status.

**Tech Stack:** Node.js >= 20 built-ins (`node:crypto`, built-in HTTP), vanilla HTML/CSS/ES modules, existing `pg` dependency unchanged.

**Spec:** `docs/superpowers/specs/2026-09-11-auth-authorization-v11-design.md`

## Global Constraints

- `APP_AUTH_ENABLED=false` remains the default.
- When enabled, `ADMIN_PASSWORD` must be at least 12 characters and `SESSION_SECRET` at least 32 characters.
- No credentials, session secret, raw cookie signatures, provider secrets, or database secrets may be logged or returned.
- Session cookie name is `srocial_session`; it is `HttpOnly`, `SameSite=Strict`, `Path=/`, expiring, and `Secure` for HTTPS `PUBLIC_BASE_URL`.
- `GET /api/health`, `POST /api/auth/login`, provider OAuth callbacks, login-page assets, and `GET|HEAD /media/:key` remain public.
- All other dashboard/static application content and management APIs are protected when auth is enabled.
- Protected browser mutations reject explicit cross-origin requests before reading bodies or mutating state.
- Client rate-limit keys use `request.socket.remoteAddress`; V11 does not trust `X-Forwarded-For`.
- No database user/session tables, RBAC, password-reset, email, or third-party identity provider work is included.
- Follow `updaterules.md`: modules remain responsibility-focused, API calls stay in API modules, no inline JS/CSS, no framework additions.

---

### Task 1: Auth Configuration, Credentials, Sessions, Origin Checks, and Limiter

**Files:**
- Create: `server/auth/app-auth-config.js`
- Create: `server/auth/admin-authenticator.js`
- Create: `server/auth/session-cookie.js`
- Create: `server/http/fixed-window-limiter.js`
- Create: `server/http/request-origin.js`
- Test: `tests/app-auth-config.test.js`
- Test: `tests/admin-authenticator.test.js`
- Test: `tests/session-cookie.test.js`
- Test: `tests/fixed-window-limiter.test.js`
- Test: `tests/request-origin.test.js`

**Interfaces:**
- `readAppAuthConfig(env)` -> `{ enabled, username, password, sessionSecret, sessionTtlSeconds, secureCookies, publicOrigin, apiRateLimit, loginRateLimit }`.
- `createAdminAuthenticator({ username, password })` -> `{ authenticate(username, password): boolean }` using constant-time fixed-length digest comparison.
- `createSessionCookieManager({ secret, ttlSeconds, secure, now })` -> `{ issue(username), read(cookieHeader), clear() }` where `issue/clear` return complete `Set-Cookie` values and `read` returns `{ username } | null`.
- `createFixedWindowLimiter({ windowMs, max, now })` -> `{ consume(key): { allowed, retryAfterSeconds, remaining }, reset(key) }`.
- `isSameOriginMutation(request, publicOrigin)` -> boolean.

- [ ] **Step 1: Write failing configuration tests**

Cover disabled defaults, enabled missing-password rejection, password minimum length, session-secret minimum length, numeric limit parsing, HTTPS secure-cookie selection, and invalid `PUBLIC_BASE_URL` rejection.

Example expectation:

```js
assert.throws(
  () => readAppAuthConfig({ APP_AUTH_ENABLED: 'true', ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'short', SESSION_SECRET: 'x'.repeat(32), PUBLIC_BASE_URL: 'https://example.com' }),
  { code: 'APP_AUTH_PASSWORD_WEAK' }
);
```

- [ ] **Step 2: Write failing credential/session tests**

Assert correct credentials pass, username/password failures return only false, signed cookies round-trip, tampering and expiry fail closed, HTTPS cookies contain `Secure`, HTTP cookies do not, and `clear()` expires the cookie.

- [ ] **Step 3: Write failing limiter/origin tests**

Assert `max` requests pass, the next returns `allowed:false` with positive retry seconds, expiry resets the bucket, explicit foreign `Origin` fails, matching origin passes, `Sec-Fetch-Site: cross-site` fails when `Origin` is absent, and absent browser metadata remains compatible.

- [ ] **Step 4: Push the tests and confirm the red CI baseline**

Expected: existing V10 tests remain green; only missing V11 module imports/contracts fail.

- [ ] **Step 5: Implement the five focused modules**

Use `createHash('sha256')` + `timingSafeEqual()` for fixed-length credential comparison and `createHmac('sha256')` for session signatures. Parse cookies without decoding arbitrary application state beyond the signed base64url payload. Reject malformed payloads and non-finite `iat`/`exp` values.

- [ ] **Step 6: Run branch CI and require the primitive test group to turn green**

Expected: all primitive V11 tests pass with no regression in V10 tests.

- [ ] **Step 7: Commit the green primitive implementation**

Commit message:

```text
feat: add V11 auth security primitives
```

---

### Task 2: Application Auth Composition and Protected HTTP Boundary

**Files:**
- Create: `server/auth/create-app-auth.js`
- Modify: `server/app.js`
- Modify: `server/server.js`
- Test: `tests/app-auth-api.test.js`
- Modify: `tests/server.test.js`
- Modify as needed: existing API tests that explicitly exercise protected routes with auth enabled.

**Interfaces:**
- `createAppAuth({ env, now })` -> `{ enabled, login(request, credentials), readSession(request), issueLogoutCookie(), consumeApi(request), validateMutation(request), username }`.
- `createRequestHandler({ ..., appAuth })` keeps `appAuth` optional so disabled/default V10 tests remain compatible.

- [ ] **Step 1: Write failing HTTP auth tests**

Add cases for:

```text
GET /api/health                         -> 200 public
GET /                                  -> 303 /login.html when unauthenticated + auth enabled
GET /api/dashboard                     -> 401 JSON when unauthenticated
POST /api/auth/login bad credentials   -> 401 invalid_credentials
POST /api/auth/login valid credentials -> 200 + Set-Cookie
GET /api/auth/session with cookie      -> 200 authenticated admin metadata
POST protected API with valid cookie + foreign Origin -> 403 cross_site_request
POST /api/auth/logout with valid same-origin cookie    -> 200 + expired cookie
```

Also assert a public OAuth callback reaches existing callback handling without requiring a Srocial session and `GET|HEAD /media/:key` remains outside the auth gate.

- [ ] **Step 2: Write failing rate-limit HTTP tests**

Configure tiny limits through injected/auth test configuration. Assert repeated login attempts produce HTTP 429 with `Retry-After`, and protected API requests produce HTTP 429 after the configured limit without executing downstream route logic.

- [ ] **Step 3: Push the tests and confirm the red boundary**

Expected: failures are limited to missing `create-app-auth`/route-gate behavior.

- [ ] **Step 4: Implement `create-app-auth.js`**

Compose the Task 1 modules. Login limiter is consumed before credential verification. Successful login returns a session cookie without resetting the limiter. API limiter is consumed only for authenticated protected `/api/` requests. Use `request.socket?.remoteAddress ?? 'unknown'` as the limiter key.

- [ ] **Step 5: Integrate route classification into `server/app.js`**

Add pure helpers for:

```text
isPublicAuthAsset(pathname)
isPublicRoute(method, pathname)
isApiRequest(pathname)
isMutation(method)
```

Handle `POST /api/auth/login` before the protected-route gate. When auth is enabled:

1. allow explicit public routes;
2. otherwise require `appAuth.readSession(request)`;
3. return 401 JSON for protected API requests without a session;
4. redirect protected browser/static navigation to `/login.html`;
5. apply API limiter to authenticated protected `/api/` requests;
6. apply same-origin validation to protected mutation methods before body reads;
7. expose authenticated session/logout endpoints.

When auth is disabled, preserve V10 behavior.

- [ ] **Step 6: Wire validated auth configuration in `server/server.js`**

Construct `appAuth` before the server listens and pass it into `createRequestHandler`. Invalid enabled configuration must fail startup rather than falling back to disabled auth.

- [ ] **Step 7: Run CI until all HTTP/auth and legacy tests pass**

Expected: full server/API tests green; no OAuth/media regressions.

- [ ] **Step 8: Commit the green HTTP boundary**

Commit message:

```text
feat: protect dashboard and management APIs
```

---

### Task 3: Login UI and Dashboard Logout

**Files:**
- Create: `client/login.html`
- Create: `client/css/pages/login.css`
- Create: `client/js/api/auth-api.js`
- Create: `client/js/pages/login.js`
- Modify: `client/index.html`
- Modify: `client/js/app.js`
- Test: `tests/auth-ui.test.js`

**Interfaces:**
- `login(username, password)` -> authenticated payload using `requestJson('/api/auth/login', ...)`.
- `getSession()` -> safe session payload.
- `logout()` -> authenticated logout request.
- Login page assets explicitly join the public static allowlist: `/login.html`, `/css/pages/login.css`, `/js/api/client.js`, `/js/api/auth-api.js`, `/js/pages/login.js`.

- [ ] **Step 1: Write failing UI structure tests**

Assert login HTML has username/password labels, form and feedback target, no inline JS/CSS, and module script; assert `auth-api.js` uses the shared API client; assert dashboard contains a real logout button.

- [ ] **Step 2: Push and confirm red UI tests**

Expected: only missing login/auth UI files and logout integration fail.

- [ ] **Step 3: Implement login page and auth API module**

On successful login, `login.js` uses `window.location.replace('/')`. On 401 it renders `Invalid username or password.`; on 429 it renders a retry-later message; other errors use a generic safe message. Never persist username/password in localStorage/sessionStorage.

- [ ] **Step 4: Add dashboard logout action**

Add `#logout-session` as a secondary button near `#focus-composer`. In `client/js/app.js`, register a click handler that calls `logout()` and then `window.location.replace('/login.html')`; disable the button while the request is active.

- [ ] **Step 5: Run CI and commit the green UI**

Commit message:

```text
feat: add admin login and logout UI
```

---

### Task 4: Configuration and Operator Documentation

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `HOW_TO_RUN.md`

- [ ] **Step 1: Add V11 environment names without real secrets**

Add:

```text
APP_AUTH_ENABLED=false
ADMIN_USERNAME=admin
ADMIN_PASSWORD=
SESSION_SECRET=
SESSION_TTL_SECONDS=28800
API_RATE_LIMIT_WINDOW_MS=60000
API_RATE_LIMIT_MAX=120
LOGIN_RATE_LIMIT_WINDOW_MS=900000
LOGIN_RATE_LIMIT_MAX=10
```

- [ ] **Step 2: Update README current status to V11**

Document public/protected route classes, default-off compatibility, minimum secret lengths, HTTPS requirement outside loopback development, session behavior, rate-limit defaults, and the fact that media retrieval/OAuth callback remain public by design.

Move authentication/authorization/request limiting out of “Next priorities”; keep object storage/signature inspection/orphan cleanup as the next priority.

- [ ] **Step 3: Update beginner run guide**

Include a safe example showing how to set auth environment variables in Windows PowerShell and macOS/Linux shells without committing them. State that `ADMIN_PASSWORD` and `SESSION_SECRET` are examples the operator must replace.

- [ ] **Step 4: Commit documentation**

Commit message:

```text
docs: document V11 application authentication
```

---

### Task 5: Full Verification, Security Review, PR, and Merge

**Files:**
- Review all changed files from `main...build/auth-authorization-v11`.

- [ ] **Step 1: Run fresh branch CI on the exact final head**

Required successful commands from `.github/workflows/test.yml`:

```bash
npm install --ignore-scripts
npm run db:migrate
npm test
find server client tests -name '*.js' -print0 | xargs -0 -n1 node --check
```

- [ ] **Step 2: Security diff review**

Verify:

- no credential literals or real secrets;
- no auth secrets in HTML/client code/API responses/logs;
- login/session cookies use required attributes;
- public-route allowlist is narrow;
- OAuth callback and provider media remain reachable;
- uploads, deletes, posts, account changes, and OAuth start are protected;
- cross-site authenticated mutations fail before business logic/body processing;
- limiter does not trust forwarding headers;
- disabled auth preserves V10 local behavior;
- no unrelated provider/database changes.

- [ ] **Step 3: Open PR targeting `main`**

Title:

```text
feat: add application authentication boundary V11
```

PR body must summarize architecture, public exceptions, default-off compatibility, rate limits, CSRF/origin protection, verification evidence, and safety review.

- [ ] **Step 4: Require PR-triggered CI success and no unresolved review threads**

Do not merge if the reviewed head SHA changes after verification; rerun review/CI against the new head.

- [ ] **Step 5: Squash-merge the exact verified head**

Use expected head SHA protection.

- [ ] **Step 6: Verify the `main` push workflow for the squash merge commit**

Fetch GitHub Actions runs by merge `head_sha` and require `status=completed`, `conclusion=success` before reporting completion.