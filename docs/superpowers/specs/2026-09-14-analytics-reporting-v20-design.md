# V20 Analytics & Reporting Design

## Roadmap basis

The source roadmap's next unresolved product capability after live V19 is item 98: **Basic social analytics** — views/reach/likes/comments when supported, without turning Srocial into a large analytics warehouse. Source items 91–97 substantially overlap V16 Operations Center, item 99 is V17 WhatsApp Business, and item 100 is partly covered by the current single-administrator authentication model.

## Goal

Add a provider-neutral analytics layer that can capture current post metrics, persist historical snapshots, summarize the latest known performance by date/platform/account, and expose a simple operator dashboard. Analytics must remain observational: it must not publish content, create publishing jobs, cancel jobs, or change publication lifecycle state.

## Scope

V20 includes:

- append-only metric snapshots linked to published social publications;
- canonical metrics: `views`, `reach`, `likes`, `comments`, `shares`, `saves`, plus normalized provider-specific `extraMetrics`;
- JSON and PostgreSQL persistence parity;
- provider analytics adapters isolated from publishing adapters;
- protected analytics refresh/reporting APIs;
- date/platform/account filters;
- latest-snapshot KPI totals, time-series buckets, and top-post rows;
- an Analytics dashboard page using vanilla HTML/CSS/JavaScript;
- explicit freshness and unsupported/unavailable metric states;
- deterministic provider adapter tests and live-provider verification debt tracking.

V20 does not add a second scheduler, continuous metric polling, a data warehouse, attribution modeling, revenue analytics, audience demographic storage, or raw provider response persistence.

## Data model

Add migration `008_analytics.sql` with `publication_metric_snapshots`:

- `id uuid PRIMARY KEY`
- `publication_id uuid NOT NULL REFERENCES publications(id) ON DELETE CASCADE`
- `account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL`
- `provider text NOT NULL`
- `external_id text NOT NULL`
- nullable bigint metrics: `views`, `reach`, `likes`, `comments`, `shares`, `saves`
- `extra_metrics jsonb NOT NULL DEFAULT '{}'::jsonb`
- `captured_at timestamptz NOT NULL`

Indexes cover publication recency, account/provider filtering, and capture time. Snapshots are append-only; reports choose the newest snapshot per publication so repeated refreshes never double-count cumulative provider totals.

JSON persistence adds `publicationMetricSnapshots` to the root state and mirrors the same repository contract.

## Provider analytics boundary

Create a dedicated analytics registry. Each provider may register an analytics adapter exposing:

```js
getMetrics({ publication, account }) -> {
  views, reach, likes, comments, shares, saves,
  extraMetrics
}
```

The adapter owns provider endpoints and normalization. It returns only safe normalized numeric values; raw provider bodies are never stored in snapshots or returned by Srocial APIs.

Provider registration reuses the existing server-side encrypted credential resolver pattern. Existing publishing adapters remain unchanged.

### Provider mappings

- **Instagram:** media insights normalize supported `views`, `reach`, `likes`, `comments`, `shares`, and `saved` -> `saves`. New connections request `instagram_business_manage_insights` in addition to the existing Instagram scopes. Existing accounts may need reconnect to grant it.
- **Facebook Pages:** use Page/post insight and summary fields available to the connected Page token. Normalize supported media views/unique viewers and engagement counts. `pages_read_engagement` is already requested; unsupported individual metrics stay null rather than fabricated.
- **Threads:** thread insights normalize `views`, `likes`, `replies` -> `comments`, `shares`; provider-only repost/quote metrics go in `extraMetrics`. New connections request `threads_manage_insights`.
- **TikTok:** Display API video query uses the documented `video.list` scope and normalizes `view_count`, `like_count`, `comment_count`, and `share_count`. The default TikTok scope set adds `video.list`; existing accounts may need reconnect.

If a provider rejects analytics access because an existing token lacks the new permission, the refresh returns a sanitized provider error and does not write a snapshot.

## Service rules

`analytics-service.js` owns refresh/report logic.

Refresh preconditions:

1. publication exists;
2. publication belongs to Instagram/Facebook/Threads/TikTok;
3. publication state is `PUBLISHED`;
4. publication has `externalId`;
5. publication has a bound account;
6. account exists, is `CONNECTED`, and matches the publication provider;
7. provider analytics adapter exists.

Refresh calls one provider adapter, validates returned metrics as non-negative integers or null, persists one append-only snapshot, and returns the sanitized snapshot. Provider failures write no analytics record and never affect publication/provider execution state.

Reports use only the latest snapshot per publication inside the selected range. Filters apply to publication/account/provider identity, while `from`/`until` refer to publication schedule/publish chronology rather than snapshot capture time. The report returns:

- `summary` totals for canonical metrics;
- `series` daily buckets;
- `posts` sorted by views then engagement with caption excerpt/platform/account/published time/freshness;
- `freshness` with newest and oldest snapshot capture timestamps;
- filter echo and count metadata.

## API

Protected management routes:

```text
GET  /api/analytics?from=&until=&platform=&accountId=
POST /api/analytics/publications/:id/refresh
POST /api/analytics/refresh
```

`POST /api/analytics/refresh` refreshes a bounded set of recently published, account-bound publications matching optional filters. It processes sequentially, caps work at 25 publications, returns per-publication success/error codes, and never retries automatically. This reduces rate-limit pressure and avoids creating background work.

Invalid dates/platforms/account IDs return `400`; unavailable records return `404`; unsafe publication states return `409`; provider permission/auth/rate-limit/network failures return sanitized codes without raw provider messages.

## UI

Add Analytics navigation and a dedicated page with:

- date range, platform, and account filters;
- Refresh recent action;
- KPI cards for views, reach, likes, comments, shares, saves;
- simple daily series rendered with safe DOM/CSS (no chart library);
- top-post performance table;
- snapshot freshness/status text;
- explicit `—`/unavailable treatment rather than converting unknown metrics to zero at row level.

Frontend requests live in `client/js/api/analytics-api.js`; page rendering lives in `client/js/pages/analytics.js`; page-only styles live in `client/css/pages/analytics.css`. No `innerHTML` is required for dynamic analytics data.

## Security and safety

- Analytics routes remain behind the existing application-session and same-origin mutation checks.
- Provider tokens remain server-side and encrypted at rest.
- No raw provider analytics payload is persisted or exposed.
- Analytics refresh cannot create scheduler jobs or publication side effects.
- Provider errors are normalized and sanitized.
- A batch refresh is bounded to 25 and sequential to reduce provider load.

## Verification

Deterministic tests must cover:

- migration/schema and JSON/PostgreSQL snapshot parity;
- latest-snapshot selection without cumulative double counting;
- filters, daily series, top-post ordering, and unknown metrics;
- refresh preconditions and no-write-on-provider-error behavior;
- batch cap and partial-result handling;
- Instagram/Facebook/Threads/TikTok analytics normalization with fake HTTP clients;
- required analytics scopes in provider config;
- protected analytics APIs;
- dashboard navigation/module/style wiring and safe DOM rendering;
- full existing regression suite and JavaScript syntax.

Real provider analytics access cannot be proven by CI because Srocial has no approved live provider applications/tokens in the repository. `PROBLEMS.md` must track live analytics verification and browser E2E separately.