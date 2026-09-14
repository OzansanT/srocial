# V18 Calendar + Queue Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement state-safe social queue/calendar lifecycle management and resolve the scheduling atomicity debt tracked as `SR-P009`.

**Architecture:** Preserve the existing one-scheduler architecture. Add repository-level atomic graph creation/lifecycle mutations, a focused post lifecycle service, thin HTTP routes, dedicated queue/calendar frontend modules, and deterministic tests. Provider adapters remain untouched.

**Tech Stack:** Node.js >= 20, built-in HTTP server, PostgreSQL via `pg`, JSON development persistence, vanilla HTML/CSS/JavaScript ES modules, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-14-calendar-queue-v18-design.md`

## Global Constraints

- Keep one scheduler and existing `SOCIAL_PUBLICATION` jobs.
- No provider HTTP calls from queue/calendar lifecycle code.
- No drafts, autosave, analytics, or RBAC in V18.
- Store schedule timestamps as UTC ISO strings; browser converts local values at boundaries.
- Fail closed when external execution may already have occurred.
- Bulk operations prevalidate all selected records before mutation.
- Follow TDD: tests must fail for the intended missing behavior before production changes.
- Preserve existing safe execution defaults and auth/same-origin protections.

---

### Task 1: Atomic schedule graph persistence

**Files:**
- Modify: `server/db/json-repository.js`
- Modify: `server/db/postgres-repository.js`
- Modify: `server/db/postgres-whatsapp.js`
- Modify: `server/services/post-service.js`
- Modify: `server/services/whatsapp-campaign-service.js`
- Test: `tests/schedule-atomicity.test.js`
- Test: `tests/postgres-schedule-atomicity.test.js`

**Interfaces:**
- Produces `repository.createSocialScheduleGraph({ post, media, publicationPlans })`.
- Produces `repository.createWhatsAppCampaignGraph({ campaign, recipients, job })`.
- Existing service return shapes remain `{ post, media, publications, jobs }` and `{ campaign, recipients, job }`.

- [ ] Write JSON atomicity tests that inject a failure after parent creation and assert no parent/child/job records remain.
- [ ] Run the targeted test and verify RED because atomic graph methods do not exist.
- [ ] Add JSON candidate-snapshot atomic mutations and graph ID binding.
- [ ] Add PostgreSQL transaction-backed graph methods using `BEGIN`, `COMMIT`, `ROLLBACK` on a checked-out client.
- [ ] Add PostgreSQL rollback test that triggers a child/FK failure after the parent insert and asserts the parent is absent.
- [ ] Migrate social/WhatsApp create services to the graph methods without changing validation contracts.
- [ ] Run atomicity + existing post/WhatsApp service tests and verify GREEN.
- [ ] Commit `feat: make schedule creation atomic`.

### Task 2: Operator read model and lifecycle state machine

**Files:**
- Create: `server/services/post-lifecycle-service.js`
- Modify: `server/services/post-service.js`
- Modify: `server/db/json-repository.js`
- Modify: `server/db/postgres-repository.js`
- Test: `tests/post-lifecycle-service.test.js`

**Interfaces:**
- Produces `listPostOperations(repository, filters)`.
- Produces `updatePostLifecycle({ repository, postId, input, now })`.
- Produces `cancelPostLifecycle({ repository, postId, now })`.
- Produces `retryPublicationLifecycle({ repository, publicationId, input, now })`.
- Produces `duplicatePostLifecycle({ repository, postId, input, now })`.
- Produces `bulkCancelPostLifecycle({ repository, postIds, now })`.
- Produces `bulkReschedulePostLifecycle({ repository, postIds, scheduledAt, now })`.
- Produces repository atomic mutation methods for one post and a bulk set.

- [ ] Write service RED tests for enriched read model/filtering.
- [ ] Write RED tests for caption edit, future reschedule, cancel, retry, duplicate, bulk cancel, and bulk reschedule.
- [ ] Write RED conflict tests for started/running/external-ID/unsafe retry paths.
- [ ] Implement focused state predicates and safe lifecycle errors with codes `NOT_FOUND`, `LIFECYCLE_CONFLICT`, `VALIDATION_ERROR`.
- [ ] Implement JSON/PostgreSQL atomic lifecycle mutation contracts.
- [ ] Implement duplicate through normal `createScheduledPost()` validation.
- [ ] Run lifecycle tests + scheduler worker regression suite and verify GREEN.
- [ ] Commit `feat: add state-safe post lifecycle service`.

### Task 3: HTTP lifecycle API

**Files:**
- Modify: `server/routes/posts.js`
- Modify: `server/app.js`
- Test: `tests/posts-lifecycle-api.test.js`
- Modify: `tests/posts-api.test.js` only where additive read-model changes require fixture support.

**Interfaces:**
- `GET /api/posts?platform=&accountId=&state=&from=&until=`
- `PATCH /api/posts/:id`
- `POST /api/posts/:id/cancel`
- `POST /api/posts/:id/duplicate`
- `POST /api/publications/:id/retry`
- `POST /api/posts/bulk/cancel`
- `POST /api/posts/bulk/reschedule`

- [ ] Write RED HTTP tests for every endpoint, safe response code, and filter query.
- [ ] Verify existing authentication/same-origin middleware protects all new mutation routes without adding public exceptions.
- [ ] Add thin payload helpers in `routes/posts.js` mapping service errors to 400/404/409.
- [ ] Wire route patterns in `server/app.js` before generic static/method fallbacks.
- [ ] Run lifecycle API + app-auth tests and verify GREEN.
- [ ] Commit `feat: expose post lifecycle API`.

### Task 4: Frontend posts API and date/calendar primitives

**Files:**
- Modify: `client/js/api/posts-api.js`
- Create: `client/js/components/calendar.js`
- Test: `tests/queue-calendar-client.test.js`

**Interfaces:**
- API exports: `listPosts(filters)`, `updatePost(id,input)`, `cancelPost(id)`, `duplicatePost(id,input)`, `retryPublication(id,input)`, `bulkCancelPosts(postIds)`, `bulkReschedulePosts(postIds,scheduledAt)`.
- Calendar exports pure helpers for visible date ranges and drop-date reschedule calculation.

- [ ] Write RED static/module tests for lifecycle API methods and encoded filters.
- [ ] Write RED pure tests for month/week/day range generation.
- [ ] Write RED test that drag reschedule preserves browser-local time-of-day while replacing the date.
- [ ] Implement API methods through shared `requestJson`.
- [ ] Implement dependency-free calendar date helpers.
- [ ] Run targeted tests and verify GREEN.
- [ ] Commit `feat: add queue calendar client primitives`.

### Task 5: Operational Queue UI

**Files:**
- Create: `client/js/pages/queue.js`
- Create: `client/css/pages/queue.css`
- Modify: `client/js/pages/dashboard.js`
- Modify: `client/js/app.js`
- Modify: `client/index.html`
- Test: `tests/queue-ui.test.js`

**Interfaces:**
- `initializeQueue({ onChanged })` returns `{ render(posts), setAccounts(accounts) }` only if needed by filters; otherwise `render(posts)` is sufficient.
- Queue owns list rendering/actions; dashboard owns metrics/channels only.

- [ ] Write RED UI structure tests for filter toolbar, bulk toolbar, selection controls, action buttons, inline editor, and feedback region.
- [ ] Remove operational queue rendering responsibility from `dashboard.js` while keeping dashboard summary rendering stable.
- [ ] Add queue markup with semantic labels/buttons and accessible feedback.
- [ ] Implement filtering, selection, edit/reschedule, cancel, duplicate, retry, bulk cancel, and bulk reschedule handlers.
- [ ] Refresh server state after every successful mutation and after 409 conflicts.
- [ ] Add responsive queue CSS using existing tokens/classes where possible.
- [ ] Run queue UI + dashboard/composer regressions and verify GREEN.
- [ ] Commit `feat: add operational queue controls`.

### Task 6: Month/week/day Calendar UI and drag-reschedule

**Files:**
- Create: `client/js/pages/calendar.js`
- Create: `client/css/components/calendar.css`
- Create: `client/css/pages/calendar.css`
- Modify: `client/js/app.js`
- Modify: `client/index.html`
- Test: `tests/calendar-ui.test.js`

**Interfaces:**
- `initializeCalendar({ onChanged })` returns `{ render(posts) }`.
- Calendar uses `updatePost(postId,{scheduledAt})` for drag reschedule; no direct repository/provider access.

- [ ] Write RED static tests for calendar section, Month/Week/Day buttons, Previous/Today/Next controls, and live feedback.
- [ ] Implement month/week/day renderers using pure component date helpers.
- [ ] Render draggable cards only for posts whose publications/jobs are safely reschedulable.
- [ ] Implement HTML drag/drop day targets; drop preserves local time-of-day and calls PATCH reschedule.
- [ ] Ensure keyboard users retain full reschedule capability through queue editor controls.
- [ ] Add calendar component/page CSS with responsive fallback.
- [ ] Wire shared publishing refresh so composer/queue/calendar remain consistent.
- [ ] Run calendar/queue UI tests and verify GREEN.
- [ ] Commit `feat: add calendar lifecycle views`.

### Task 7: Release documentation and problem tracker

**Files:**
- Create: `docs/V18_CALENDAR_QUEUE.md`
- Modify: `README.md`
- Modify: `PROBLEMS.md`

**Interfaces:**
- README current status becomes V18 only after implementation CI is green.
- `SR-P009` moves to Resolution History only with deterministic rollback evidence.
- `SR-P005` moves to Resolution History only if full source-defined queue/calendar scope is present; browser E2E remains `SR-P001 VERIFY`.

- [ ] Document API/state safety/operator controls and drag fallback.
- [ ] Update README architecture, protected endpoints, verification coverage, repository structure, and next roadmap milestone.
- [ ] Review every active problem; resolve only with concrete test evidence.
- [ ] Run full CI gate: `npm run db:migrate`, `npm test`, JS syntax checks.
- [ ] Review branch diff for accidental secrets, provider coupling, and unrelated changes.
- [ ] Commit `docs: complete V18 calendar queue milestone`.

### Task 8: PR, final verification, merge

**Files:** none beyond PR metadata.

- [ ] Compare feature branch to `main`; confirm no unexpected files and no divergence.
- [ ] Create draft PR with scope, safety model, verification evidence, and remaining problems.
- [ ] Wait for exact-head push/PR CI success.
- [ ] Mark PR ready.
- [ ] Squash merge with `expected_head_sha` set to the verified feature head.
- [ ] Verify the exact `main` merge commit's PostgreSQL migration, full test suite, and JS syntax workflow succeeds.
- [ ] Report merge commit, resolved/remaining problems, and the next source-defined milestone: drafts + richer creation workflows.
