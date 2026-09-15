# V20 — Analytics & Reporting

V20 implements source roadmap item 98: basic social analytics for Srocial-published content without introducing a separate analytics warehouse or a second scheduler.

## Scope

V20 adds provider-neutral publication metric snapshots, filtered reporting, manual/bounded refresh operations, and an Analytics dashboard for Instagram, Facebook Pages, Threads, and TikTok.

The normalized metric fields are:

- `views`
- `reach`
- `likes`
- `comments`
- `shares`
- `saves`
- `extraMetrics` for provider-specific counters that do not map safely to the shared fields

A provider may not expose every metric for every media type. Missing/unsupported metrics remain unavailable (`null`) rather than being converted to invented zeroes.

## Persistence model

Analytics uses append-only publication snapshots. PostgreSQL migration `008_analytics.sql` creates `publication_metric_snapshots`; the JSON repository keeps the equivalent collection.

Each snapshot records:

- publication ID
- account ID when available
- provider
- provider external publication ID
- normalized counters
- provider-specific safe extra counters
- capture timestamp

Reports use the **latest snapshot per publication** when calculating cumulative KPIs. Older snapshots are retained as history, but they are not summed together. This avoids double-counting cumulative provider counters after repeated refreshes.

PostgreSQL and JSON expose the same repository contract:

```text
createPublicationMetricSnapshot(record)
listPublicationMetricSnapshots(filters)
getLatestPublicationMetricSnapshot(publicationId)
```

## Refresh safety

Analytics refresh is intentionally separate from publishing execution.

A publication is eligible for provider refresh only when it is already published, has a bound connected account, and has a provider external ID. Provider errors write no snapshot.

Analytics refresh does **not**:

- create or claim scheduler jobs;
- publish content;
- retry publication execution;
- mutate post/publication lifecycle state;
- bypass account/provider credential checks.

The bulk refresh endpoint is bounded and sequential. It refreshes at most 25 eligible recent publications per request, so Analytics cannot accidentally become an unbounded background crawler.

## Provider adapters and permissions

Analytics adapters are registered independently from publishing adapters and normalize provider responses into the shared metric shape.

V20 adds analytics permissions to new OAuth connections where needed:

- Instagram: `instagram_business_manage_insights`
- Threads: `threads_manage_insights`
- TikTok: `video.list`

Facebook continues through its existing Page/Graph permission model used by the configured adapter.

Existing connected accounts are not silently granted newly introduced scopes. An account connected before V20 may need to be reconnected before provider analytics refresh succeeds.

Provider APIs, app review, media-type metric availability, and permission behavior can change independently of deterministic CI. Live provider verification therefore remains tracked in `PROBLEMS.md` rather than being treated as complete.

## Protected API

Analytics management routes use the existing administrator-session, API-rate-limit, and same-origin mutation protections.

```text
GET  /api/analytics?platform=&accountId=&from=&until=
POST /api/analytics/refresh
POST /api/analytics/publications/:id/refresh
```

`GET /api/analytics` returns a sanitized report containing KPI totals, daily series, and per-publication rows based on latest snapshots.

`POST /api/analytics/refresh` accepts bounded filters and returns per-publication refresh results. A provider failure for one publication is reported without manufacturing a snapshot.

`POST /api/analytics/publications/:id/refresh` refreshes one eligible publication.

Raw provider response bodies and credentials are not exposed through the reporting API.

## Browser UI

The dashboard adds an **Analytics** section with:

- date range filters;
- platform filter;
- account filter;
- KPI cards;
- daily trend output;
- per-publication performance rows;
- snapshot freshness/capture time;
- one-publication refresh;
- bounded recent-publication refresh.

The page uses the shared JSON client and safe DOM construction rather than rendering provider/user-derived values through `innerHTML`.

## Verification

Automated coverage includes:

- JSON append-only snapshot persistence and legacy-state compatibility;
- PostgreSQL migration and snapshot round-trip/filter/latest-selection behavior;
- latest-snapshot report aggregation without cumulative double-counting;
- filter handling;
- refresh eligibility and provider-failure no-write behavior;
- bounded refresh behavior;
- Instagram/Facebook/Threads/TikTok metric normalization;
- new analytics OAuth scope contracts;
- protected route payload/error mapping;
- Analytics dashboard/API wiring and safe DOM rendering;
- full repository regression suite and JavaScript syntax checks.

The pre-documentation V20 exact-head run `34953690972` passed **418/418 tests**, applied migrations through `008_analytics.sql`, and passed JavaScript syntax checks.

A fresh exact-head CI run is required after release-document updates and again on the pull request/main merge before V20 is considered integrated.

## Verification gap

Deterministic tests cannot prove real provider permissions or metric availability. V20 must remain marked with a live-provider `VERIFY` problem until approved apps/accounts are used to verify representative published content on Instagram, Facebook Pages, Threads, and TikTok.

Browser E2E coverage for the Analytics operator surface also remains part of the existing `SR-P001` gap.
