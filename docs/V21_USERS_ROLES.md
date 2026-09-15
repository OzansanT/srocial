# V21 — Users, Roles & Multi-user Security

## Source roadmap scope

V21 closes source roadmap item **100 — Users / Roles**. The source-defined access levels are implemented as:

- `ADMIN`
- `MANAGER`
- `EDITOR` — the source's Creator/Editor role
- `VIEWER`

This milestone deliberately does **not** add SSO, email invitations, password-reset email, external identity providers, or multi-tenant organizations.

## Role model

| Role | Effective access |
| --- | --- |
| Viewer | Authenticated read-only application access. |
| Editor | Viewer access plus social/composer content mutations and media upload. |
| Manager | Editor access plus provider account/OAuth administration, media deletion, WhatsApp operations, and analytics refresh. |
| Admin | Manager access plus application-user administration and fail-closed access to otherwise unclassified protected mutations. |

The server is authoritative. Hidden browser controls are usability only; every protected API request is classified and checked at the authenticated HTTP boundary.

## Persistence

Migration `009_users_roles.sql` adds:

- `app_users`
- `app_user_sessions`

JSON storage exposes the same user/session contract for local development and backward-compatible deployments.

Passwords are stored only as salted Node `scrypt` hashes. Raw passwords are never returned by user-management APIs.

Session cookies contain opaque random tokens. Persistence stores only the derived token hash, not the raw browser token. Sessions can be revoked individually or per user.

## Bootstrap and login migration

`APP_AUTH_ENABLED=false` remains the compatibility/default mode.

When application authentication is enabled and the persistent user store is empty, the existing `ADMIN_USERNAME` / `ADMIN_PASSWORD` configuration is used once to create the first Admin. After any persistent user exists, those environment credentials are **not** a parallel login bypass; login is repository-backed.

The configured session secret and secure-origin requirements remain enforced by the existing auth configuration.

## Live authorization behavior

For every authenticated request, Srocial resolves the persisted session and current user again. Therefore:

- disabling a user invalidates access immediately;
- role changes affect the next request/session check without waiting for cookie expiry;
- password rotation revokes that user's existing sessions;
- explicit session revocation takes effect immediately;
- logout revokes the persisted session and clears the browser cookie.

Cross-site mutation protection and application rate limiting run before protected mutations execute.

## Admin user management

Admin-only APIs:

- `GET /api/users`
- `POST /api/users`
- `PATCH /api/users/:id`
- `POST /api/users/:id/password`
- `POST /api/users/:id/sessions/revoke`

The Admin Users dashboard supports:

- create user;
- assign Viewer / Editor / Manager / Admin;
- update display name and role;
- enable/disable access;
- change password;
- revoke active sessions.

User-facing responses intentionally exclude password hashes and normalized internal identity fields.

## Administrator continuity safeguards

Srocial refuses an administrator's attempt to demote or disable their own current Admin account.

The last-active-Admin invariant is storage-authoritative and concurrency-safe:

- JSON uses the repository's serialized mutation queue, so a concurrent demotion observes the prior committed mutation.
- PostgreSQL uses a transaction-scoped advisory lock plus `SELECT ... FOR UPDATE` before evaluating and writing an Admin-lowering mutation.

Two simultaneous attempts to demote the final two active Admins therefore cannot both commit. One succeeds and the other fails with `LAST_ADMIN_FORBIDDEN`.

## Security boundaries retained

The following remain intentionally public where required by the existing architecture:

- health endpoint;
- login assets/login request;
- provider OAuth callbacks;
- signed provider webhooks;
- provider-facing media delivery paths.

V21 does not change scheduler or provider execution safety gates:

- `SCHEDULER_ENABLED=false`
- `ALLOW_REAL_PUBLISH=false`
- `ALLOW_REAL_WHATSAPP=false`

## TDD / CI evidence

V21 was developed through explicit RED/GREEN slices:

| Gate | Evidence |
| --- | --- |
| Persisted auth/session GREEN | run `34960358533` — 432/432 tests, migration 009, syntax green. |
| RBAC RED | run `34960546803` — 432 existing tests passed; exactly 8 intended new RBAC/user-management failures. |
| RBAC backend GREEN | run `34961481304` — 440/440 tests, migrations through 009, syntax green. |
| Users UI RED | run `34961743270` — 440 existing tests passed; exactly 4 intended browser-contract failures. |
| Users UI GREEN | run `34962160731` — 444/444 tests, migrations through 009, syntax green. |
| Admin-continuity RED | run `34962460888` — 444 existing tests passed; exactly 2 intended atomic-repository failures. |
| Admin-continuity GREEN | run `34962708457` — **446/446 tests**, PostgreSQL 17 migrations through 009, JavaScript syntax green. |

## Remaining production-readiness gaps

V21 closes the source-defined users/roles feature, but it does not close unrelated verification/deployment gaps.

- `SR-P001` remains `VERIFY`: there is still no real browser/E2E suite, including multi-role browser flows.
- `SR-P006` remains `PARTIAL`: the fixed-window rate limiter is process-local and forwarded proxy identity is deliberately not trusted. A shared limiter + explicit trusted-proxy model is required before multi-instance/proxy-fronted production deployment.
- Live TikTok, Meta webhook, WhatsApp, and analytics-provider verification remain tracked separately in `PROBLEMS.md`.
- Legacy platform-only account-unbound scheduling remains separately tracked as `SR-P007`.

## Roadmap position after V21

Source roadmap item 100 is the final major source-defined product feature. After V21, development should move from adding roadmap features to production-readiness work, led by browser E2E coverage and the unresolved items in `PROBLEMS.md` rather than inventing another source feature.
