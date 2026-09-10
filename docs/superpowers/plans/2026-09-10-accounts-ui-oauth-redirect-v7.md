# Accounts UI and OAuth Redirect V7 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a browser Accounts workflow for Instagram connection management and redirect browser OAuth callbacks safely back to the dashboard while preserving explicit JSON API behavior.

**Architecture:** Reuse the existing OAuth/account services and endpoints. Add content negotiation at the HTTP handler boundary, a focused Accounts page module in the client, and a small composer refresh controller so account changes propagate without duplicating provider logic.

**Tech Stack:** Node.js >=20, ES modules, vanilla HTML/CSS/JS, built-in `node:test`, existing JSON repository and OAuth services.

**Spec:** `docs/superpowers/specs/2026-09-10-accounts-ui-oauth-redirect-design.md`

## Global Constraints

- Do not expose access tokens, refresh tokens, authorization codes, OAuth state values, provider secrets, or raw provider error text in browser redirects.
- Preserve the existing JSON OAuth callback when the client explicitly requests `Accept: application/json`.
- Browser callbacks use only a fixed relative Srocial dashboard redirect.
- Use existing OAuth start and account disconnect APIs; do not add a second account service.
- Keep frontend HTML/CSS/JS modular and dependency-free.
- Unsupported providers must not receive active OAuth controls.

---

### Task 1: OAuth Callback Response Negotiation

**Files:**
- Modify: `server/app.js`
- Modify: `tests/accounts-oauth-api.test.js`

**Interfaces:**
- Add a request preference helper that distinguishes explicit JSON clients from browser HTML navigation.
- Add a safe OAuth dashboard redirect builder returning only `/?oauth=<provider>&status=<connected|error>&code=<safe-code>#accounts`.

- [ ] Add failing HTTP tests for successful browser callback redirect, sanitized OAuth failure redirect, and missing token-cipher browser redirect.
- [ ] Update the existing JSON callback test to send `Accept: application/json` and prove the current JSON contract remains intact.
- [ ] Implement `303` browser redirects at the HTTP boundary while keeping OAuth service/route payload logic unchanged.
- [ ] Run `node --test tests/accounts-oauth-api.test.js` and require zero failures.

### Task 2: Accounts Client API and Pure View Model

**Files:**
- Modify: `client/js/api/accounts-api.js`
- Create: `client/js/pages/accounts.js`
- Create: `tests/accounts-ui.test.js`

**Interfaces:**
- `startOAuth(provider)` returns the existing OAuth start JSON payload.
- `disconnectAccount(id)` returns the existing safe disconnect JSON payload.
- `buildAccountViewModel(account)` returns display-safe fields plus booleans describing available actions.

- [ ] Write failing pure tests for connected Instagram, disconnected Instagram, and unsupported-provider account view models.
- [ ] Implement API helpers through existing `requestJson()`.
- [ ] Implement the pure view-model helper with Instagram-only connect/reconnect capability.
- [ ] Run `node --test tests/accounts-ui.test.js` and require zero failures.

### Task 3: Accounts Panel and Composer Refresh Coordination

**Files:**
- Modify: `client/index.html`
- Create: `client/css/pages/accounts.css`
- Modify: `client/js/pages/accounts.js`
- Modify: `client/js/pages/composer.js`
- Modify: `client/js/app.js`

**Interfaces:**
- `initializeAccounts({ onChanged })` loads/renders account rows and returns `{ refresh }`.
- `initializeComposer({ onScheduled })` returns `{ refreshAccounts }`.
- App bootstrap coordinates `onChanged -> composer.refreshAccounts()`.

- [ ] Add an Accounts panel with Connect Instagram button, account-list container, and aria-live feedback.
- [ ] Render safe account rows using DOM creation/textContent rather than raw account HTML interpolation.
- [ ] Wire Connect/Reconnect to OAuth start then browser navigation.
- [ ] Wire Disconnect to the existing endpoint, refresh Accounts, then call `onChanged`.
- [ ] Parse safe OAuth query parameters into user feedback and remove them from browser history after display.
- [ ] Refactor composer account loading into a reusable `refreshAccounts()` method without changing payload behavior.
- [ ] Initialize modules in `client/js/app.js` in dependency order.
- [ ] Run account/composer tests and JavaScript syntax checks.

### Task 4: Documentation and Full Verification

**Files:**
- Modify: `README.md`
- Modify: `HOW_TO_RUN.md`

- [ ] Document browser Connect/Reconnect/Disconnect behavior.
- [ ] Document HTML-vs-JSON OAuth callback behavior.
- [ ] Run the complete `npm test` suite in GitHub Actions.
- [ ] Run repository JavaScript syntax checks in GitHub Actions.
- [ ] Review the feature branch diff against `main` for token/error leakage and unrelated changes.
- [ ] Open a PR and squash-merge to `main` under the standing merge-without-ask instruction.
- [ ] Verify the post-merge `main` CI result.
