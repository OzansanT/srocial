# V11 Authentication, Authorization, and Request Limiting Design

## Goal

Close Srocial's current public-exposure gap by adding a small application authentication boundary around the dashboard and management APIs while preserving provider-readable media and OAuth callback behavior.

## Scope

V11 adds:

- one administrator login configured through server environment variables;
- signed, expiring, HttpOnly session cookies;
- server-side authorization for dashboard/static application content and management APIs;
- same-origin protection for authenticated state-changing requests;
- per-client API request limiting plus a stricter login-attempt limiter;
- login/logout/session endpoints and a minimal login page;
- safe configuration/documentation updates and regression tests.

V11 does **not** add database-backed users, multiple roles, invitations, password reset, email flows, external identity providers, or persistent session records.

## Security Boundary

The application has three route classes.

### Public routes

These must remain reachable without an Srocial application session:

- `GET /api/health`;
- `POST /api/auth/login`;
- `GET /login.html` plus the minimal assets required by the login page;
- `GET /api/oauth/:provider/callback` because Meta redirects into it before application code can choose browser navigation behavior;
- `GET|HEAD /media/:key` because provider APIs need to retrieve published media.

### Authenticated routes

Everything else in the dashboard/application surface requires a valid session, including:

- `/` and dashboard static assets;
- `GET /api/auth/session`;
- `POST /api/auth/logout`;
- dashboard/account/post/media management APIs;
- media upload/delete;
- OAuth start;
- all future management APIs by default.

Authorization is therefore default-deny: routes are public only when explicitly allowlisted.

### OAuth callback

The provider callback remains public, but it does not become a general authorization bypass. Its existing one-time OAuth state validation, provider matching, encrypted credential handling, and sanitized redirect behavior remain unchanged. A successful browser callback may redirect to `/`; if the browser has no Srocial application session, `/` will redirect to the login page.

## Administrator Credentials

Configuration:

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

Rules:

- authentication is disabled by default to preserve existing local-development behavior;
- if `APP_AUTH_ENABLED=true`, startup must reject missing/weak `ADMIN_PASSWORD` or `SESSION_SECRET` configuration rather than silently expose the app;
- credentials are server-only and must never be returned, logged, committed, placed into HTML, or stored in browser storage;
- compare submitted credentials using constant-time comparison of fixed-length cryptographic digests;
- production documentation must require HTTPS when authentication is enabled outside loopback-only development.

Minimum configuration requirements when enabled:

- `ADMIN_USERNAME`: non-empty;
- `ADMIN_PASSWORD`: at least 12 characters;
- `SESSION_SECRET`: at least 32 characters.

## Session Format

Use a stateless signed cookie so V11 does not add a session table.

Cookie name:

```text
srocial_session
```

Payload fields:

```json
{
  "sub": "admin",
  "iat": 1789120000,
  "exp": 1789148800
}
```

Encoding:

1. JSON payload -> base64url;
2. HMAC-SHA-256 over the encoded payload using `SESSION_SECRET`;
3. cookie value: `<payload>.<signature>`.

Verification checks signature, subject, issued/expiry values, and current time. Invalid, malformed, or expired cookies are treated as unauthenticated without exposing verification details.

Cookie attributes:

- `HttpOnly`;
- `SameSite=Strict`;
- `Path=/`;
- `Max-Age=<SESSION_TTL_SECONDS>`;
- `Secure` when `PUBLIC_BASE_URL` uses HTTPS.

Logout expires the cookie immediately.

## Browser Login Flow

`GET /login.html` serves a dedicated minimal page.

`POST /api/auth/login` accepts:

```json
{
  "username": "admin",
  "password": "..."
}
```

Success:

- HTTP 200;
- sets the session cookie;
- returns only `{ "authenticated": true }`.

Failure:

- HTTP 401 with `{ "error": "invalid_credentials" }`;
- username/password correctness must not be distinguishable;
- login limiter failures return HTTP 429 and `Retry-After`.

`GET /api/auth/session` returns `{ "authenticated": true, "user": { "username": "admin" } }` for valid sessions.

`POST /api/auth/logout` requires authentication and same-origin mutation validation, then expires the cookie.

Unauthenticated browser navigation to protected static application content redirects with HTTP 303 to `/login.html`. Unauthenticated protected API requests return HTTP 401 JSON rather than redirecting.

## CSRF / Origin Protection

Because authentication uses an automatically attached cookie, authenticated mutation requests (`POST`, `PUT`, `PATCH`, `DELETE`) must pass same-origin checks.

For protected mutations:

- compare the request `Origin` header to the origin of `PUBLIC_BASE_URL` when `Origin` is present;
- if `Origin` is absent, accept only when `Sec-Fetch-Site` is absent or `same-origin`/`none`; this preserves non-browser/test/API-client compatibility without accepting explicit cross-site browser requests;
- reject explicit cross-origin requests with HTTP 403 `{ "error": "cross_site_request" }` before reading bodies or performing mutations.

Login is intentionally outside the authenticated CSRF gate but is protected by `SameSite=Strict` session cookies and the strict login rate limiter.

## Request Limiting

Use an in-memory fixed-window limiter because V11 is a single-process application boundary, not distributed abuse infrastructure.

Client key:

- use `request.socket.remoteAddress` only;
- do not trust `X-Forwarded-For` in V11 because proxy trust configuration is not yet explicit.

Buckets:

1. Login attempts: default 10 requests / 15 minutes per remote address.
2. Protected `/api/` requests: default 120 requests / 60 seconds per remote address.

Responses:

- HTTP 429;
- `{ "error": "rate_limited" }`;
- `Retry-After` in whole seconds;
- no secret/internal state exposure.

The limiter prunes expired client entries lazily to avoid unbounded growth. Public provider media retrieval is excluded to avoid breaking provider fetches.

## Module Boundaries

New modules:

```text
server/auth/app-auth-config.js      -> validate/read V11 auth environment configuration
server/auth/session-cookie.js       -> issue/verify/clear signed application sessions
server/auth/admin-authenticator.js  -> constant-time administrator credential validation
server/http/fixed-window-limiter.js -> generic in-memory request limiter
server/http/request-origin.js       -> same-origin mutation validation
client/login.html                   -> login document
client/css/pages/login.css          -> login-only layout/styles
client/js/pages/login.js            -> login form behavior via dedicated auth API module
client/js/api/auth-api.js           -> login/session/logout requests
```

`server/app.js` remains an HTTP coordinator. It receives an optional `appAuth` dependency and applies public-route classification, session authorization, origin checks, and limiter results before existing route business logic.

`server/server.js` constructs the auth subsystem from environment values and passes it into `createRequestHandler()`.

## Backward Compatibility

When `APP_AUTH_ENABLED` is absent or false:

- current V10 routing behavior remains unchanged;
- no session cookie is required;
- existing tests and local-development startup continue to work;
- rate limiting/auth routes may exist, but protection is disabled.

When authentication is enabled, public exposure is no longer permitted without the configured administrator credentials.

## Error Handling

Safe application-auth errors:

```text
401 unauthorized
401 invalid_credentials
403 cross_site_request
429 rate_limited
503 auth_not_configured
```

Never return raw session verification errors, credential values, HMAC material, stack traces, or environment contents.

## Testing

TDD coverage will include:

- auth configuration validation and disabled defaults;
- session issue/verify/expiry/tamper/clear behavior;
- constant-time credential success/failure behavior;
- fixed-window limiter allowance/reset/retry timing;
- same-origin request classification;
- unauthenticated API 401 and browser redirect;
- public health/OAuth callback/provider media exceptions;
- login success/failure/429 behavior;
- cookie attributes including HTTPS `Secure` behavior;
- authenticated API access;
- cross-site mutation rejection;
- logout cookie expiration;
- disabled-auth V10 compatibility;
- login UI/API module presence and no browser credential storage.

Full CI remains PostgreSQL 17 + migrations + `npm test` + JavaScript syntax checks.

## Documentation

Update `.env.example`, `README.md`, and `HOW_TO_RUN.md` to describe:

- V11 status;
- default-off local behavior;
- required secrets and minimum lengths;
- login flow;
- public/protected routes;
- HTTPS requirement;
- rate-limit defaults and single-process scope;
- next roadmap priorities after authentication.