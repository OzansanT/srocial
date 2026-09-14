# V16 Operations Center

V16 adds operational visibility and verified webhook ingestion for Srocial's social publishing providers.

## What V16 adds

- publication-attempt history for external publish calls;
- failed/retrying scheduler-job visibility;
- provider health snapshots (`UNKNOWN`, `HEALTHY`, `DEGRADED`, `ERROR`);
- visible rate-limit windows when a provider returns `RATE_LIMIT`;
- verified Meta and TikTok webhook ingestion;
- duplicate webhook protection;
- TikTok Content Posting publication-state synchronization;
- TikTok authorization-removal account disconnect handling;
- protected `GET /api/operations` dashboard data;
- Operations Center dashboard UI.

## Environment

```text
META_WEBHOOK_VERIFY_TOKEN=<random-provider-verification-token>
META_WEBHOOK_APP_SECRET=<Meta app secret>
TIKTOK_CLIENT_SECRET=<TikTok client secret>
```

These values are server-only. Never place them in browser JavaScript, logs, API responses, or Git history.

## Public webhook endpoints

Provider callback routes must remain reachable without a Srocial application session because Meta/TikTok servers call them directly:

```text
GET  /api/webhooks/meta
POST /api/webhooks/meta
POST /api/webhooks/tiktok
```

They are not unauthenticated mutations in the usual sense: POST bodies are accepted only after provider signature verification.

### Meta

`GET /api/webhooks/meta` performs the subscription verification handshake using `META_WEBHOOK_VERIFY_TOKEN`.

`POST /api/webhooks/meta` verifies `X-Hub-Signature-256` as HMAC-SHA256 over the exact raw request bytes with `META_WEBHOOK_APP_SECRET`. Only a verified body is parsed or persisted.

### TikTok

`POST /api/webhooks/tiktok` verifies `TikTok-Signature`. Srocial calculates HMAC-SHA256 over:

```text
<timestamp>.<raw request body>
```

using `TIKTOK_CLIENT_SECRET`. Deliveries more than five minutes away from the server clock are rejected to reduce replay risk.

## Duplicate delivery behavior

Verified deliveries are fingerprinted with SHA-256 and stored as a provider-scoped external event ID. Replayed/duplicate deliveries return HTTP 200 but do not repeat state-changing side effects.

## TikTok publication synchronization

For verified Content Posting events carrying `publish_id`:

- `post.publish.complete` -> publication `PUBLISHED`;
- `post.publish.publicly_available` -> publication `PUBLISHED`;
- `post.publish.failed` -> publication `FAILED` with normalized error code.

`authorization.removed` finds the TikTok account by provider identity, marks it disconnected, and clears stored encrypted access/refresh tokens.

## Provider health semantics

Provider state is derived from actual provider work:

- `UNKNOWN` — no operational evidence recorded yet;
- `HEALTHY` — most recent provider operation succeeded;
- `DEGRADED` — transient provider/network/rate-limit failure;
- `ERROR` — authentication or permission failure requiring operator action.

A `RATE_LIMIT` failure also records `limitedUntil` from the scheduler's retry timestamp. A later successful provider operation clears the active rate-limit marker.

## Operations API

```text
GET /api/operations
```

This route is part of the protected management surface when application authentication is enabled. It returns:

- `providers`
- `failedJobs`
- `attempts`
- `webhooks`

Raw webhook payloads, provider tokens, app secrets, authorization headers, and encrypted credentials are not returned.

## PostgreSQL

Run the forward migration before starting a V16 PostgreSQL deployment:

```bash
npm run db:migrate
```

Migration `005_operations_center.sql` extends `webhook_events` with verification/processing metadata and creates `provider_status`. Historical migrations are not modified.

## External verification still required

Automated tests verify signature algorithms, timestamp rejection, persistence, deduplication, state transitions, scheduler telemetry, API sanitization, and UI wiring. Full real-world verification still requires approved Meta/TikTok applications and public HTTPS webhook callback URLs. Keep `SR-P003` in `VERIFY` until those provider deliveries are observed end to end.
