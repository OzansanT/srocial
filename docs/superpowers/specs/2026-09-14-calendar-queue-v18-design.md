# V18 Calendar + Queue Lifecycle Design

## Purpose

Close the source roadmap's unfinished **Queue + Calendar + Post Management** block before moving to drafts or analytics. V18 adds state-safe operator lifecycle controls for existing scheduled social posts and replaces the placeholder/basic queue with an operational queue plus month/week/day calendar.

The historical source listed full Users/Roles as V18, but Srocial already introduced application authentication earlier. The live repository still lacks the source's calendar/queue lifecycle feature set, so this milestone is named V18 in the live sequence.

## Scope

V18 includes:

- resolve `SR-P009` by making social and WhatsApp schedule creation atomic;
- enriched social queue records with publication/job state;
- filter by platform, account, publication state, and time range;
- edit caption for work that has not begun;
- reschedule scheduled work;
- cancel scheduled/retrying work;
- duplicate a post into a new future schedule;
- manual retry of a failed publication when retry is safe;
- bulk cancel and bulk reschedule;
- month/week/day calendar views;
- calendar navigation and today control;
- drag-to-reschedule by dropping a scheduled post on a calendar day;
- dedicated queue/calendar API modules, UI modules, and CSS;
- deterministic JSON/PostgreSQL/API/service/UI tests.

V18 does **not** add drafts, autosave, content templates, analytics, or multi-user RBAC. Those remain later roadmap work.

## Architectural Rules

- Keep one scheduler. Lifecycle actions mutate existing scheduler jobs or create normal `SOCIAL_PUBLICATION` jobs; no second queue/cron system.
- Keep provider logic isolated. Queue/calendar lifecycle code must not call Meta/TikTok APIs directly.
- All lifecycle mutations are server-authoritative and protected by existing application authentication/same-origin mutation checks.
- All timestamps are canonical UTC at the API/repository boundary. The browser converts local `datetime-local` values to ISO UTC.
- State transitions fail closed when external execution may already have happened.
- Bulk mutations are all-or-nothing after pre-validation.
- No raw provider errors, tokens, or webhook payloads enter queue/calendar responses.

## Atomic Scheduling Foundation (`SR-P009`)

### Repository contracts

Add two repository-level atomic creation units:

```js
createSocialScheduleGraph({ post, media, publicationPlans })
createWhatsAppCampaignGraph({ campaign, recipients, job })
```

`publicationPlans` items contain:

```js
{
  publication: { accountId, platform, state, scheduledAt, providerOptions, ... },
  job: { type, state, scheduledAt, attempts, ... }
}
```

The repository assigns IDs and binds:

- media -> created post;
- publication -> created post;
- publication job -> created publication;
- WhatsApp recipients -> created campaign;
- WhatsApp campaign job -> created campaign.

PostgreSQL implements each unit inside `BEGIN/COMMIT` with rollback on any failure. JSON implements each unit inside one queued mutation against a cloned candidate snapshot and only replaces persisted in-memory data after the complete mutation succeeds.

Add one atomic lifecycle update contract:

```js
updateSocialLifecycleGraph({
  postId,
  postPatch,
  publicationPatches,
  jobPatches
})
```

It updates the post/publications/jobs in one atomic unit after the service has prevalidated current states.

The existing primitive repository methods remain available to workers and other already-isolated code.

## Lifecycle Read Model

`listScheduledPosts()` becomes an operator read model. Each returned post contains:

```js
{
  ...post,
  media: [...],
  publications: [
    {
      ...publication,
      jobs: [...matching scheduler jobs]
    }
  ]
}
```

Service filtering supports:

```text
platform
accountId
state
from
until
```

A post is included when at least one publication matches platform/account/state filters and the post schedule intersects the requested time range.

## State Safety

### Edit caption

Allowed only when **every** publication is `SCHEDULED` and no matching social publication job is `RUNNING` or terminal-completed.

Only the master caption is edited in V18. Media/destination/provider options are not editable yet; users can duplicate and create a new schedule for broader content changes.

### Reschedule

Allowed only when every publication is `SCHEDULED` and each matching `SOCIAL_PUBLICATION` job is `SCHEDULED`.

Atomic update changes:

- `posts.scheduled_at`;
- every publication `scheduled_at`;
- every matching social publication job `scheduled_at`;
- `updated_at` fields.

The new schedule must be strictly in the future.

### Cancel

Allowed when every publication is `SCHEDULED` or `RETRYING` and none has an external provider ID.

Atomic update changes eligible publications/jobs to `CANCELLED`, clears locks, and preserves historical attempts.

Cancellation is rejected if a publication is already processing/publishing/published or has an external provider ID.

### Retry failed publication

Allowed only for one publication when:

- publication state is `FAILED`, `API_ERROR`, `MEDIA_ERROR`, `AUTH_ERROR`, or `RATE_LIMITED`;
- `externalId` is null;
- no matching social publication job is `RUNNING`;
- a matching failed/cancelled/completed publication job exists.

Retry reuses the existing job by resetting it to `SCHEDULED`, sets attempts to `0`, clears lock/error fields, and updates the publication to `SCHEDULED` with a future `scheduledAt` (default: now + 1 minute when omitted).

If an external ID exists, the service rejects retry as unsafe to prevent duplicate provider content.

### Duplicate

Duplicate is a create operation, not a state mutation. It reconstructs an input from the source post's caption/media/publications and calls the normal `createScheduledPost()` validation path with a required new future schedule.

Connected account validation and provider-specific options are therefore rechecked at duplication time.

## Bulk Operations

### Bulk cancel

Input:

```js
{ postIds: ["...", "..."] }
```

The service loads and validates all selected posts first. If any selected post cannot be cancelled, nothing is mutated. If all pass, one repository atomic lifecycle update per post is executed. For PostgreSQL, expose a multi-post atomic method so the entire bulk operation is one database transaction; JSON performs one candidate-snapshot mutation.

### Bulk reschedule

Input:

```js
{ postIds: ["...", "..."], scheduledAt: "ISO-UTC" }
```

All selected posts move to the same requested timestamp in V18. This is intentionally simple and deterministic. Offset-based staggering is not included.

## HTTP API

Existing:

```text
GET  /api/posts
POST /api/posts
```

V18 adds:

```text
PATCH /api/posts/:id
POST  /api/posts/:id/cancel
POST  /api/posts/:id/duplicate
POST  /api/publications/:id/retry
POST  /api/posts/bulk/cancel
POST  /api/posts/bulk/reschedule
```

`GET /api/posts` accepts optional query parameters:

```text
platform
accountId
state
from
until
```

Mutation responses use:

- `200` for edit/reschedule/cancel/retry;
- `201` for duplicate;
- `400 validation_error` for malformed timestamps/input;
- `404 not_found` for unknown post/publication;
- `409 lifecycle_conflict` for unsafe state transitions.

Routes remain thin and delegate to `post-lifecycle-service.js`.

## UI

### Queue

Create `client/js/pages/queue.js` and `client/css/pages/queue.css`.

Queue rows show:

- selection checkbox;
- caption;
- local scheduled time;
- platform/account/state badges;
- Edit;
- Cancel;
- Duplicate;
- Retry for failed publications when server state indicates eligibility.

Edit opens an inline editor with caption and schedule fields. The save action sends one PATCH request.

Queue filters include platform/account/status plus a refresh button.

Bulk toolbar supports:

- cancel selected;
- reschedule selected to one chosen local datetime.

### Calendar

Create:

```text
client/js/components/calendar.js
client/js/pages/calendar.js
client/css/components/calendar.css
client/css/pages/calendar.css
```

Views:

- month: standard 7-column date grid covering the visible month;
- week: seven day columns for the selected week;
- day: one date column/list.

Controls:

- Month / Week / Day tabs;
- Previous;
- Today;
- Next.

Calendar cards show caption + platform state summary and are draggable only when rescheduling is allowed. Dropping a card on a day preserves the post's browser-local time-of-day and changes only the date, then calls the normal PATCH reschedule endpoint. Keyboard users can use the queue edit/reschedule controls; drag is an enhancement, never the only path.

## Frontend Data Flow

`client/js/api/posts-api.js` owns all lifecycle HTTP calls.

`client/js/app.js` owns only bootstrap coordination. It initializes queue/calendar and provides one shared `refreshPublishingData()` callback after lifecycle changes or new scheduling.

`dashboard.js` stops owning the operational queue renderer; its dashboard summary responsibilities remain.

## Error Handling

The backend emits stable safe error codes:

```text
validation_error
not_found
lifecycle_conflict
```

`lifecycle_conflict` payloads include a safe reason such as:

```text
post_already_started
unsafe_external_id
not_failed
job_running
```

No raw provider error text is returned.

The UI displays a concise operator message and refreshes server state after conflicts.

## Testing

TDD coverage must include:

1. JSON atomic graph creation rolls back on injected mid-operation failure.
2. PostgreSQL graph creation rolls back after a real child/FK failure.
3. WhatsApp graph creation is migrated to the atomic repository contract.
4. lifecycle service edit/reschedule/cancel success and conflict cases.
5. retry rejects external-ID ambiguity and safely resets eligible failed work.
6. duplicate reuses normal provider/account validation.
7. bulk operations prevalidate and do not partially mutate.
8. API routes/status codes/query filters.
9. queue/calendar API client wiring.
10. month/week/day calendar range helpers and drop-date reschedule calculation.
11. static UI structure and module imports.
12. complete existing suite, PostgreSQL migrations, and JS syntax checks.

## Problem Tracker Outcome

If deterministic JSON/PostgreSQL rollback tests and full CI pass, move `SR-P009` to Resolution History with that evidence.

`SR-P005` may be marked RESOLVED only if the backend lifecycle APIs, queue actions, month/week/day calendar, filtering, drag/reschedule, and bulk controls are all implemented and verified by deterministic tests. Browser E2E remains separately tracked under `SR-P001` and does not become resolved merely because static/browser-module tests pass.

## Roadmap After V18

After V18 the next source-defined product work is:

1. drafts + autosave + richer creation workflows;
2. analytics/reporting;
3. browser E2E hardening;
4. full users/roles/RBAC only if multi-user/public deployment requirements justify it.
