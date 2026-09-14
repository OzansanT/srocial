# V20 Analytics & Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement source-roadmap item 98 as provider-neutral, persisted social post analytics with filtered reporting and an operator dashboard.

**Architecture:** Add append-only normalized metric snapshots with JSON/PostgreSQL parity, isolate provider metric fetching behind a dedicated analytics registry, aggregate only each publication's latest snapshot, and expose protected refresh/report APIs plus a vanilla-JS Analytics page. Analytics remains observational and never creates scheduler jobs or mutates publication lifecycle state.

**Tech Stack:** Node.js >=20 built-in HTTP, vanilla HTML/CSS/JavaScript ES modules, JSON repository, PostgreSQL 17 + `pg`, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-14-analytics-reporting-v20-design.md`

## Global Constraints

- Frontend remains HTML/CSS/vanilla JavaScript; no framework or chart dependency.
- JSON and PostgreSQL persistence must have behavior parity.
- Analytics stores normalized metrics only; never raw provider responses.
- Analytics must not create/claim/update scheduler jobs or change publication lifecycle state.
- Protected analytics routes inherit existing admin-session and same-origin mutation enforcement.
- Batch refresh is sequential and capped at 25 publications.
- Unknown/unsupported metrics remain `null` at snapshot/row level; aggregation treats only known values as numeric contributions.
- Existing safe execution defaults remain unchanged.

---

### Task 1: Analytics snapshot persistence

**Files:**
- Create: `server/db/migrations/008_analytics.sql`
- Create: `server/db/json-analytics.js`
- Create: `server/db/postgres-analytics.js`
- Modify: `server/db/json-repository.js`
- Modify: `server/db/postgres-repository.js`
- Test: `tests/analytics-repository.test.js`
- Test: `tests/postgres-analytics.test.js`

**Interfaces:**
- Produces: `createPublicationMetricSnapshot(snapshot)`, `listPublicationMetricSnapshots(filters={})`, `getLatestPublicationMetricSnapshot(publicationId)`.

- [ ] **Step 1: Write failing repository tests**

```js
const created = await repository.createPublicationMetricSnapshot({
  id, publicationId, accountId, provider: 'instagram', externalId: 'ig-1',
  views: 100, reach: 80, likes: 12, comments: 3, shares: 2, saves: 4,
  extraMetrics: {}, capturedAt: now
});
assert.equal((await repository.getLatestPublicationMetricSnapshot(publicationId)).views, 100);
```

Also assert a later snapshot becomes latest while the earlier snapshot remains queryable, and PostgreSQL FK/schema behavior matches JSON.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/analytics-repository.test.js tests/postgres-analytics.test.js`
Expected: FAIL because analytics repository methods/migration do not exist.

- [ ] **Step 3: Implement migration and repository methods**

Use nullable BIGINT canonical metrics, JSONB `extra_metrics`, append-only inserts, defensive clones in JSON, and parameterized SQL in PostgreSQL.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `node --test tests/analytics-repository.test.js tests/postgres-analytics.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: persist analytics metric snapshots"
```

### Task 2: Analytics report service

**Files:**
- Create: `server/services/analytics-service.js`
- Test: `tests/analytics-service.test.js`

**Interfaces:**
- Consumes repository snapshot/publication/post/account methods and an analytics registry.
- Produces: `createAnalyticsService({ repository, analyticsRegistry })` with `refreshPublication`, `refreshRecent`, and `report`.

- [ ] **Step 1: Write failing service tests**

```js
const report = await service.report({ platform: 'instagram', from, until });
assert.deepEqual(report.summary, {
  views: 180, reach: 140, likes: 22, comments: 5, shares: 3, saves: 6
});
assert.equal(report.posts.length, 2);
```

Test latest-snapshot-only aggregation, date/platform/account filters, daily buckets, null metrics, refresh preconditions, no snapshot on provider error, and 25-item batch cap with partial results.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/analytics-service.test.js`
Expected: FAIL because service is missing.

- [ ] **Step 3: Implement normalization/reporting**

Validate metric values as non-negative integers or null, sanitize adapter failures to codes, select latest snapshot per publication before aggregation, and process batch refresh sequentially.

- [ ] **Step 4: Run and verify GREEN**

Run: `node --test tests/analytics-service.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add analytics reporting service"
```

### Task 3: Provider analytics adapters and scopes

**Files:**
- Create: `server/analytics/registry.js`
- Create: `server/platforms/instagram/analytics.js`
- Create: `server/platforms/facebook/analytics.js`
- Create: `server/platforms/threads/analytics.js`
- Create: `server/platforms/tiktok/analytics.js`
- Modify: provider `index.js` files
- Modify: `server/platforms/instagram/config.js`
- Modify: `server/platforms/threads/config.js`
- Modify: `server/platforms/tiktok/config.js`
- Test: `tests/analytics-provider-registry.test.js`
- Test: `tests/instagram-analytics.test.js`
- Test: `tests/facebook-analytics.test.js`
- Test: `tests/threads-analytics.test.js`
- Test: `tests/tiktok-analytics.test.js`
- Modify provider config/registration tests as required.

**Interfaces:**
- Produces: analytics registry `Map`; provider adapters exposing `getMetrics({ publication, account })`.

- [ ] **Step 1: Write failing adapter tests**

Examples:

```js
assert.deepEqual(await adapter.getMetrics({ publication, account }), {
  views: 120, reach: null, likes: 10, comments: 2, shares: 1, saves: null,
  extraMetrics: {}
});
```

Assert URLs/fields/scopes, provider response normalization, missing metric -> null, malformed numeric metric -> safe provider error, and no raw response leakage.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/*-analytics.test.js tests/analytics-provider-registry.test.js`
Expected: FAIL because analytics adapters/registry are missing.

- [ ] **Step 3: Implement isolated adapters**

Instagram requests normalized media insight metrics; Facebook requests supported post insights/count summaries; Threads requests thread insights; TikTok queries video metrics using `video.list`. Add `instagram_business_manage_insights`, `threads_manage_insights`, and default TikTok `video.list` for future OAuth connections. Provider indexes register analytics adapters only when an analytics registry is supplied.

- [ ] **Step 4: Run and verify GREEN**

Run focused adapter/config/registration tests and confirm all pass.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add social analytics provider adapters"
```

### Task 4: Protected analytics API and runtime wiring

**Files:**
- Create: `server/routes/analytics.js`
- Modify: `server/app.js`
- Modify: `server/server.js`
- Test: `tests/analytics-api.test.js`
- Modify: `tests/app-auth-api.test.js` if needed for protected route assertions.

**Interfaces:**
- Produces:
  - `GET /api/analytics`
  - `POST /api/analytics/publications/:id/refresh`
  - `POST /api/analytics/refresh`

- [ ] **Step 1: Write failing API tests**

Assert query validation, protected access, refresh success, sanitized provider errors, batch partial results, and that analytics actions do not add/alter scheduler jobs.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/analytics-api.test.js`
Expected: FAIL because route/runtime wiring is absent.

- [ ] **Step 3: Implement route and runtime wiring**

Create one analytics registry in `server/server.js`, pass it to provider registration and `createApp`, route requests only after existing auth/origin gates, and map service error codes to safe HTTP statuses.

- [ ] **Step 4: Run and verify GREEN**

Run focused API/auth tests.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: expose protected analytics APIs"
```

### Task 5: Analytics dashboard UI

**Files:**
- Create: `client/js/api/analytics-api.js`
- Create: `client/js/pages/analytics.js`
- Create: `client/css/pages/analytics.css`
- Modify: `client/index.html`
- Modify: `client/js/app.js`
- Test: `tests/analytics-ui.test.js`
- Test: `tests/analytics-client.test.js`

**Interfaces:**
- Frontend API: `getAnalytics(filters)`, `refreshAnalytics(filters)`, `refreshPublicationAnalytics(id)`.
- Page bootstrap: `initAnalyticsPage()`.

- [ ] **Step 1: Write failing client/UI tests**

Assert Analytics navigation/panel/style/module anchors, API encoding, KPI/filter/top-post/freshness rendering, refresh interaction, and absence of dynamic `innerHTML` rendering.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/analytics-client.test.js tests/analytics-ui.test.js`
Expected: FAIL because UI does not exist.

- [ ] **Step 3: Implement Analytics page**

Use safe DOM APIs, existing card/form/button styles, page-specific responsive CSS, semantic tables, and simple CSS bar rows for daily series.

- [ ] **Step 4: Run and verify GREEN**

Run focused UI/client tests.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add analytics dashboard"
```

### Task 6: Documentation and persistent verification tracking

**Files:**
- Create: `docs/V20_ANALYTICS_REPORTING.md`
- Modify: `README.md`
- Modify: `PROBLEMS.md`

- [ ] **Step 1: Document operator behavior and limitations**

Document normalized metric semantics, refresh behavior, OAuth reconnect requirement for new insight scopes, no continuous polling, protected APIs, and safe defaults.

- [ ] **Step 2: Add verification debt**

Add `SR-P010 | P1 | VERIFY` for real provider analytics verification and extend `SR-P001` to cover Analytics filters/refresh/rendering in browser E2E.

- [ ] **Step 3: Update roadmap/status**

Set README current status to V20, add migration 008/data model/API/UI, and identify the next source-aligned milestone after analytics based on remaining roadmap gaps rather than blindly following historical version labels.

- [ ] **Step 4: Commit**

```bash
git commit -m "docs: publish V20 analytics status"
```

### Task 7: Release verification and merge

**Files:** No production changes unless verification exposes a defect.

- [ ] **Step 1: Run full CI-equivalent gate**

```bash
npm install --ignore-scripts
npm run db:migrate
npm test
find server client tests -name '*.js' -print0 | xargs -0 -n1 node --check
```

Expected: all migrations through `008_analytics.sql`, all tests pass, syntax pass.

- [ ] **Step 2: Review branch diff**

Confirm no secret/env values, workflow changes, unsafe scheduler changes, raw provider payload persistence, or unrelated refactors.

- [ ] **Step 3: Open PR and require exact-head CI success**

Create `V20: Analytics & Reporting` PR. Do not merge on stale/failed/pending exact-head CI.

- [ ] **Step 4: Squash merge with expected head SHA**

Merge only after exact PR head is green.

- [ ] **Step 5: Verify post-merge `main` CI**

Require a separate successful `main` workflow whose `head_sha` equals the returned merge commit before claiming completion.