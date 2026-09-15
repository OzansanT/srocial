# V21 Users, Roles & Multi-user Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement source-roadmap item 100 with database-backed users, Admin/Manager/Editor/Viewer authorization, revocable sessions, safe admin bootstrap, and an Admin-only Users UI.

**Architecture:** Add focused auth-domain modules for password hashing, role policy, user service, and repository-backed sessions. Extend JSON/PostgreSQL repositories with matching user/session contracts, then apply authorization centrally in `server/app.js` before route business logic. Preserve the existing opt-in authentication setting and bootstrap the first repository admin from environment credentials only when no users exist.

**Tech Stack:** Node.js built-ins (`crypto`, HTTP), vanilla JS/CSS, JSON persistence, PostgreSQL 17, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-15-users-roles-design.md`

## Global Constraints

- `APP_AUTH_ENABLED=false` remains the default.
- Roles are exactly `ADMIN`, `MANAGER`, `EDITOR`, `VIEWER`; UI may label `EDITOR` as Creator/Editor.
- Passwords are 12–200 characters and hashed with Node `crypto.scrypt` plus per-password random salt.
- Browser session cookies are opaque; repository stores only an HMAC-SHA-256 token hash keyed by `SESSION_SECRET`.
- Existing public health/OAuth callback/provider webhook/media-read routes remain public at the app-session layer.
- Unknown protected API mutations fail closed to `ADMIN`.
- No invitation, email reset, SSO/OIDC, tenancy, trusted-proxy, or distributed-rate-limiter subsystem in V21.
- Safe DOM rendering only; no user-controlled `innerHTML`.

---

### Task 1: Password and authorization primitives

**Files:**
- Create: `server/auth/password-hash.js`
- Create: `server/auth/roles.js`
- Create: `server/auth/authorization-policy.js`
- Test: `tests/user-auth-primitives.test.js`

**Interfaces:**
- `hashPassword(password) -> Promise<string>`
- `verifyPassword(password, encodedHash) -> Promise<boolean>`
- `normalizeRole(role) -> ADMIN|MANAGER|EDITOR|VIEWER`
- `roleAtLeast(actual, required) -> boolean`
- `requiredRoleForRequest(method, pathname) -> role`

- [ ] Write RED tests covering password round-trip, randomized salts, invalid hashes, role ordering, and representative route classifications.
- [ ] Run `npm test -- tests/user-auth-primitives.test.js` and confirm failures are missing-module/behavior failures.
- [ ] Implement versioned scrypt storage (`scrypt$v1$<salt>$<digest>`), constant-time verification, role normalization/ranking, and explicit route classification.
- [ ] Re-run the focused tests until green.
- [ ] Commit the focused primitive change.

### Task 2: JSON/PostgreSQL user and session persistence

**Files:**
- Create: `server/db/json-users.js`
- Create: `server/db/postgres-users.js`
- Create: `server/db/migrations/009_users_roles.sql`
- Modify: `server/db/json-repository.js`
- Modify: `server/db/postgres-repository.js`
- Test: `tests/user-repository.test.js`
- Test: `tests/postgres-user-repository.test.js`

**Interfaces:**
- `createUser(record)`
- `updateUser(id, patch)`
- `getUser(id)`
- `findUserByUsernameNormalized(usernameNormalized)`
- `listUsers()`
- `createUserSession(record)`
- `findUserSessionByTokenHash(tokenHash)`
- `revokeUserSession(id, { revokedAt })`
- `revokeUserSessionsForUser(userId, { revokedAt })`

- [ ] Add RED JSON tests for persisted users/sessions, normalized lookup, defensive copies, revocation, and loading a legacy JSON file with no V21 arrays.
- [ ] Add RED PostgreSQL tests for migration tables/check constraints/unique username and user/session round-trip/revocation.
- [ ] Run focused tests and confirm they fail before implementation.
- [ ] Implement JSON repository parity via a focused mixin and add `users` / `userSessions` to canonical/legacy state loading.
- [ ] Implement migration 009 with `app_users` and `app_user_sessions`, role/status checks, normalized-username uniqueness, session hash uniqueness, user FK, and session lookup/expiry indexes.
- [ ] Implement PostgreSQL parity via `postgres-users.js` and wire it into the main repository.
- [ ] Re-run focused repository/migration tests until green.
- [ ] Commit persistence + migration.

### Task 3: Repository-backed authentication and revocable sessions

**Files:**
- Create: `server/auth/user-service.js`
- Create: `server/auth/repository-session-manager.js`
- Modify: `server/auth/create-app-auth.js`
- Modify: `server/server.js`
- Modify: `server/auth/app-auth-config.js` only if compatibility text/config shape requires it.
- Test: `tests/multi-user-auth.test.js`
- Update: existing `tests/app-auth-api.test.js`, `tests/app-auth-config.test.js`, `tests/session-cookie.test.js` as required by the new session contract.

**Interfaces:**
- `createUserService({ repository, now })`
- `ensureBootstrapAdmin({ username, password })`
- `authenticate(username, password) -> safe user|null`
- `createRepositorySessionManager({ repository, secret, ttlSeconds, secure, now })`
- `issue(userId) -> Promise<{ cookie, sessionId }>`
- `read(cookieHeader) -> Promise<{ sessionId, user }|null>`
- `revoke(sessionId) -> Promise<void>`
- `createAppAuth(...).initialize/login/readSession/logout`

- [ ] Add RED tests proving first-run admin bootstrap, repository login, no environment bypass once a user exists, disabled-user denial, opaque-cookie/session-hash storage, logout revocation, and session invalidation after user disable/password change.
- [ ] Implement `user-service.js` validation/safe serialization and bootstrap logic.
- [ ] Implement opaque random session cookies whose HMAC token hash is the only persisted credential material.
- [ ] Refactor `createAppAuth` to use async repository-backed authentication while preserving limiter and same-origin contracts.
- [ ] Reorder `server/server.js` startup so repository initialization precedes auth bootstrap.
- [ ] Update auth regression tests and run all auth-focused tests until green.
- [ ] Commit repository-backed auth.

### Task 4: User administration service and protected API

**Files:**
- Create: `server/services/user-management-service.js`
- Create: `server/routes/users.js`
- Modify: `server/app.js`
- Test: `tests/users-api.test.js`
- Test: `tests/rbac-api.test.js`

**Interfaces:**
- `listUsers()` safe records only
- `createUser(input, actor)`
- `updateUser(id, patch, actor)`
- `setPassword(id, password, actor)`
- `revokeSessions(id, actor)`
- `authorizeSessionForRequest(session, method, pathname)`

- [ ] Add RED user API tests for list/create/update/password/revoke routes and sanitized payloads.
- [ ] Add RED RBAC matrix tests: Viewer read-only; Editor content mutations; Manager account/analytics/WhatsApp/admin-media mutations; Admin user routes; forbidden lower-role attempts return 403 before downstream work.
- [ ] Add RED safety tests for duplicate username, invalid role/status/password, self-disable/self-demotion, and last-active-admin protection.
- [ ] Implement user-management service and routes with centralized authorization before route business logic.
- [ ] Ensure `/api/auth/session` returns safe `{ id, username, displayName, role }`; logout revokes the active repository session.
- [ ] Run API/RBAC tests and the full existing auth/public-route suite until green.
- [ ] Commit API/RBAC behavior.

### Task 5: Admin Users browser surface

**Files:**
- Create: `client/js/api/users-api.js`
- Create: `client/js/pages/users.js`
- Create: `client/css/pages/users.css`
- Modify: `client/index.html`
- Modify: `client/js/app.js`
- Modify: `client/js/api/auth-api.js` only if safe session helpers are needed.
- Test: `tests/users-ui.test.js`
- Update: `tests/auth-ui.test.js`

**Interfaces:**
- `listUsers/createUser/updateUser/setUserPassword/revokeUserSessions`
- `initUsersPage({ session })`

- [ ] Add RED static/module tests for Users nav/panel, dedicated API module, Admin-only initialization, create/edit/password/revoke controls, and no dynamic `innerHTML`.
- [ ] Implement the API module and safe-DOM Users page.
- [ ] Wire session-aware Admin visibility and page initialization into the app entrypoint.
- [ ] Add responsive page CSS using existing tokens/components.
- [ ] Run UI/auth tests until green.
- [ ] Commit Users UI.

### Task 6: Documentation, problem tracking, and release verification

**Files:**
- Create: `docs/V21_USERS_ROLES.md`
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `HOW_TO_RUN.md`
- Modify: `PROBLEMS.md`

**Interfaces:** none; release documentation must match runtime behavior.

- [ ] Document role capabilities, first-admin bootstrap, session revocation, user API/UI, migration 009, and deployment assumptions.
- [ ] Update `SR-P006` evidence to record completed database users/RBAC/revocation while keeping distributed rate limiting/trusted-proxy/invitation/reset/IdP work explicit as remaining `PARTIAL` scope.
- [ ] Extend `SR-P001` browser-E2E wording to include Users/RBAC flows.
- [ ] Run full CI on the exact feature head: PostgreSQL migrations through 009, full `npm test`, and JavaScript syntax checks.
- [ ] Review the complete branch diff for secrets, unrelated changes, authorization bypasses, plaintext passwords, stale session claims, and unsafe DOM rendering.
- [ ] Open a PR against the unchanged `main`, require PR-triggered CI green, squash-merge with expected head SHA, then require push-triggered CI green on the exact merged `main` SHA.
