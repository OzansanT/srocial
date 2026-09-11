# V14 Facebook Pages + Threads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Facebook Pages and Threads OAuth/publishing adapters, connect controls, documentation, and full regression coverage.

**Architecture:** Preserve Srocial's existing provider-neutral OAuth service and scheduler. Add isolated provider modules that normalize Meta-specific authentication, publishing, processing, and errors into existing account/publication contracts; runtime registration and Accounts UI are the only cross-provider integration points.

**Tech Stack:** Node.js ESM, native `fetch`, vanilla browser JavaScript, `node:test`, existing JSON/PostgreSQL repositories and scheduler.

**Spec:** `docs/superpowers/specs/2026-09-11-meta-provider-adapters-v14-design.md`

## Global Constraints

- One backend, one scheduler, one canonical data model, isolated provider adapters.
- No browser automation or unofficial posting endpoints.
- Provider credentials and tokens are server-only and encrypted through existing account persistence.
- No real provider calls in automated tests; inject `fetchImpl`/client fakes.
- Default API versions: Facebook `v26.0`, Threads `v1.0`.
- Facebook Page selection must never silently pick among multiple Pages.
- V14 supports Facebook text/image/Reel and Threads text/image/video; carousel remains out of scope.
- Preserve existing Instagram behavior and generic OAuth/scheduler interfaces.

---

### Task 1: Write RED provider contract tests

**Files:**
- Create: `tests/facebook-config.test.js`
- Create: `tests/facebook-auth.test.js`
- Create: `tests/facebook-client.test.js`
- Create: `tests/facebook-publish.test.js`
- Create: `tests/facebook-registration.test.js`
- Create: `tests/threads-config.test.js`
- Create: `tests/threads-auth.test.js`
- Create: `tests/threads-client.test.js`
- Create: `tests/threads-publish.test.js`
- Create: `tests/threads-registration.test.js`
- Modify: `tests/accounts-ui.test.js`

**Interfaces:**
- Facebook modules export `getFacebookConfig`, `FACEBOOK_SCOPES`, `createFacebookClient`, `createFacebookOAuthProvider`, `createFacebookPublishingAdapter`, `registerFacebookProvider`.
- Threads modules export `getThreadsConfig`, `THREADS_SCOPES`, `createThreadsClient`, `createThreadsOAuthProvider`, `createThreadsPublishingAdapter`, `registerThreadsProvider`.

- [ ] Write config tests for credential gating, version normalization, scope sets, and optional Facebook Page ID.
- [ ] Write OAuth tests for authorization URLs, token exchange, Facebook Page-token resolution/fail-closed selection, Threads long-lived exchange/refresh, and generic identity mapping.
- [ ] Write HTTP-client tests for URL construction, bearer/form requests, transport errors, authentication/permission/rate-limit mapping, and sanitized provider failures.
- [ ] Write publishing tests covering account binding, valid content/media normalization, Facebook feed/photo/Reel flows, Threads container/publish/status flows, processing states, and invalid media rejection before HTTP.
- [ ] Write registration tests proving unconfigured providers are absent and configured providers register both OAuth and publishing adapters with credential isolation.
- [ ] Change Accounts UI expectations so Instagram/Facebook/Threads reconnect, while TikTok remains disabled.
- [ ] Push the tests-only commit and verify GitHub Actions fails because the new provider modules do not exist. Do not accept unrelated failures as the RED state.

### Task 2: Implement Facebook Pages adapter

**Files:**
- Create: `server/platforms/facebook/config.js`
- Create: `server/platforms/facebook/client.js`
- Create: `server/platforms/facebook/auth.js`
- Create: `server/platforms/facebook/validator.js`
- Create: `server/platforms/facebook/publish.js`
- Create: `server/platforms/facebook/index.js`

**Interfaces:**
- `getFacebookConfig(env)` returns `null` unless app ID+secret exist; otherwise `{appId, appSecret, apiVersion, pageId, scopes}`.
- `createFacebookClient({fetchImpl, apiVersion})` exposes `getGraph`, `postGraph`, and `postHostedVideo`.
- OAuth provider exposes `getAuthorizationUrl`, `exchangeCode`, `getAccountIdentity`.
- Publishing adapter exposes `capabilities`, `validatePost`, `publish`, `getStatus`.

- [ ] Implement Facebook configuration and exact Page scopes.
- [ ] Implement Graph API client with form encoding and stable Srocial error mapping.
- [ ] Implement OAuth code exchange, long-lived User token exchange, managed Page discovery, configured/unique Page selection, and Page-token identity lookup.
- [ ] Implement validator allowing text-only or one HTTPS image/video.
- [ ] Implement feed and photo publishing as immediate `PUBLISHED` results.
- [ ] Implement hosted Reel start/upload/finish flow and normalized processing/status handling.
- [ ] Implement encrypted-account credential resolution and provider registration without exposing tokens.
- [ ] Run only Facebook tests; all must pass.

### Task 3: Implement Threads adapter

**Files:**
- Create: `server/platforms/threads/config.js`
- Create: `server/platforms/threads/client.js`
- Create: `server/platforms/threads/auth.js`
- Create: `server/platforms/threads/validator.js`
- Create: `server/platforms/threads/publish.js`
- Create: `server/platforms/threads/index.js`

**Interfaces:**
- `getThreadsConfig(env)` returns `null` unless app ID+secret exist; otherwise `{appId, appSecret, apiVersion, scopes}`.
- `createThreadsClient({fetchImpl, apiVersion})` exposes `formPost`, `getGraph`, and `postGraph` against `graph.threads.net`.
- OAuth provider exposes `getAuthorizationUrl`, `exchangeCode`, `refreshAccessToken`, `getAccountIdentity`.
- Publishing adapter exposes `capabilities`, `validatePost`, `publish`, `getStatus`.

- [ ] Implement Threads configuration/scopes.
- [ ] Implement Threads HTTP client and provider error normalization.
- [ ] Implement authorization, short/long-lived token exchange, long-lived refresh, expiry normalization, and `/me` identity mapping.
- [ ] Implement text/image/video validator with HTTPS media enforcement.
- [ ] Implement container creation; publish `FINISHED`, return `PROCESSING` for `IN_PROGRESS`, and safely fail `ERROR`/`EXPIRED`.
- [ ] Implement encrypted-account credential resolution and provider registration.
- [ ] Run only Threads tests; all must pass.

### Task 4: Wire runtime and browser account controls

**Files:**
- Modify: `server/server.js`
- Modify: `client/js/pages/accounts.js`
- Modify: `client/index.html`

**Interfaces:**
- Runtime calls `registerFacebookProvider(...)` and `registerThreadsProvider(...)` beside Instagram registration.
- Accounts page uses the existing generic `startOAuth(provider)` API for all enabled providers.

- [ ] Register both providers with the existing OAuth/platform registries using the same repository/cipher/fetch boundaries as Instagram.
- [ ] Enable Facebook and Threads in `OAUTH_ENABLED_PROVIDERS`.
- [ ] Bind dedicated Connect Facebook and Connect Threads buttons through one generic provider-button loop.
- [ ] Keep TikTok disabled until its provider release.
- [ ] Run Accounts UI, OAuth service, scheduler/publication worker, and server tests.

### Task 5: Document V14 and verify the release

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Create: `docs/V14_META_PROVIDERS.md`

**Interfaces:**
- Environment exposes Facebook/Threads app settings only on the server.
- README supported-channel table and roadmap reflect V14 completion and TikTok as next.

- [ ] Document configuration, Page-selection behavior, supported content, token handling, public-media requirements, and safe real-publish flags.
- [ ] Update README current status to V14, supported-channel matrix, environment block, verification coverage, repository structure, and development direction.
- [ ] Run `npm test` in GitHub Actions with PostgreSQL 17.
- [ ] Run `find server client tests -name '*.js' -print0 | xargs -0 -n1 node --check` through CI.
- [ ] Review the PR diff for secrets, provider boundary leaks, unsafe Page auto-selection, and accidental changes to Instagram/WhatsApp architecture.
- [ ] Squash-merge only after required workflow success and verify the resulting `main` commit/workflow.
