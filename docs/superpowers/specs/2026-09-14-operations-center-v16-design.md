# V16 Operations Center Design

## Goal

Add an operational control surface for social publishing without introducing a second scheduler or provider-specific monitoring silos.

## Scope

V16 implements the roadmap's Operations Center slice:

- publication attempt history;
- failed/retrying scheduler work visibility;
- verified Meta and TikTok webhook ingestion;
- duplicate webhook protection;
- TikTok Content Posting webhook state synchronization;
- provider health snapshots;
- provider rate-limit visibility;
- protected Operations API and dashboard panel.

WhatsApp, calendar/edit/cancel controls, analytics, multi-user RBAC, and browser E2E remain separate milestones.

## Architecture

### Persistence

Use the existing `publication_attempts` and `webhook_events` tables from the canonical schema. Add a new `provider_status` table and a forward-only migration that extends `webhook_events` with verification/processing metadata.

JSON development persistence gains equivalent collections so behavior remains backend-neutral.

### Provider telemetry

A small `server/operations/provider-telemetry.js` service owns provider status transitions. Workers call it after provider operations:

- successful publish/status/token refresh -> `HEALTHY`, clear transient rate limit;
- `RATE_LIMIT` -> `DEGRADED`, record `limitedUntil` from the scheduler retry time;
- auth/permission failures -> `ERROR`;
- network/provider failures -> `DEGRADED`.

No provider secrets or raw authorization material are persisted.

### Publication attempts

`social-publication-worker.js` creates one attempt record immediately before the external publish call and finishes it after success/failure. Attempt number uses the scheduler job attempt count, preserving idempotent retry chronology.

### Webhooks

Public endpoints:

- `GET /api/webhooks/meta` — Meta verification handshake using `META_WEBHOOK_VERIFY_TOKEN`.
- `POST /api/webhooks/meta` — HMAC-SHA256 verification of the raw request body using `META_WEBHOOK_APP_SECRET` and `X-Hub-Signature-256`.
- `POST /api/webhooks/tiktok` — HMAC-SHA256 verification of `timestamp + '.' + raw_body` using `TIKTOK_CLIENT_SECRET` and `TikTok-Signature`; reject stale timestamps beyond five minutes.

Webhook payloads are parsed only after signature verification. Delivery deduplication uses a SHA-256 fingerprint of the verified raw body as the provider-scoped external event ID when the provider does not supply a stable event ID.

TikTok `post.publish.complete`, `post.publish.failed`, and `post.publish.publicly_available` events update the publication matched by TikTok `publish_id`. `authorization.removed` disconnects the matching TikTok account. Meta deliveries are normalized and persisted for operational inspection; product-specific business reactions are intentionally deferred.

### Operations API

Protected `GET /api/operations` returns sanitized operational data:

- provider status snapshots for Instagram, Facebook, Threads, TikTok;
- recent failed/retrying jobs;
- recent publication attempts;
- recent webhook events with payload omitted from the management response.

Raw webhook payloads remain server-side persistence only.

### UI

Add an `#operations` dashboard section with provider health cards, failed/retrying work, publication attempt timeline, and webhook delivery log. Frontend API calls stay in `client/js/api/operations-api.js`; rendering stays in `client/js/pages/operations.js`; page-specific styles stay in `client/css/pages/operations.css`.

## Error handling and security

- Webhook routes remain public because providers must reach them, but mutation authentication is replaced by provider signature verification.
- Missing/invalid signatures return 401/403 and are not persisted as trusted events.
- Invalid JSON returns 400 after a valid signature.
- Duplicate verified deliveries return 200 without repeating side effects.
- The Operations API stays behind Srocial application authentication when enabled.
- The UI never receives provider tokens, app secrets, raw webhook payloads, or authorization headers.

## Verification

TDD covers repository parity, signature verification, replay/stale TikTok rejection, Meta handshake, webhook deduplication, TikTok publication synchronization, worker attempt/provider telemetry, Operations API sanitization, and UI wiring. CI must pass PostgreSQL migrations, the complete Node test suite, and JavaScript syntax checks before merge.

Real Meta/TikTok developer-app webhook delivery remains an external verification item in `PROBLEMS.md` until credentials and public HTTPS callbacks are available.