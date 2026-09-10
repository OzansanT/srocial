# Scheduler Execution V3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe due-job claiming, idempotent social-publication execution, retry handling, and asynchronous status-check execution without enabling live provider publishing by default.

**Architecture:** Extend the repository with atomic claim/update primitives, introduce scheduler-specific states, and keep execution logic in small workers selected by a dispatcher. Platform adapters remain injected through the existing registry, so tests use fake adapters and no real network side effects occur.

**Tech Stack:** Node.js >=20, ES modules, built-in `node:test`, JSON development repository, PostgreSQL schema as production target.

**Spec:** `docs/superpowers/specs/2026-09-10-scheduler-execution-design.md`

## Global Constraints

- Preserve one scheduler subsystem.
- Keep provider-specific logic out of scheduler/repository modules.
- Keep `ALLOW_REAL_PUBLISH=false` as the safe default.
- External publish actions must be idempotency-aware.
- No new npm dependency is required for this increment.
- Existing tests must remain green.

---

### Task 1: Scheduler Job State Model

**Files:**
- Create: `server/scheduler/job-states.js`
- Modify: `server/services/post-service.js`
- Modify: `server/scheduler/scheduler.js`
- Modify: `tests/scheduler.test.js`
- Modify: `tests/post-service.test.js`

**Interfaces:**
- Produces `JOB_STATES` with `SCHEDULED`, `RUNNING`, `RETRYING`, `COMPLETED`, `FAILED`, `CANCELLED`.
- `getDueJobs(jobs, now)` consumes job states instead of publication states.

- [ ] **Step 1: Add failing tests** asserting newly created jobs use `JOB_STATES.SCHEDULED` and due filtering accepts `SCHEDULED/RETRYING` while excluding completed/failed jobs.
- [ ] **Step 2: Run** `node --test tests/scheduler.test.js tests/post-service.test.js` and verify failure because `job-states.js` does not exist / existing jobs use publication states.
- [ ] **Step 3: Implement** `job-states.js` and update post creation/due filtering to use it.
- [ ] **Step 4: Run** the two test files and verify pass.

### Task 2: Atomic Repository Claim and Update Operations

**Files:**
- Modify: `server/db/json-repository.js`
- Create: `tests/job-claim.test.js`

**Interfaces:**
- Produces `claimDueJobs({now, workerId, limit, lockTimeoutMs})`.
- Produces `getPost(id)`, `getPublication(id)`, `updatePublication(id, patch)`, `updateJob(id, patch)`.

- [ ] **Step 1: Add failing tests** that create one due job, call `claimDueJobs()` twice, and assert the first call gets it while the second gets none; add a stale-running reclaim case.
- [ ] **Step 2: Run** `node --test tests/job-claim.test.js` and verify failure because the repository methods are absent.
- [ ] **Step 3: Implement** all mutations through the existing serialized write chain. A claim sets `state='RUNNING'`, lock metadata, increments attempts, and persists before returning.
- [ ] **Step 4: Run** `node --test tests/job-claim.test.js tests/json-repository.test.js` and verify pass.

### Task 3: Retry Policy and Error Classification

**Files:**
- Create: `server/scheduler/retry-policy.js`
- Create: `tests/retry-policy.test.js`

**Interfaces:**
- Produces `getRetryDelayMs(attempt)`.
- Produces `classifyExecutionError(error)` returning `{code, retryable}`.

- [ ] **Step 1: Add failing tests** for delays of 1m, 5m, 15m, then 60m and for retryable network/rate-limit errors versus permanent authentication/provider errors.
- [ ] **Step 2: Run** `node --test tests/retry-policy.test.js` and verify failure because the module is absent.
- [ ] **Step 3: Implement** deterministic bounded retry mapping and conservative error classification.
- [ ] **Step 4: Run** the retry-policy tests and verify pass.

### Task 4: Social Publication Worker

**Files:**
- Create: `server/scheduler/workers/social-publication-worker.js`
- Create: `tests/social-publication-worker.test.js`

**Interfaces:**
- Consumes repository methods from Task 2 and registry `Map` semantics.
- Calls `adapter.publish({post, publication}, {idempotencyKey})`.
- Produces `executeSocialPublicationJob({job, repository, registry, now, retryPolicy})`.

- [ ] **Step 1: Add failing tests** for synchronous publish, asynchronous processing, already-published idempotency, retryable error, and permanent error.
- [ ] **Step 2: Run** the worker test and verify failure because the worker is absent.
- [ ] **Step 3: Implement** publication loading, adapter lookup, idempotency guard, normalized result handling, status-check job creation, and retry/failure persistence.
- [ ] **Step 4: Run** the worker test plus repository tests and verify pass.

### Task 5: Status Check Worker

**Files:**
- Create: `server/scheduler/workers/status-check-worker.js`
- Create: `tests/status-check-worker.test.js`

**Interfaces:**
- Calls `adapter.getStatus({publication})`.
- Produces `executeStatusCheckJob({job, repository, registry, now, retryPolicy})`.

- [ ] **Step 1: Add failing tests** for still-processing reschedule, published completion, provider-reported failure, and terminal-publication no-op.
- [ ] **Step 2: Run** the worker test and verify failure because the worker is absent.
- [ ] **Step 3: Implement** status normalization and job completion/rescheduling.
- [ ] **Step 4: Run** worker tests and verify pass.

### Task 6: Dispatcher and Scheduler Tick

**Files:**
- Create: `server/scheduler/job-dispatcher.js`
- Create: `server/scheduler/run-scheduler-tick.js`
- Create: `tests/scheduler-runner.test.js`

**Interfaces:**
- `executeJob()` dispatches `SOCIAL_PUBLICATION` and `STATUS_CHECK`.
- `runSchedulerTick()` claims due work and executes claimed jobs sequentially.

- [ ] **Step 1: Add failing tests** proving a tick claims once, runs the correct worker, and returns execution counts without processing the same job twice.
- [ ] **Step 2: Run** `node --test tests/scheduler-runner.test.js` and verify failure because modules are absent.
- [ ] **Step 3: Implement** dispatcher and sequential tick runner.
- [ ] **Step 4: Run** scheduler runner and worker tests and verify pass.

### Task 7: PostgreSQL Schema and Documentation Alignment

**Files:**
- Modify: `server/db/migrations/001_initial.sql`
- Modify: `README.md`

**Interfaces:**
- No runtime interface changes.

- [ ] **Step 1: Update schema/index documentation** so future PostgreSQL claiming is efficient for state/schedule/lock queries.
- [ ] **Step 2: Update README** current-state documentation to describe v3 scheduler execution primitives and clarify that the recurring live loop is still disabled until provider adapters are connected.
- [ ] **Step 3: Search documentation** for contradictions with the v3 design and correct them.

### Task 8: Full Verification and Integration

**Files:** all changed files.

- [ ] **Step 1: Run** `npm test` and require zero failures.
- [ ] **Step 2: Run** `node --check` against every `.js` file under `server`, `client`, and `tests`.
- [ ] **Step 3: Run a local scheduler smoke** using a fake adapter: create a due scheduled publication, run one tick, assert publication becomes published, run a second tick, assert fake adapter call count remains one.
- [ ] **Step 4: Compare branch to `main`** and review every changed path.
- [ ] **Step 5: Open PR and squash-merge to `main`** using the already-authorized merge-without-ask workflow.
