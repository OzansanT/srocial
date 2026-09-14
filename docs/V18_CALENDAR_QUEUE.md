# V18 — Calendar + Queue Lifecycle

V18 closes the source roadmap's unfinished Calendar, Queue, and scheduled-post lifecycle block. It does not add a second scheduler or a parallel post model. Calendar and Queue are operator views over the existing `posts`, `publications`, and `scheduler_jobs` records.

## Scope

V18 adds:

- month, week, and day publishing calendar views;
- previous / today / next calendar navigation;
- drag-to-reschedule while preserving the browser-local time of day;
- queue filtering by platform, connected account, publication state, and API time range;
- edit scheduled caption;
- reschedule a scheduled post;
- cancel safe scheduled/retrying work;
- duplicate an existing post into a new future schedule;
- retry a failed publication only when automatic retry is safe;
- bulk cancel and bulk reschedule;
- atomic social scheduling creation;
- atomic WhatsApp campaign scheduling creation;
- atomic multi-post lifecycle mutations for both JSON and PostgreSQL persistence.

Drafts/autosave are deliberately not part of V18. They remain the next source-defined product milestone.

## Safety model

Lifecycle actions fail closed when an external side effect may already exist.

### Edit / reschedule

A social post can be edited or rescheduled only while every publication is still `SCHEDULED` and its social execution job is still `SCHEDULED`. A `RUNNING` job or any already-started state blocks the mutation.

### Cancel

Cancellation is permitted only for safe scheduled/retrying publications and jobs. If a publication already has a provider `externalId`, cancellation is rejected rather than pretending a provider-side object was cancelled.

### Retry

A failed publication can be retried only when:

- its state is one of the known failure states;
- it has no provider `externalId`;
- no matching social job is currently running;
- an existing failed/completed/cancelled social job can be safely reset.

The existing job is reset and reused; V18 does not create a second competing external execution path.

### Duplicate

Duplicate creates a new scheduled post through the normal scheduling service. Connected account bindings and provider-specific scheduling validation are checked again at duplication time.

## Atomic persistence

V18 resolves the previously tracked multi-record scheduling consistency gap.

### PostgreSQL

Social scheduling writes the post, media, publications, and scheduler jobs inside one database transaction. WhatsApp campaign scheduling likewise writes the campaign, recipients, and scheduler job inside one transaction.

Bulk lifecycle changes are prevalidated and then applied in one transaction. A child failure rolls the complete operation back.

### JSON

The development repository applies the equivalent graph/lifecycle mutation to an isolated in-memory candidate snapshot. The candidate is atomically persisted and becomes live only after persistence succeeds.

Failure-injection tests verify that partially written graphs are not published to the active repository state.

## Protected API

All V18 lifecycle routes remain behind the existing application-auth/session and same-origin mutation boundary.

```text
GET    /api/posts?platform=&accountId=&state=&from=&until=
PATCH  /api/posts/:id
POST   /api/posts/:id/cancel
POST   /api/posts/:id/duplicate
POST   /api/publications/:id/retry
POST   /api/posts/bulk/cancel
POST   /api/posts/bulk/reschedule
```

`GET /api/posts` returns the operational nested read model required by Queue/Calendar, including each post's media, publications, and relevant scheduler jobs.

Lifecycle conflicts return a sanitized HTTP `409` with a stable reason code. Validation errors remain HTTP `400`; unknown records return `404`.

## Browser UI

The dashboard now has two coordinated views backed by the same API state:

### Calendar

- Month / Week / Day modes
- Previous / Today / Next navigation
- local-time rendering
- drag a post onto another local calendar date to reschedule it while preserving its local time-of-day

### Queue

- platform filter
- account filter
- state filter
- refresh
- per-post edit, reschedule, duplicate, cancel, and safe retry actions
- multi-select
- bulk reschedule
- bulk cancel

The Queue and Calendar controller uses DOM node creation rather than `innerHTML` for dynamic lifecycle data.

## Verification

The V18 feature-head GitHub Actions run `34847163782` passed on commit `a8a6efcca75a33751fc6a5fbffd2de16abea7715`:

```text
381 tests passed
0 tests failed
PostgreSQL 17 migrations passed
JavaScript syntax checks passed
```

Coverage includes:

- PostgreSQL social graph rollback on child failure;
- PostgreSQL WhatsApp graph rollback on recipient failure;
- JSON candidate-snapshot rollback/failure injection;
- state-safe edit/reschedule/cancel/retry/duplicate behavior;
- bulk prevalidation and atomic mutation calls;
- lifecycle HTTP status/error contracts;
- queue filter encoding;
- month/week/day calendar date generation;
- drag-date local-time preservation;
- dashboard Queue/Calendar wiring and safe DOM rendering.

Browser E2E automation remains a separate tracked verification gap under `SR-P001`.

## Next source-defined milestone

The next live roadmap milestone should be **Drafts + Composer Workflows**:

- draft persistence;
- composer autosave/recovery;
- reusable caption templates;
- hashtag collections;
- reusable destination groups;
- platform-specific caption/media overrides;
- preview and compatibility/character-limit reporting.
