# Accounts and OAuth V4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure provider-agnostic account/OAuth infrastructure with encrypted token persistence, one-time state handling, safe account APIs, and disconnect behavior.

**Architecture:** OAuth orchestration stays in server services and provider auth adapters are injected through a dedicated registry. The JSON development repository gains accounts/OAuth-state collections, while PostgreSQL receives a forward migration; only safe account metadata crosses the browser boundary.

**Tech Stack:** Node.js >=20, ES modules, built-in `node:crypto`, built-in `node:test`, JSON development repository, PostgreSQL migration target.

**Spec:** `docs/superpowers/specs/2026-09-10-accounts-oauth-design.md`

## Global Constraints

- Provider tokens must never be returned to frontend APIs.
- `TOKEN_ENCRYPTION_KEY` remains server-only.
- OAuth state must be unpredictable, expiring, and one-time use.
- Provider-specific HTTP details stay inside provider auth adapters.
- No real external OAuth network calls are required for tests.
- No new npm dependency is required.
- Existing scheduler/post tests must remain green.

---

### Task 1: Token Encryption

**Files:**
- Create: `server/auth/token-crypto.js`
- Create: `tests/token-crypto.test.js`

**Interfaces:**
- `createTokenCipher(secret)` -> `{ encrypt(value), decrypt(payload) }`
- Encrypted payload is an opaque versioned string suitable for persistence.

- [ ] Write tests for encrypt/decrypt round trip, randomized ciphertext for the same plaintext, empty token passthrough, and missing key rejection.
- [ ] Run `node --test tests/token-crypto.test.js` and verify red.
- [ ] Implement AES-256-GCM with a SHA-256-derived 32-byte key and random 12-byte IV.
- [ ] Re-run the test and verify green.

### Task 2: Repository Account and OAuth-State Collections

**Files:**
- Modify: `server/db/json-repository.js`
- Create: `tests/account-repository.test.js`

**Interfaces:**
- `createAccount(record)`
- `updateAccount(id, patch)`
- `findAccountByProviderIdentity(provider, providerAccountId)`
- `getAccount(id)`
- `listAccounts()`
- `createOAuthState(record)`
- `consumeOAuthState(stateHash, { now })`

- [ ] Write tests proving account persistence, lookup, defensive copies, OAuth state one-time consumption, and expiry rejection.
- [ ] Run the new test and verify red.
- [ ] Extend `emptyData()`/initialization with backward-compatible `accounts` and `oauthStates` arrays and implement repository operations through the existing serialized write chain.
- [ ] Re-run repository tests and verify green.

### Task 3: OAuth State Service and Provider Registry

**Files:**
- Create: `server/auth/oauth-state-service.js`
- Create: `server/auth/oauth-provider-registry.js`
- Create: `tests/oauth-state-service.test.js`
- Create: `tests/oauth-provider-registry.test.js`

**Interfaces:**
- `issueOAuthState(repository, { provider, redirectUri, now, ttlMs })`
- `consumeOAuthState(repository, { provider, state, now })`
- `createOAuthProviderRegistry()` / `registerOAuthProvider()` / `getOAuthProvider()`

- [ ] Write tests for random state generation, hash-only persisted lookup, provider mismatch, expiry/used errors, provider normalization, duplicate registration, and unsupported provider errors.
- [ ] Verify red.
- [ ] Implement SHA-256 state hashing and registry behavior.
- [ ] Verify green.

### Task 4: Account Service

**Files:**
- Create: `server/services/account-service.js`
- Create: `tests/account-service.test.js`

**Interfaces:**
- `upsertConnectedAccount(repository, cipher, connection)`
- `listSafeAccounts(repository)`
- `disconnectAccount(repository, id, { now })`
- `toSafeAccount(account)`

- [ ] Write tests proving tokens are encrypted at rest, reconnect updates an existing provider identity, list output never contains token fields, and disconnect clears credential material.
- [ ] Verify red.
- [ ] Implement account state transitions and safe mapping.
- [ ] Verify green.

### Task 5: OAuth Orchestration Service

**Files:**
- Create: `server/services/oauth-service.js`
- Create: `tests/oauth-service.test.js`

**Interfaces:**
- `startOAuthConnection({ provider, redirectUri, repository, providerRegistry, now })`
- `completeOAuthConnection({ provider, code, state, repository, providerRegistry, cipher, now })`

- [ ] Write fake-provider tests proving start URL includes issued state, callback consumes state, exchanges code, resolves identity, persists encrypted account, and rejects state replay/missing code.
- [ ] Verify red.
- [ ] Implement orchestration without provider-specific branches.
- [ ] Verify green.

### Task 6: HTTP Routes

**Files:**
- Create: `server/routes/accounts.js`
- Create: `server/routes/oauth.js`
- Modify: `server/app.js`
- Create: `tests/accounts-oauth-api.test.js`

**Interfaces:**
- `GET /api/accounts`
- `POST /api/accounts/:id/disconnect`
- `POST /api/oauth/:provider/start`
- `GET /api/oauth/:provider/callback`

- [ ] Write API tests with an injected fake provider/cipher.
- [ ] Verify red.
- [ ] Add route helpers and request-handler wiring with structured safe errors.
- [ ] Verify green.

### Task 7: Runtime Wiring and PostgreSQL Migration

**Files:**
- Modify: `server/server.js`
- Create: `server/db/migrations/003_accounts_oauth.sql`
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:**
- Server creates token cipher only when OAuth is configured; startup remains possible without provider credentials.
- `PUBLIC_BASE_URL` defines default callback origin.

- [ ] Wire repository, cipher, and empty OAuth provider registry into the server.
- [ ] Add migration for account connection metadata and `oauth_states`.
- [ ] Document current Accounts/OAuth capability and safe configuration.

### Task 8: Verification and Merge

- [ ] Run full `npm test` with zero failures.
- [ ] Run `node --check` for every JS file under `server`, `client`, and `tests`.
- [ ] Run a fake-provider HTTP smoke: start OAuth, complete callback, confirm `GET /api/accounts` exposes safe metadata only, then disconnect.
- [ ] Compare branch against `main` and inspect changed paths.
- [ ] Open PR and squash-merge to `main` under the user's standing merge-without-ask instruction.