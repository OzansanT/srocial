# Account, Media, and Scheduler V6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Instagram scheduling executable end to end by binding posts to connected accounts and provider-ready media, then run the existing scheduler behind explicit production gates.

**Architecture:** Extend the existing post service rather than adding another scheduling path. Explicit destinations resolve safe connected accounts during post creation; media records remain generic and provider-specific restrictions stay in adapters. Add one recurring scheduler-loop module that wraps the existing `runSchedulerTick()` primitive and is double-gated by environment configuration.

**Tech Stack:** Node.js >=20, ES modules, vanilla HTML/CSS/JS, built-in `node:test`, JSON development repository, existing PostgreSQL schema.

**Spec:** `docs/superpowers/specs/2026-09-10-account-media-scheduler-design.md`

## Global Constraints

- Keep `ALLOW_REAL_PUBLISH=false` as the default.
- Add `SCHEDULER_ENABLED=false` as a second independent default-off gate.
- Do not expose raw or encrypted provider tokens to the browser.
- Do not introduce a second scheduler implementation.
- Preserve legacy `platforms[]` request compatibility.
- New explicit destinations must be account-scoped and validated server-side.
- Media must use externally reachable HTTPS URLs in V6.
- No new npm dependency is required.

---

### Task 1: Destination and Media Domain Validation

**Files:**
- Modify: `server/services/post-service.js`
- Test: `tests/post-service.test.js`

**Interfaces:**
- `createScheduledPost(repository, input, { now })`
- Preferred input: `{ caption, destinations, media, scheduledAt }`
- Destination: `{ platform, accountId }`
- Media: `{ type, url }`

- [ ] Add failing tests for a connected Instagram account producing an account-bound publication.
- [ ] Add failing tests for missing, disconnected, and wrong-platform accounts.
- [ ] Add failing tests for destination deduplication by `(platform, accountId)`.
- [ ] Add failing tests for media persistence, sort order, invalid type, non-HTTPS URL, and more than 10 items.
- [ ] Add a regression test proving legacy `platforms[]` still creates unbound development publications.
- [ ] Implement normalization/validation and persist media before returning the created aggregate.
- [ ] Run `node --test tests/post-service.test.js` and require zero failures.

### Task 2: Safe Account API and Composer Payload

**Files:**
- Create: `client/js/api/accounts-api.js`
- Modify: `client/index.html`
- Modify: `client/js/pages/composer.js`
- Modify: `client/css/pages/composer.css`
- Test: `tests/composer-payload.test.js`

**Interfaces:**
- `listAccounts()` calls `GET /api/accounts`.
- Export a pure `buildComposerPayload({ formData, accounts })` helper from `composer.js` for testability.

- [ ] Add failing tests that build `{ destinations, media }` with the selected account IDs.
- [ ] Add failing tests that omit empty media and reject a checked platform without a selected connected account.
- [ ] Implement `accounts-api.js`.
- [ ] Replace flat platform checkboxes with platform rows containing account selects.
- [ ] Load connected accounts, populate selects by provider, and disable platforms without connected accounts.
- [ ] Add image/video plus HTTPS media URL controls.
- [ ] Submit the new payload through existing `createPost()`.
- [ ] Add only page-specific composer CSS needed for the new rows.
- [ ] Run the composer payload tests and syntax checks.

### Task 3: Recurring Scheduler Loop

**Files:**
- Create: `server/scheduler/start-scheduler-loop.js`
- Modify: `server/server.js`
- Modify: `.env.example`
- Test: `tests/scheduler-loop.test.js`

**Interfaces:**
- `startSchedulerLoop({ enabled, allowRealPublish, repository, registry, intervalMs, workerId, tick, setIntervalImpl, clearIntervalImpl, logger })`
- Returns `{ started, stop }`.

- [ ] Add failing tests proving neither flag alone starts the loop.
- [ ] Add failing test proving both flags start recurring ticks.
- [ ] Add failing overlap test: while one tick is pending, a second timer callback must not invoke another tick.
- [ ] Add failing stop test proving interval cleanup.
- [ ] Implement the loop with one lifetime worker ID and in-flight guard.
- [ ] Wire the existing `platformRegistry` into scheduler execution from `server.js`.
- [ ] Add `SCHEDULER_ENABLED=false` and `SCHEDULER_INTERVAL_MS=30000` to `.env.example`.
- [ ] Run scheduler-loop and scheduler-runner tests.

### Task 4: Documentation and Full Verification

**Files:**
- Modify: `README.md`
- Modify: `HOW_TO_RUN.md` if its run/config instructions conflict with V6.

- [ ] Document the preferred `destinations[]` + `media[]` request.
- [ ] Document that legacy `platforms[]` is development compatibility only.
- [ ] Document the two production scheduler gates and account/media requirements.
- [ ] Run the complete `npm test` suite in the reconstructed repository mirror.
- [ ] Run `node --check` across `server`, `client`, and `tests` JavaScript.
- [ ] Run a smoke flow: create connected Instagram account + post/media + due job, then execute scheduler tick with a fake Instagram adapter and verify exactly one publish call.
- [ ] Compare the GitHub feature branch with `main` and review all changed paths.
- [ ] Open PR and squash-merge to `main` under the standing merge-without-ask instruction.
