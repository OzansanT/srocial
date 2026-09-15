# V24 — Browser E2E Operator Surfaces

V24 extends Srocial's real Chrome/CDP production-readiness gate across the remaining deterministic operator surfaces after the supplied feature roadmap was completed through item 100.

## Coverage

The browser suite now verifies the following without live provider credentials or external side effects.

### Accounts

- renders connected and disconnected provider-account state;
- exposes the expected Disconnect/Reconnect controls;
- disconnects a seeded account and verifies persisted state;
- renders a sanitized OAuth callback result and removes callback query data from the browser URL.

This does not verify a real provider OAuth exchange. Live provider verification remains tracked separately.

### WhatsApp operator workflow

- creates an E.164 contact with explicit opt-in consent;
- selects the contact as a recipient;
- schedules a campaign against a seeded approved template;
- verifies the persisted scheduled campaign and recipient count;
- changes the contact to opted out and verifies it can no longer be selected.

No WhatsApp message is sent.

### Operations Center

- renders seeded provider health;
- renders failed scheduler work;
- renders publication-attempt history;
- renders sanitized webhook-event state;
- exercises manual Operations refresh.

No raw provider/webhook payload is introduced into the fixture.

### Analytics

- renders the latest metric snapshot per publication;
- verifies normalized KPI totals and post rows;
- exercises provider filtering and the empty-filter state.

No provider analytics request is made.

### Queue lifecycle

- exercises publication-state filtering;
- edits a scheduled caption through the browser dialog path;
- duplicates a scheduled post to a future time;
- retries a failed publication;
- verifies the resulting persisted post/publication state through the protected API.

### Calendar lifecycle

- performs a real browser drag/drop using `DataTransfer` and `DragEvent`;
- reschedules the persisted post onto the target local calendar date;
- verifies the card is rendered in the target date cell after refresh.

V23 already covers browser scheduling plus Queue/Calendar bulk reschedule and bulk cancel.

## Test-fixture architecture

`tests/e2e/srocial-server.js` accepts test-only `seedData` collections and writes them to the isolated temporary JSON repository before server startup. The existing `seedAccounts` path remains compatible.

This is not a production route, environment backdoor, or application seeding feature. Provider credentials remain blank in the E2E server.

## Safety gates

Every V24 browser fixture explicitly preserves:

```text
SCHEDULER_ENABLED=false
ALLOW_REAL_PUBLISH=false
ALLOW_REAL_WHATSAPP=false
```

V24 does not weaken authentication, RBAC, same-origin mutation checks, provider validation, scheduler gates, or credential handling.

## Verification

Exact V24 implementation head:

```text
38c3169da53de0755770f0ff882b10d7d20889bf
```

GitHub Actions push run:

```text
34975709590
```

Results:

- PostgreSQL migrations `001` through `009`: passed;
- deterministic Node suite: **447/447 passed**;
- JavaScript syntax checks: passed;
- real Chrome/CDP suite: **12/12 passed**.

The 12 browser scenarios cover authentication, RBAC/user administration, Composer workflows, Media Library, scheduling/bulk Queue lifecycle, Queue filter/edit/duplicate/retry, Calendar drag/drop, Accounts, WhatsApp operator workflow, Operations, and Analytics.

## What V24 does not claim

V24 is deterministic browser integration coverage. It does **not** verify:

- a real Instagram/Facebook/Threads/TikTok OAuth exchange or publish;
- real Meta/TikTok webhook delivery;
- real WhatsApp Cloud API delivery;
- real provider analytics responses.

Those remain explicit provider-specific VERIFY items in `PROBLEMS.md`.

## Remaining browser gap

`SR-P001` remains PARTIAL only for browser paths not yet directly exercised, principally the individual Queue prompt-reschedule/cancel dialog variants and any remaining page-specific edge interactions. Bulk reschedule/cancel and Calendar drag reschedule are already covered.
