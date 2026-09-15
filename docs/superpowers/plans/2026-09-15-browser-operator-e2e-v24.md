# V24 Browser E2E Operator Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend Srocial's real Chrome CI gate across deterministic Accounts, WhatsApp, Operations, and Analytics operator workflows without enabling any live-provider execution.

**Architecture:** Reuse the V22/V23 Chrome/CDP harness and temporary JSON repository. Add one test-only `seedData` input to the fixture server so complete repository collections can be seeded before boot, while preserving `seedAccounts`. Drive each operator surface through its real browser UI and assert persisted state through the protected application API where mutations occur.

**Tech Stack:** Node.js 22 built-ins, `node:test`, direct Chrome DevTools Protocol/WebSocket driver, Srocial JSON repository, vanilla browser UI.

**Spec:** `docs/superpowers/specs/2026-09-15-browser-operator-e2e-v24-design.md`

## Global Constraints

- `SCHEDULER_ENABLED=false` in every V24 browser fixture.
- `ALLOW_REAL_PUBLISH=false` in every V24 browser fixture.
- `ALLOW_REAL_WHATSAPP=false` in every V24 browser fixture.
- Provider application credentials remain empty.
- No production test endpoint or runtime seed feature.
- No live-provider verification claims.
- E2E files stay serialized with `--test-concurrency=1`.

---

### Task 1: Add the V24 RED browser contract

**Files:**
- Create: `tests/e2e/operator-surfaces.e2e.js`

**Interfaces:**
- Consumes: `launchBrowser()` from `tests/e2e/browser-driver.js`; `startSrocialE2EServer(options)` from `tests/e2e/srocial-server.js`.
- Produces: four real-browser tests that require `startSrocialE2EServer({ seedData })` to preserve seeded repository collections.

- [ ] **Step 1: Write the failing operator browser suite**

Create fixed fixture records for one connected Facebook account, one disconnected Threads account, one approved WhatsApp template, one published Facebook post/publication with analytics snapshots, one provider status, one failed scheduler job, one publication attempt, and one webhook event. Start the fixture with:

```js
server = await startSrocialE2EServer({
  seedData: {
    accounts: [FACEBOOK, THREADS],
    whatsappTemplates: [APPROVED_TEMPLATE],
    posts: [PUBLISHED_POST],
    publications: [PUBLISHED_PUBLICATION],
    publicationMetricSnapshots: [OLDER_SNAPSHOT, LATEST_SNAPSHOT],
    providerStatuses: [PROVIDER_STATUS],
    jobs: [FAILED_JOB],
    publicationAttempts: [ATTEMPT],
    webhookEvents: [WEBHOOK]
  }
});
```

Implement four tests:

```js
test('real browser manages deterministic account state without live OAuth', ...);
test('real browser creates an opted-in WhatsApp contact and schedules a disabled-execution campaign', ...);
test('real browser renders seeded Operations provider, failure, attempt and webhook state', ...);
test('real browser renders and filters seeded Analytics snapshots', ...);
```

- [ ] **Step 2: Run CI and record the RED evidence**

Expected: existing deterministic tests and V22/V23 browser scenarios remain green; V24 scenarios fail because the current fixture ignores `seedData`, so seeded rows/templates/metrics are absent.

- [ ] **Step 3: Commit the RED contract**

Commit message:

```text
test: add V24 operator browser contract
```

---

### Task 2: Implement generic test-only repository seeding

**Files:**
- Modify: `tests/e2e/srocial-server.js`

**Interfaces:**
- Consumes: optional `seedAccounts` and optional plain-object `seedData`.
- Produces: `startSrocialE2EServer({ seedAccounts = [], seedData = {} } = {})`.

- [ ] **Step 1: Validate fixture inputs**

Require `seedAccounts` to remain an array. Require `seedData` to be a non-null, non-array object; otherwise throw `E2E_SEED_DATA_INVALID`.

- [ ] **Step 2: Build initial test repository state**

Use structured cloning and merge existing account compatibility:

```js
const initialData = structuredClone(seedData);
const seededAccounts = [
  ...(Array.isArray(initialData.accounts) ? initialData.accounts : []),
  ...seedAccounts
];
if (seededAccounts.length) initialData.accounts = seededAccounts;
```

Write `initialData` to the temporary JSON file only when it has keys. Missing collections are intentionally normalized by `createJsonRepository.initialize()`.

- [ ] **Step 3: Run the Chrome gate**

Expected: all V22/V23/V24 browser scenarios pass unless a scenario reveals a genuine product behavior mismatch.

- [ ] **Step 4: Commit fixture support**

Commit message:

```text
test: seed V24 operator fixture state
```

---

### Task 3: Fix only browser-proven product defects

**Files:**
- Modify only the product file directly implicated by a failing real-browser assertion.
- Add/update its existing deterministic UI test file before the product fix.

**Interfaces:**
- Produces: no test workaround; product state must match the UI contract.

- [ ] **Step 1: For each product failure, trace the UI/API state transition from the failing assertion**

Do not patch selectors, waits, or fixture data until the application behavior is shown to be correct.

- [ ] **Step 2: Add a deterministic regression assertion that fails for the demonstrated behavior**

Use the page/module's existing `tests/*-ui.test.js` or API/service test file.

- [ ] **Step 3: Apply the smallest production fix and rerun full CI**

Expected: deterministic regression and all browser scenarios pass.

- [ ] **Step 4: Commit each independent defect fix**

Use a focused `fix:` commit message describing the behavior.

---

### Task 4: Promote V24 documentation and tracker state

**Files:**
- Create: `docs/V24_BROWSER_OPERATOR_E2E.md`
- Modify: `PROBLEMS.md`
- Modify: `README.md`

**Interfaces:**
- Produces: current capability, exact verification evidence, and the remaining `SR-P001` scope.

- [ ] **Step 1: Document architecture and covered scenarios**

State explicitly that fixtures are deterministic, provider credentials are empty, and external execution gates remain false.

- [ ] **Step 2: Update `SR-P001` but keep it `PARTIAL`**

Mark Accounts, WhatsApp, Operations, and Analytics deterministic browser coverage as verified. Leave Calendar drag/drop and remaining edit/duplicate/retry/filter/dialog lifecycle browser paths open. Keep live-provider verification separate.

- [ ] **Step 3: Update README Current Status / Verification / Development Direction**

Recommend the next milestone as the remaining browser lifecycle/Calendar interaction slice before `SR-P007` and `SR-P006`.

- [ ] **Step 4: Commit docs**

Commit message:

```text
docs: promote V24 operator browser coverage
```

---

### Task 5: Release and merge V24

**Files:**
- No additional implementation files expected.

- [ ] **Step 1: Run fresh exact-head GitHub Actions**

Require success for migrations, complete deterministic Node tests, JavaScript syntax, and every Chrome E2E scenario.

- [ ] **Step 2: Review `main...head`**

Confirm no provider credentials/secrets, no new production test route, no scheduler/auth weakening, and unchanged safe execution defaults.

- [ ] **Step 3: Open PR `V24: Browser E2E operator surfaces`**

Pin release assertions to the exact verified head SHA.

- [ ] **Step 4: Require PR-triggered CI success and squash-merge with expected head SHA**

Do not merge if the PR head moved or any gate is not successful.

- [ ] **Step 5: Verify exact merged `main` SHA**

Require the post-merge push workflow to pass before declaring V24 complete.
