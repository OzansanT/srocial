# V29 Operational Health & Environment Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete source roadmap health items #16–20 by reusing existing database/provider health and adding storage writeability health, scheduler runtime telemetry, and secret-safe environment diagnostics to the protected Operations Center.

**Architecture:** Add small health contracts at the media-store and scheduler boundaries, add a pure environment diagnostics module, and compose those dependencies in the existing Operations route/service. Keep public `/api/health` unchanged and render the richer diagnostics only in the authenticated Operations UI.

**Tech Stack:** Node.js 22 built-ins, vanilla JavaScript ES modules, existing JSON/PostgreSQL repositories, local/S3 media stores, existing Chrome/CDP E2E harness.

**Spec:** `docs/superpowers/specs/2026-09-16-v29-operational-health-diagnostics-design.md`

## Global Constraints

- Do not expose secret/config values in API/UI diagnostics.
- Keep public `/api/health` minimal.
- Do not make live provider publish/send calls as health probes.
- Preserve existing provider health behavior.
- Preserve scheduler overlap prevention and execution gates.
- Do not resolve SR-P002/SR-P003/SR-P004/SR-P010 without real provider evidence.
- All implementation follows RED → GREEN TDD and exact-final-head CI before merge.

---

### Task 1: Media storage health contract

**Files:**
- Modify: `server/media/local-media-store.js`
- Modify: `server/media/s3-media-store.js`
- Test: `tests/local-media-store.test.js`
- Test: `tests/s3-media-store.test.js`

**Interfaces:**
- Produces: `await mediaStore.healthCheck()` → `{ ok, backend, writable, errorCode }`.
- Local probe creates/removes an exclusive temporary probe under the media root.
- S3 probe PUTs then DELETEs a reserved `__srocial-health__/...` key through the existing request client.

- [ ] **Step 1: Write failing health tests**

Add assertions equivalent to:

```js
const health = await store.healthCheck();
assert.deepEqual(health, { ok: true, backend: 'local', writable: true, errorCode: null });
```

and failure cases that assert raw filesystem/S3 error text is absent.

- [ ] **Step 2: Run CI and verify RED**

Expected: only new health tests fail because `healthCheck` is missing.

- [ ] **Step 3: Implement minimal local/S3 probes**

Return only normalized health metadata; always attempt probe cleanup.

- [ ] **Step 4: Run full CI and verify GREEN**

Expected: all deterministic tests, syntax, and existing Chrome E2E pass.

- [ ] **Step 5: Commit**

Commit message: `feat: add media storage health checks`.

---

### Task 2: Scheduler runtime health

**Files:**
- Modify: `server/scheduler/start-scheduler-loop.js`
- Test: `tests/scheduler-loop.test.js`

**Interfaces:**
- Produces: `schedulerLoop.status()` → `{ configured, running, stopped, inFlight, intervalMs, lastTickStartedAt, lastSuccessfulTickAt, lastFailedTickAt, lastErrorCode }`.
- Add injectable `now = () => new Date()`.

- [ ] **Step 1: Write failing scheduler status tests**

Cover disabled, active before tick, in-flight, success, failure, and stopped transitions.

- [ ] **Step 2: Run CI and verify RED**

Expected: new tests fail because `status()` does not exist.

- [ ] **Step 3: Implement telemetry without changing tick dispatch semantics**

Update runtime timestamps around existing `tick()` call and retain sanitized logging.

- [ ] **Step 4: Run full CI and verify GREEN**

Expected: existing scheduler behavior plus new health tests pass.

- [ ] **Step 5: Commit**

Commit message: `feat: expose scheduler runtime health`.

---

### Task 3: Secret-safe environment diagnostics

**Files:**
- Create: `server/operations/environment-diagnostics.js`
- Create: `tests/environment-diagnostics.test.js`

**Interfaces:**
- Produces: `diagnoseEnvironment(env)` → `{ ok, issues }`.
- Issue shape: `{ code, severity, setting, message }`.

- [ ] **Step 1: Write failing diagnostic tests**

Test PostgreSQL URL requirement, S3 required settings, partial provider/WhatsApp credentials, scheduler/execution-gate mismatches, auth requirements, HTTPS/external-execution warnings, and complete absence of supplied secret values in `JSON.stringify(result)`.

- [ ] **Step 2: Run CI and verify RED**

Expected: module import/function missing.

- [ ] **Step 3: Implement pure rule evaluation**

Never copy environment values into the result. Optional providers with zero relevant settings produce no issue.

- [ ] **Step 4: Run full CI and verify GREEN**

Expected: diagnostic tests and existing configuration tests pass.

- [ ] **Step 5: Commit**

Commit message: `feat: add environment diagnostics`.

---

### Task 4: Operations runtime composition and server wiring

**Files:**
- Modify: `server/services/operations-service.js`
- Modify: `server/routes/operations.js`
- Modify: `server/app.js`
- Modify: `server/server.js`
- Test: `tests/operations-api.test.js`
- Test: `tests/server.test.js` or focused route tests as appropriate.

**Interfaces:**
- `getOperationsPayload(repository, { mediaStore, schedulerLoop, environment })`.
- Existing payload keys remain; add `runtime.database`, `runtime.storage`, `runtime.scheduler`, and `environment`.

- [ ] **Step 1: Write failing Operations tests**

Require successful runtime summaries and safe degradation when database/storage probes throw. Require environment diagnostics to be returned without changing existing provider/job/attempt/webhook summaries.

- [ ] **Step 2: Run CI and verify RED**

Expected: new payload keys/dependency wiring absent.

- [ ] **Step 3: Implement safe composition**

Probe database/storage independently so one failure does not hide the rest of Operations. Use `schedulerLoop.status()` synchronously. Compute `diagnoseEnvironment(runtimeEnv)` once or through an injected safe dependency.

- [ ] **Step 4: Run full CI and verify GREEN**

Expected: Operations route and all existing API/RBAC tests pass.

- [ ] **Step 5: Commit**

Commit message: `feat: surface runtime diagnostics in operations`.

---

### Task 5: Operations UI and browser coverage

**Files:**
- Modify: `client/index.html`
- Modify: `client/js/pages/operations.js`
- Modify: `client/css/pages/operations.css`
- Modify: `tests/operations-ui.test.js`
- Modify: `tests/e2e/operator-surfaces.e2e.js`

**Interfaces:**
- New DOM targets: `runtime-health-list`, `environment-diagnostic-list`.

- [ ] **Step 1: Write failing static/browser assertions**

Require the new DOM anchors, DOM-safe renderer behavior, and real-browser Operations rendering of seeded runtime/environment state.

- [ ] **Step 2: Run CI and verify RED**

Expected: new anchors/rendering absent.

- [ ] **Step 3: Implement safe UI rendering**

Render database/storage/scheduler health and environment issues via `createElement`/`textContent`; no `innerHTML`.

- [ ] **Step 4: Run full CI and verify GREEN**

Expected: deterministic tests plus expanded Chrome E2E pass.

- [ ] **Step 5: Commit**

Commit message: `feat: render operational health diagnostics`.

---

### Task 6: Documentation, tracker reconciliation, and release gate

**Files:**
- Create: `docs/V29_OPERATIONAL_HEALTH.md`
- Modify: `README.md`
- Modify: `HOW_TO_RUN.md`
- Modify: `PROBLEMS.md` only if implementation uncovers a real unresolved gap.

- [ ] **Step 1: Document the operator contract**

Explain protected vs public health surfaces, meanings of scheduler timestamps, storage probe behavior, environment diagnostics, and secret-safety guarantees.

- [ ] **Step 2: Correct roadmap/current-status documentation**

Record V28 #14–15 and V29 #16–20 reconciliation; remove the stale statement that there was no source-defined V28.

- [ ] **Step 3: Run exact-final-head CI**

Expected: migrations 001–010, all Node tests, syntax, and real Chrome/CDP E2E green.

- [ ] **Step 4: Review exact diff and review threads**

No unintended provider execution, secret output, or unresolved review thread may remain.

- [ ] **Step 5: Mark PR ready and squash-merge with expected head SHA**

Then verify the push-triggered workflow on the exact merged `main` SHA before declaring V29 complete.
