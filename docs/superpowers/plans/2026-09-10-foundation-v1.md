# Srocial Foundation V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first runnable Srocial foundation with a modular vanilla frontend, Express API, scheduler primitives, platform adapter contracts, and automated tests.

**Architecture:** The browser is a thin dashboard served by Express. Server modules own API boundaries, scheduling, state transitions, and secrets. Social networks implement a shared adapter contract; WhatsApp remains a separate messaging adapter contract.

**Tech Stack:** HTML, CSS, vanilla JavaScript, Node.js 20+, Express, Node built-in test runner.

**Spec:** `README.md` and `updaterules.md`

## Global Constraints

- Keep HTML/CSS/JS modular and framework-free.
- Keep secrets server-side and provide `.env.example` only.
- Use one scheduler with typed jobs rather than one scheduler per provider.
- Social platform code must remain behind adapters.
- WhatsApp messaging must remain separate from public social publishing.
- Store and expose explicit publication states instead of booleans.
- Every production behavior introduced in this foundation must have a failing test first.

---

### Task 1: Project runtime and health API

**Files:**
- Create: `package.json`
- Create: `.env.example`
- Create: `server/app.js`
- Create: `server/server.js`
- Create: `server/routes/health.js`
- Test: `tests/health.test.js`

**Interfaces:**
- Produces: `createApp()` returning an Express application.
- Produces: `GET /api/health` returning `{ ok, service, version }`.

- [ ] Write `tests/health.test.js` first and verify it fails because the app does not exist.
- [ ] Implement the minimal Express application and health route.
- [ ] Re-run the test and verify it passes.

### Task 2: Scheduler and state primitives

**Files:**
- Create: `server/scheduler/job-types.js`
- Create: `server/scheduler/states.js`
- Create: `server/scheduler/scheduler.js`
- Test: `tests/scheduler.test.js`

**Interfaces:**
- Produces: `JOB_TYPES` constants.
- Produces: `PUBLICATION_STATES` constants.
- Produces: `getDueJobs(jobs, now)` that returns scheduled jobs due at or before `now` and excludes terminal jobs.

- [ ] Write scheduler tests first for due/future/terminal jobs and verify failure.
- [ ] Implement constants and `getDueJobs`.
- [ ] Re-run tests and verify they pass.

### Task 3: Platform adapter contracts

**Files:**
- Create: `server/platforms/social-platform.js`
- Create: `server/messaging/messaging-platform.js`
- Create: `server/platforms/registry.js`
- Test: `tests/platform-registry.test.js`

**Interfaces:**
- Produces: `SocialPlatform` abstract contract.
- Produces: `MessagingPlatform` abstract contract.
- Produces: `createPlatformRegistry()` and `registerPlatform(registry, name, adapter)`.

- [ ] Write registry tests first for registration, duplicate protection, and missing names.
- [ ] Implement the smallest contracts/registry needed to satisfy the tests.
- [ ] Re-run tests and verify they pass.

### Task 4: Dashboard API and modular frontend

**Files:**
- Create: `server/routes/dashboard.js`
- Create: `server/services/dashboard-service.js`
- Create: `client/index.html`
- Create: `client/css/root.css`
- Create: `client/css/reset.css`
- Create: `client/css/base.css`
- Create: `client/css/layout/app-shell.css`
- Create: `client/css/components/sidebar.css`
- Create: `client/css/components/button.css`
- Create: `client/css/components/card.css`
- Create: `client/css/pages/dashboard.css`
- Create: `client/js/api.js`
- Create: `client/js/dashboard.js`
- Create: `client/js/app.js`
- Test: `tests/dashboard.test.js`

**Interfaces:**
- Produces: `GET /api/dashboard` with summary counts and channel states.
- Frontend consumes `/api/dashboard` and renders summary cards without inline scripts or styles.

- [ ] Write dashboard API test first and verify failure.
- [ ] Implement dashboard service/route with safe placeholder operational data.
- [ ] Re-run API test and verify it passes.
- [ ] Add modular static frontend consuming the endpoint.

### Task 5: Verification and repository integration

**Files:**
- Modify: `README.md` only if run instructions need alignment.

- [ ] Run `npm test` and require zero failures.
- [ ] Run `node --check` on all server/client JavaScript files.
- [ ] Compare feature branch to `main` for unintended changes.
- [ ] Merge the verified feature branch into `main` as authorized by the user.
