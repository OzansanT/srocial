# V16 Operations Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the V16 Operations Center with verified webhook ingestion, publication attempt history, provider health/rate-limit snapshots, protected operational APIs, and dashboard visibility.

**Architecture:** Keep one scheduler and provider-isolated adapters. Add backend-neutral repository primitives for `publication_attempts`, `webhook_events`, and `provider_status`; record telemetry from existing workers; verify Meta/TikTok webhooks using raw request bytes; expose sanitized read models through one protected Operations API and one modular dashboard section.

**Tech Stack:** Node.js >=20, built-in HTTP/crypto, vanilla JavaScript ES modules, JSON development repository, PostgreSQL 17 production repository, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-14-operations-center-v16-design.md`

## Global Constraints

- Preserve HTML/CSS/vanilla JavaScript frontend.
- Preserve one scheduler; do not create provider-specific cron systems.
- Provider API/webhook specifics stay isolated from generic scheduler/database code.
- Never expose or persist access tokens, refresh tokens, app secrets, authorization headers, or raw provider credentials.
- Webhook signatures must be verified against raw request bytes before JSON parsing.
- Historical migrations remain immutable; V16 uses a new forward migration.
- `PROBLEMS.md` remains the canonical unresolved-work tracker.

---

### Task 1: Repository operational primitives

**Files:**
- Create: `server/db/migrations/005_operations_center.sql`
- Modify: `server/db/json-repository.js`
- Modify: `server/db/postgres-repository.js`
- Test: `tests/operations-repository.test.js`

**Interfaces:**
- Produces `createPublicationAttempt(record)`, `updatePublicationAttempt(id, patch)`, `listPublicationAttempts({limit})`, `createWebhookEvent(record)`, `getWebhookEventByExternalId(provider, externalEventId)`, `updateWebhookEvent(id, patch)`, `listWebhookEvents({limit})`, `upsertProviderStatus(provider, patch)`, `listProviderStatuses()`, and `findPublicationByExternalId(platform, externalId)`.

- [ ] Write repository tests first for JSON persistence, webhook dedupe lookup, provider status upsert, publication attempt chronology, and PostgreSQL mapping/query behavior.
- [ ] Run the focused tests and confirm RED because the repository methods do not exist.
- [ ] Add migration 005 and backend-neutral JSON/PostgreSQL implementations.
- [ ] Run focused tests and confirm GREEN.

### Task 2: Webhook verification and processing

**Files:**
- Create: `server/http/read-raw-body.js`
- Create: `server/webhooks/signatures.js`
- Create: `server/webhooks/processor.js`
- Create: `server/routes/webhooks.js`
- Modify: `server/app.js`
- Test: `tests/webhooks-v16.test.js`

**Interfaces:**
- `verifyMetaWebhook(rawBody, signature, appSecret) -> boolean`
- `verifyTikTokWebhook(rawBody, header, clientSecret, {now,maxAgeSeconds}) -> boolean`
- `handleMetaWebhook(...) -> {statusCode,payload|text}`
- `handleTikTokWebhook(...) -> {statusCode,payload}`

- [ ] Write failing tests for Meta GET challenge, Meta signature validation, TikTok signature/timestamp validation, duplicate delivery idempotency, TikTok publish completion/failure synchronization, and authorization removal.
- [ ] Run focused tests and confirm RED.
- [ ] Implement raw-body reading, timing-safe HMAC verification, normalization/fingerprinting, repository persistence, and lightweight side effects.
- [ ] Run focused tests and confirm GREEN.

### Task 3: Provider telemetry and publication attempts

**Files:**
- Create: `server/operations/provider-telemetry.js`
- Modify: `server/scheduler/workers/social-publication-worker.js`
- Modify: `server/scheduler/workers/status-check-worker.js`
- Modify: `server/scheduler/workers/token-refresh-worker.js`
- Test: `tests/operations-workers.test.js`

**Interfaces:**
- `recordProviderSuccess(repository, provider, {now})`
- `recordProviderFailure(repository, provider, code, {now,limitedUntil})`

- [ ] Write failing worker tests proving publish attempts are persisted and provider status transitions on success, rate limit, auth error, and network/provider failure.
- [ ] Run focused tests and confirm RED.
- [ ] Implement minimal telemetry hooks using optional repository methods so existing isolated worker fixtures remain compatible.
- [ ] Run focused tests and confirm GREEN.

### Task 4: Operations API

**Files:**
- Create: `server/services/operations-service.js`
- Create: `server/routes/operations.js`
- Modify: `server/app.js`
- Test: `tests/operations-api.test.js`

**Interfaces:**
- `getOperationsPayload(repository) -> {statusCode,payload}`
- `GET /api/operations` returns `providers`, `failedJobs`, `attempts`, `webhooks`.

- [ ] Write failing tests for sanitized response shape, sorting/limits, and absence of raw webhook payload/credentials.
- [ ] Run focused tests and confirm RED.
- [ ] Implement service/route and wire protected API handling.
- [ ] Run focused tests and confirm GREEN.

### Task 5: Operations dashboard

**Files:**
- Create: `client/js/api/operations-api.js`
- Create: `client/js/pages/operations.js`
- Create: `client/css/pages/operations.css`
- Modify: `client/js/app.js`
- Modify: `client/index.html`
- Test: `tests/operations-ui.test.js`

**Interfaces:**
- `getOperations()` fetches `/api/operations`.
- `initializeOperations()` loads and renders provider state, failed/retrying jobs, attempts, and webhook deliveries.

- [ ] Write failing static/module tests for API path, Operations navigation/section, expected render targets, and stylesheet/module wiring.
- [ ] Run focused tests and confirm RED.
- [ ] Add modular UI implementation and accessible empty/error states.
- [ ] Run focused tests and confirm GREEN.

### Task 6: Documentation, tracker, and release gate

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `HOW_TO_RUN.md`
- Modify: `PROBLEMS.md`
- Create: `docs/V16_OPERATIONS_CENTER.md`

- [ ] Document `META_WEBHOOK_VERIFY_TOKEN`, `META_WEBHOOK_APP_SECRET`, TikTok webhook callback requirements, public webhook endpoints, Operations API, and provider-state semantics.
- [ ] Change `SR-P003` from `OPEN` to `VERIFY`; do not resolve it until real provider deliveries are verified.
- [ ] Run full CI-equivalent gates: PostgreSQL migration, complete `npm test`, and JavaScript syntax checks.
- [ ] Review the final diff for secrets, raw webhook exposure, unsafe public routes, duplicate side effects, and unrelated refactors.
- [ ] Open/refresh the PR, require a fresh green GitHub Actions run, squash-merge into `main`, and verify the post-merge workflow.