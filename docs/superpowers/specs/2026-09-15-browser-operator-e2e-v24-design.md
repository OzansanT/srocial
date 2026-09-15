# V24 Browser E2E Operator Surfaces — Design

## Purpose

The supplied Srocial feature roadmap is implemented through its final item 100. V24 is therefore a post-roadmap production-readiness milestone that reduces `SR-P001` by extending the real Chrome/CDP gate from V23's critical content path into four remaining deterministic operator surfaces: Accounts, WhatsApp, Operations, and Analytics.

V24 must not claim live-provider verification. All scenarios run against isolated JSON persistence with social/WhatsApp execution disabled and no production provider credentials.

## Scope

### Accounts

Real Chrome verifies that seeded provider-account state is rendered safely, connected accounts expose Disconnect/Reconnect controls, disconnect mutates the persisted account and re-renders the row, and sanitized OAuth callback result state is surfaced/cleaned from the URL. Starting a real provider authorization flow is out of scope because CI intentionally supplies no provider app credentials.

### WhatsApp operator workflow

The fixture seeds one approved WhatsApp template only. Through the browser, an Admin creates an opted-in E.164 contact, selects it as a campaign recipient, schedules a future campaign against the approved template, observes the campaign in the operator list, and opts the contact out. `ALLOW_REAL_WHATSAPP=false` and `SCHEDULER_ENABLED=false`, so no message is sent.

### Operations Center

The fixture seeds sanitized provider health, one failed scheduler job, one publication attempt, and one verified-webhook summary. Real Chrome navigates to Operations and verifies the rendered provider/error/attempt/webhook state plus manual refresh. Raw webhook/provider payloads are not introduced into fixtures.

### Analytics

The fixture seeds one connected Facebook Page, one published post/publication, and append-only metric snapshots. Real Chrome verifies account/platform filters, normalized KPI/post rendering, freshness/report state, and an empty-filter state. No provider analytics request is made.

## Test-fixture architecture

Extend `startSrocialE2EServer` with an optional `seedData` object containing repository collection arrays. Missing collections continue to rely on the JSON repository's existing legacy/default normalization. Existing `seedAccounts` remains supported for V23 compatibility and is merged into `seedData.accounts`.

`seedData` is test-only input. It is written to the temporary fixture file before server startup. No production route, environment backdoor, or runtime seeding feature is added.

## Browser structure

Create `tests/e2e/operator-surfaces.e2e.js`. Use one isolated server/browser session for the suite and independent tests for:

1. Accounts state + disconnect + sanitized OAuth-result rendering.
2. WhatsApp contact/campaign/consent workflow.
3. Operations seeded-state rendering + refresh.
4. Analytics seeded-report filtering/rendering.

E2E files remain serialized with `--test-concurrency=1` to avoid shared Chrome contention.

## Safety constraints

The fixture must explicitly keep:

```text
SCHEDULER_ENABLED=false
ALLOW_REAL_PUBLISH=false
ALLOW_REAL_WHATSAPP=false
```

Provider application credentials remain empty. Seeded accounts contain safe metadata only; no access/refresh token is necessary for these browser scenarios. V24 must not weaken authentication, RBAC, same-origin checks, scheduler gates, or provider validation.

## Error handling and assertions

Tests wait on observable UI state rather than fixed sleeps. They assert both browser rendering and, for mutating flows, the protected API/persisted state through same-origin browser `fetch` where useful. Failure messages must remain sanitized.

If browser testing exposes a genuine product-state defect, fix the smallest product behavior with a regression test; do not hide it in the E2E harness.

## Verification gates

Before merge, exact-head CI must pass:

- PostgreSQL migrations through `009_users_roles.sql`;
- the full deterministic Node suite;
- JavaScript syntax checks;
- all V22/V23/V24 Chrome scenarios.

Then PR-triggered CI and the exact squash-merged `main` commit must independently pass the same workflow.

## Out of scope / remaining `SR-P001`

After V24, `SR-P001` remains `PARTIAL` for Calendar drag/drop and remaining edit/reschedule/duplicate/retry/filter/dialog lifecycle browser paths. Live OAuth/provider publishing/webhook/WhatsApp delivery/analytics verification remains tracked separately under provider-specific `VERIFY` items.
