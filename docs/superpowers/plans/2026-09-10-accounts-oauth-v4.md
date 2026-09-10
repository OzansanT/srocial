# Accounts and OAuth V4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe connected-account persistence and provider-neutral OAuth start/callback infrastructure without enabling production token exchange or publishing.

**Architecture:** Extend the JSON repository with `accounts` and one-time `oauthStates`; keep token encryption in a dedicated crypto module; route OAuth through a provider registry whose entries own authorization URL construction. HTTP routes call account/OAuth services and expose safe metadata only.

**Tech Stack:** Node.js >=20, ES modules, built-in `node:test`, built-in `crypto`, dependency-free HTTP server, JSON development repository, PostgreSQL migration target.

**Spec:** `docs/superpowers/specs/2026-09-10-accounts-oauth-design.md`

## Global Constraints

- Preserve `ALLOW_REAL_PUBLISH=false` as the default.
- Never return encrypted/raw tokens through browser APIs.
- Persist only hashes of raw OAuth state values.
- Reject external `returnTo` values.
- Keep provider URL details in provider-specific auth modules.
- Keep WhatsApp under `server/messaging/whatsapp/`.
- Do not add an npm dependency.
- Existing scheduler and publishing tests must remain green.

---

### Task 1: Credential Encryption Boundary

**Files:**
- Create: `server/security/token-crypto.js`
- Test: `tests/token-crypto.test.js`

**Interfaces:**
- Produces `createTokenCipher(secret)` returning `{ encrypt(value), decrypt(payload) }`.

- [ ] **Step 1:** Write tests that prove round-trip encryption, nondeterministic ciphertext, empty-value handling, and authentication failure after tampering.
- [ ] **Step 2:** Run `node --test tests/token-crypto.test.js` and verify RED because the module is absent.
- [ ] **Step 3:** Implement AES-256-GCM using a SHA-256-derived 32-byte key, random 12-byte IV, and versioned base64url payload.
- [ ] **Step 4:** Run the token crypto tests and require pass.

### Task 2: Account Serialization and Repository Persistence

**Files:**
- Create: `server/accounts/account-serializer.js`
- Modify: `server/db/json-repository.js`
- Test: `tests/accounts-repository.test.js`

**Interfaces:**
- Repository produces `createAccount(record)`, `listAccounts()`, `getAccount(id)`, `disconnectAccount(id)`.
- Serializer produces `toSafeAccount(account)`.

- [ ] **Step 1:** Write tests for account persistence, defensive copies, disconnect behavior, and safe serialization that strips all token/secret fields.
- [ ] **Step 2:** Run tests and verify RED.
- [ ] **Step 3:** Expand `emptyData()`/initialization with `accounts` and implement the repository methods via the existing serialized mutation chain.
- [ ] **Step 4:** Implement explicit safe serialization and rerun account/repository regression tests.

### Task 3: OAuth State Service

**Files:**
- Create: `server/oauth/oauth-state-service.js`
- Modify: `server/db/json-repository.js`
- Test: `tests/oauth-state.test.js`

**Interfaces:**
- Repository produces `createOAuthState(record)` and `consumeOAuthState({provider,stateHash,now})`.
- Service produces `createOAuthState({repository,provider,returnTo,now,ttlMs})` and `consumeOAuthState({repository,provider,state,now})`.

- [ ] **Step 1:** Write tests for random state issuance, hashed persistence, provider matching, expiry, one-time consumption/replay rejection, and safe local `returnTo` normalization.
- [ ] **Step 2:** Run tests and verify RED.
- [ ] **Step 3:** Implement random 32-byte base64url state, SHA-256 hashing, 10-minute default TTL, local-path return validation, and atomic consume behavior.
- [ ] **Step 4:** Rerun OAuth-state and repository regression tests.

### Task 4: OAuth Provider Registry and Provider Modules

**Files:**
- Create: `server/oauth/provider-registry.js`
- Create: `server/platforms/meta/auth.js`
- Create: `server/platforms/threads/auth.js`
- Create: `server/platforms/tiktok/auth.js`
- Create: `server/messaging/whatsapp/auth.js`
- Test: `tests/oauth-providers.test.js`

**Interfaces:**
- Registry produces `createOAuthProviderRegistry(env)` and `getOAuthProvider(registry,name)`.
- Providers expose `{name,isConfigured(env),getAuthorizationUrl({state,redirectUri,env}),normalizeCallback(query)}`.

- [ ] **Step 1:** Write tests for normalized provider lookup, unsupported-provider rejection, missing-config handling, callback normalization, and TikTok v2 authorization URL parameters.
- [ ] **Step 2:** Run tests and verify RED.
- [ ] **Step 3:** Implement provider modules. Meta/Threads/WhatsApp remain conservative configuration boundaries; TikTok uses its documented v2 Login Kit authorization URL.
- [ ] **Step 4:** Rerun provider tests.

### Task 5: Account and OAuth Services

**Files:**
- Create: `server/accounts/account-service.js`
- Create: `server/oauth/oauth-service.js`
- Test: `tests/account-service.test.js`
- Test: `tests/oauth-service.test.js`

**Interfaces:**
- Account service produces `listSafeAccounts(repository)` and `disconnectAccount(repository,id)`.
- OAuth service produces `beginOAuth(...)` and `completeDevelopmentOAuth(...)`.

- [ ] **Step 1:** Write tests for safe account listing/disconnect and OAuth begin/callback orchestration.
- [ ] **Step 2:** Run tests and verify RED.
- [ ] **Step 3:** Implement orchestration without production token exchange. Development callback creates a connected placeholder account with no token fields.
- [ ] **Step 4:** Rerun service tests.

### Task 6: HTTP Routes

**Files:**
- Create: `server/routes/accounts.js`
- Create: `server/routes/oauth.js`
- Modify: `server/app.js`
- Test: `tests/accounts-api.test.js`
- Test: `tests/oauth-api.test.js`

**Interfaces:**
- `GET /api/accounts`
- `DELETE /api/accounts/:id`
- `GET /auth/:provider/start`
- `GET /auth/:provider/callback`

- [ ] **Step 1:** Write API tests for safe account JSON, disconnect 404/success, OAuth unsupported/config errors, JSON-mode start, redirect-mode start, invalid/replayed callback state, and successful development placeholder connection.
- [ ] **Step 2:** Run tests and verify RED.
- [ ] **Step 3:** Implement thin routes/services and inject `{repository,oauthProviders,env}` into `createRequestHandler()`.
- [ ] **Step 4:** Rerun API plus existing server tests.

### Task 7: Accounts UI

**Files:**
- Create: `client/css/pages/accounts.css`
- Create: `client/js/api/accounts-api.js`
- Create: `client/js/pages/accounts.js`
- Modify: `client/index.html`
- Modify: `client/js/app.js`

**Interfaces:**
- Accounts UI fetches only `/api/accounts` and initiates OAuth through `/auth/:provider/start`.

- [ ] **Step 1:** Add static/module-level tests where practical by extracting pure rendering helpers; otherwise verify with syntax/static smoke.
- [ ] **Step 2:** Add an Accounts section with provider cards and connected-account rows. No raw provider secrets/tokens appear in DOM state.
- [ ] **Step 3:** Wire connect links and disconnect buttons through the dedicated API module.
- [ ] **Step 4:** Verify dashboard/composer initialization still works.

### Task 8: PostgreSQL and Documentation Alignment

**Files:**
- Create: `server/db/migrations/003_accounts_oauth.sql`
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:** No runtime API changes.

- [ ] **Step 1:** Add `oauth_states` table/index and account credential metadata constraints/indexes without rewriting prior migrations.
- [ ] **Step 2:** Add redirect/base-URL environment variable names only; never secrets.
- [ ] **Step 3:** Update README current status, account/OAuth architecture, endpoints, and remaining real-token-exchange limitation.

### Task 9: Full Verification and Merge

- [ ] **Step 1:** Run `npm test` and require zero failures.
- [ ] **Step 2:** Run `node --check` for every `.js` file under `server`, `client`, and `tests`.
- [ ] **Step 3:** Run an OAuth smoke: start JSON-mode TikTok OAuth with fake config, extract state from URL, complete callback once, verify safe connected account exists, then replay callback and require rejection.
- [ ] **Step 4:** Compare branch to `main` and review every changed path.
- [ ] **Step 5:** Create PR and squash-merge directly to `main` under the user-authorized merge-without-ask workflow.