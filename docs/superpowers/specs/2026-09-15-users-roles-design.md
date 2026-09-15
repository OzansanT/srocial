# V21 Users, Roles & Multi-user Security Design

## Goal

Implement source-roadmap item 100: database-backed application users and role-based authorization for Srocial, replacing the current single-environment-admin runtime boundary without changing provider OAuth identities or scheduler execution semantics.

## Scope

V21 adds four application roles:

- `ADMIN` — full management access including user administration.
- `MANAGER` — operational administration across social accounts, publishing, analytics refresh, media, WhatsApp, and lifecycle actions, but no application-user administration.
- `EDITOR` — the source roadmap's Creator/Editor role; can create and manage content, drafts, media uploads, and post lifecycle actions, but cannot manage connected provider accounts, WhatsApp administration, analytics refresh, or users.
- `VIEWER` — read-only access to authenticated dashboard/reporting/queue/account/media/WhatsApp surfaces.

The feature does not add invitations, email delivery, password-reset email, SSO/OIDC, organization tenancy, or distributed rate limiting. Those are separate product/security extensions.

## Compatibility and deployment boundary

`APP_AUTH_ENABLED=false` remains the default so local development behavior stays compatible with the current application.

When authentication is enabled:

1. Srocial requires the existing strong `ADMIN_PASSWORD`, `SESSION_SECRET`, and HTTPS-outside-loopback checks.
2. After the repository is initialized, if there are no application users, Srocial creates one `ADMIN` user from `ADMIN_USERNAME` / `ADMIN_PASSWORD`.
3. After at least one user exists, login is repository-backed. Environment credentials are no longer a parallel authentication bypass.
4. The service prevents disabling or demoting the last active administrator.
5. Existing pre-V21 self-contained signed session cookies become invalid and users must sign in again.

## Identity model

Application users are separate from social-provider accounts.

A user record contains:

```text
id
username
usernameNormalized
displayName
role
status              ACTIVE | DISABLED
passwordHash
createdAt
updatedAt
```

Usernames are normalized to lowercase for uniqueness and must match `[a-z0-9._-]{3,64}` after trimming/lowercasing. Display names are optional and capped at 100 characters. Passwords are 12–200 characters.

Passwords are hashed with Node's built-in `crypto.scrypt` using a per-password cryptographically random salt. Stored hashes use a versioned application format and password verification uses constant-time comparison. Plaintext passwords are never persisted, logged, returned by APIs, or placed in browser storage.

## Session model

V21 changes the application session from a self-contained username claim to a revocable opaque token.

The browser cookie contains a random high-entropy token. The repository stores only an HMAC-SHA-256 token hash using `SESSION_SECRET` plus:

```text
id
userId
tokenHash
createdAt
expiresAt
revokedAt
```

The cookie remains `HttpOnly`, `SameSite=Strict`, `Path=/`, receives `Secure` under HTTPS, and keeps the configured `SESSION_TTL_SECONDS`.

Authentication of a protected request is:

1. read the opaque cookie token;
2. hash it with `SESSION_SECRET`;
3. load the active, unexpired, non-revoked session;
4. load the linked user;
5. reject disabled or missing users;
6. return a safe session identity `{ id, username, displayName, role }`.

Logout revokes the current repository session before clearing the cookie. Administrators can revoke all sessions for another user. Password changes and disabling a user also revoke that user's sessions.

## RBAC policy

Authorization is centralized in `server/auth/authorization-policy.js`; route handlers do not duplicate role comparisons.

Role rank is:

```text
VIEWER < EDITOR < MANAGER < ADMIN
```

The policy applies after authentication and before protected route business logic.

### Viewer

May use authenticated read-only routes, including Dashboard, Operations, Analytics reports, Queue/Post listing, Accounts listing, Media listing, Composer resources/drafts reads, and WhatsApp reads.

### Editor

Includes Viewer and may mutate content/editorial state:

- create/update drafts and reusable composer resources;
- run compatibility checks;
- upload media;
- create/edit/reschedule/cancel/duplicate/retry/bulk-manage social posts/publications.

Media deletion is Manager+ because deleting shared assets is operational administration.

### Manager

Includes Editor and may:

- connect/reconnect/disconnect social provider accounts;
- refresh analytics;
- delete media;
- create/update WhatsApp contacts and consent;
- synchronize WhatsApp templates;
- create WhatsApp campaigns.

### Admin

Includes Manager and exclusively may list/create/update application users, change roles/status/passwords, and revoke another user's sessions.

Unknown protected management routes remain subject to authentication. API mutations that are not explicitly classified fail closed at `ADMIN` rather than inheriting broad mutation access.

## User-management API

Protected Admin-only endpoints:

```text
GET    /api/users
POST   /api/users
PATCH  /api/users/:id
POST   /api/users/:id/password
POST   /api/users/:id/sessions/revoke
```

Safe user responses never include `passwordHash` or session-token material.

`PATCH /api/users/:id` supports `displayName`, `role`, and `status`. Username changes are intentionally excluded in V21 to avoid identity/audit ambiguity.

The service rejects:

- duplicate normalized usernames;
- invalid roles/status;
- weak/oversized passwords;
- disabling or demoting the last active admin;
- self-disable or self-demotion requests;
- user/session operations for unknown IDs.

## Repository changes

### JSON

Add `users` and `userSessions` collections to the canonical JSON state with legacy-file fallback to empty arrays. Repository methods provide create/read/list/update users; normalized-username lookup; create/get/revoke sessions; and bulk session revocation by user.

### PostgreSQL

Migration `009_users_roles.sql` adds:

- `app_users` with normalized-username uniqueness and role/status checks;
- `app_user_sessions` with unique token hashes, expiry/revocation fields, user foreign key, and lookup indexes.

Repository methods mirror the JSON contract. Session lookup joins the user record so disabled users fail closed without trusting stale cookie claims.

## Authentication service

`createAppAuth` becomes repository-backed while retaining rate limiting and same-origin mutation protection. Its externally used contract is:

```text
initialize()
consumeLogin(request)
login(credentials) -> async result
readSession(request) -> async safe identity or null
logout(request/session) -> async cookie result
consumeApi(request)
validateMutation(request)
```

Initialization bootstraps the first admin only when auth is enabled and `listUsers()` is empty.

## UI

Add a Users navigation item and Users page module. The UI is rendered only for an authenticated `ADMIN` session and uses a dedicated `users-api.js` module.

The page supports:

- list users;
- create user with username/display name/role/password;
- change role/status/display name;
- set a new password;
- revoke a user's sessions.

User-supplied values are rendered with DOM APIs, never dynamic `innerHTML`. Non-admin sessions do not receive functional user-management controls; the backend remains authoritative regardless of UI visibility.

## Error handling

Authentication/authorization errors are sanitized:

```text
401 unauthorized
403 forbidden
400 validation_error
404 not_found
409 username_conflict
409 last_admin_required
409 self_lockout_forbidden
```

Login always returns `invalid_credentials` for wrong username, wrong password, disabled user, or missing user, avoiding account-existence disclosure.

## Testing

V21 requires deterministic coverage for:

- password hashing/verification and plaintext non-persistence;
- JSON user/session persistence and legacy JSON compatibility;
- PostgreSQL migration, uniqueness, user/session round-trip, revocation, and disabled-user rejection;
- first-admin bootstrap without a permanent environment bypass;
- login/session/logout/revocation behavior;
- role authorization matrix across representative Viewer/Editor/Manager/Admin routes;
- last-admin and self-lockout safeguards;
- safe user-management API payloads;
- Users UI module/API wiring and safe DOM behavior;
- regression of existing public routes, same-origin mutation checks, and rate limiting.

Browser E2E remains separately tracked in `SR-P001`; static/module/API tests do not close that verification gap.

## Problem-tracker impact

`SR-P006` remains `PARTIAL`, but its evidence must be updated: database-backed users, RBAC, and session revocation are completed in V21, while invitations/password-reset flows, external identity providers, trusted-proxy handling, and distributed/shared rate limiting remain intentionally outside this milestone.

No real-provider publishing behavior changes in V21.
