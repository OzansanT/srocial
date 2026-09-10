# Srocial Foundation V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first runnable Srocial foundation with a modular vanilla frontend, dependency-free Node HTTP API, scheduler primitives, platform adapter contracts, and automated tests.

**Architecture:** The browser is a thin dashboard served by the Node backend. Server modules own API boundaries, scheduling, state transitions, and secrets. Social networks implement a shared adapter contract; WhatsApp remains a separate messaging adapter contract. The HTTP layer is intentionally dependency-free in v0.1 and can be replaced by Express later without changing service or adapter boundaries.

**Tech Stack:** HTML, CSS, vanilla JavaScript, Node.js 20+ built-in HTTP server, Node built-in test runner.

**Spec:** `README.md` and `updaterules.md`

## Global Constraints

- Keep HTML/CSS/JS modular and framework-free.
- Keep secrets server-side and provide `.env.example` only.
- Use one scheduler with typed jobs rather than one scheduler per provider.
- Social platform code must remain behind adapters.
- WhatsApp messaging must remain separate from public social publishing.
- Store and expose explicit publication states instead of booleans.
- Default development configuration must prevent real publishing.
- Every production behavior introduced in this foundation must be covered by automated tests where practical.

---

### Task 1: Project runtime and health API

**Files:** `package.json`, `.env.example`, `.gitignore`, `server/app.js`, `server/server.js`, `server/routes/health.js`, `tests/health.test.js`, `tests/server.test.js`

- [x] Write failing health/server tests.
- [x] Implement the Node HTTP application and static file server.
- [x] Verify health API and root dashboard route.

### Task 2: Scheduler and state primitives

**Files:** `server/scheduler/job-types.js`, `server/scheduler/states.js`, `server/scheduler/scheduler.js`, `tests/scheduler.test.js`

- [x] Write failing due-job test.
- [x] Add explicit job types and publication states.
- [x] Implement due-job filtering that excludes terminal jobs.

### Task 3: Platform adapter contracts

**Files:** `server/platforms/social-platform.js`, `server/messaging/messaging-platform.js`, `server/platforms/registry.js`, `tests/platform-registry.test.js`

- [x] Write registry behavior tests.
- [x] Add social and messaging base contracts.
- [x] Add normalized platform registry with duplicate protection.

### Task 4: Dashboard API and modular frontend

**Files:** `server/routes/dashboard.js`, `server/services/dashboard-service.js`, `client/index.html`, modular files under `client/css/`, modular files under `client/js/`, `tests/dashboard.test.js`

- [x] Write dashboard summary test.
- [x] Add dashboard service and API route.
- [x] Add responsive dashboard shell and channel connection view.
- [x] Keep API requests and page rendering in separate ES modules.

### Task 5: Verification and repository integration

- [x] Run `npm test` with zero failures locally.
- [x] Run `node --check` on all server/client JavaScript locally.
- [x] Smoke-test `/api/health`, `/api/dashboard`, and `/` locally.
- [ ] Compare feature branch to `main` after upload.
- [ ] Merge verified feature branch into `main` as authorized by the user.
