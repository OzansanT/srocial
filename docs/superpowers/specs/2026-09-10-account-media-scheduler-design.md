# Account, Media, and Scheduler V6 Design

## Goal

Make an Instagram scheduled post executable end to end by binding every real publication to an explicit connected account, persisting provider-ready media with the post, exposing those choices in the composer, and starting the scheduler only behind explicit production safety gates.

## Scope

V6 includes:

- explicit `destinations[]` input with `{ platform, accountId }`;
- backward-compatible support for legacy `platforms[]` input;
- server-side validation that an account exists, is `CONNECTED`, and matches its destination platform;
- `media[]` input persisted as post media records;
- safe generic media validation (`image`/`video`, HTTPS URL, bounded count);
- composer loading safe accounts from `GET /api/accounts`;
- composer account selectors and a single media URL/type input;
- a recurring scheduler loop using the existing `runSchedulerTick()` primitive;
- scheduler activation only when both `ALLOW_REAL_PUBLISH=true` and `SCHEDULER_ENABLED=true`;
- overlap protection so a slow tick cannot run concurrently with the next tick;
- clean shutdown of the interval on process termination;
- environment/documentation updates and regression tests.

V6 does not add file upload/object storage, Facebook/Threads/TikTok provider adapters, or a full account-management page.

## Scheduling Contract

Preferred request:

```json
{
  "caption": "Scheduled content",
  "destinations": [
    { "platform": "instagram", "accountId": "account-uuid" }
  ],
  "media": [
    { "type": "image", "url": "https://cdn.example.com/post.jpg" }
  ],
  "scheduledAt": "2026-09-11T10:00:00.000Z"
}
```

Legacy requests using `platforms: ["instagram"]` remain accepted for existing tests and non-live development records, but those publications have `accountId: null` and are not suitable for real provider execution.

Destinations are deduplicated by `(platform, accountId)`. For an explicit destination, the server must reject missing, disconnected, or cross-platform accounts.

## Media Contract

Generic post media records use:

```text
postId
type = image | video
url = HTTPS URL
sortOrder
```

V6 accepts 0-10 media records at the generic post layer. Provider adapters remain responsible for stricter provider-specific limits. The current Instagram adapter may therefore reject a post that is syntactically valid globally but unsupported by Instagram.

## Composer

The composer loads safe account metadata through `client/js/api/accounts-api.js`.

Each social platform row contains a destination checkbox and account selector. Only connected accounts for that platform are selectable. Platforms without connected accounts are disabled in the V6 UI to avoid scheduling work that is guaranteed to fail.

The first media control supports:

- media type: image or video;
- externally reachable HTTPS URL.

Object upload/storage is a later subsystem.

## Scheduler Runtime

`server/scheduler/start-scheduler-loop.js` owns recurring execution. It accepts injected dependencies so tests can use a fake tick function and fake timer.

Activation requires:

```text
ALLOW_REAL_PUBLISH=true
SCHEDULER_ENABLED=true
```

Default interval: 30 seconds, configurable through `SCHEDULER_INTERVAL_MS` with a safe lower bound.

The loop uses one worker ID for its lifetime and an `inFlight` guard. If one tick is still running when the next timer fires, the overlapping invocation is skipped rather than executing concurrently.

The scheduler receives the real platform registry created at server startup. Existing worker-level locks and idempotency remain the duplicate-publication safety layer.

## Security

- Account tokens remain encrypted at rest and server-only.
- The composer receives only safe account metadata.
- The frontend never receives encrypted token fields.
- Real publication remains disabled by default.
- Enabling `SCHEDULER_ENABLED` without `ALLOW_REAL_PUBLISH` does not start the loop.
- Enabling `ALLOW_REAL_PUBLISH` without `SCHEDULER_ENABLED` does not start the loop.

## Error Handling

Post validation returns existing structured `validation_error` responses with field-level details for account/destination/media failures.

Scheduler tick failures are logged without terminating the process or exposing credentials. The next interval remains eligible to run after the previous invocation finishes.

## Testing

Tests must cover:

- explicit destination account binding;
- disconnected/missing/cross-platform account rejection;
- destination deduplication;
- media persistence and ordering;
- invalid media URL/type/count rejection;
- legacy `platforms[]` compatibility;
- scheduler disabled unless both gates are true;
- scheduler loop overlap prevention;
- recurring tick invocation and stop behavior;
- composer payload construction using account IDs and media;
- existing post, OAuth/account, repository, scheduler, and Instagram tests remaining green.
