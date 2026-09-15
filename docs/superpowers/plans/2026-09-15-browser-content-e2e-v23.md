# V23 Browser E2E Critical Content Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the V22 real-Chrome CI harness across Srocial's critical content workflow: drafts, reusable composer resources, overrides/previews/compatibility, media upload/library, scheduling, and Queue/Calendar lifecycle.

**Architecture:** Keep production code unchanged by extending only the isolated E2E fixture and CDP driver. Seed one connected Facebook account into the temporary JSON fixture, upload a real test image through CDP file-input support, schedule a text-only account-bound Facebook post with execution gates disabled, and drive Queue/Calendar lifecycle controls in the real browser. Serialize `.e2e.js` files to avoid hosted-runner Chrome contention.

**Tech Stack:** Node.js 22 built-ins, `node:test`, real Srocial Node HTTP server, JSON fixture persistence, installed headless Chrome, Chrome DevTools Protocol/WebSocket, existing vanilla HTML/CSS/JS UI.

**Spec:** `docs/superpowers/specs/2026-09-15-browser-content-e2e-v23-design.md`

## Global Constraints

- Do not add provider credentials or real provider calls.
- Keep `SCHEDULER_ENABLED=false`, `ALLOW_REAL_PUBLISH=false`, and `ALLOW_REAL_WHATSAPP=false` in E2E runtime.
- Do not add a production test-only endpoint.
- Do not add Playwright/Puppeteer/Selenium dependencies.
- Existing `npm test`, PostgreSQL migrations, V22 browser E2E, and syntax checks must remain green.
- Local HTTP media is test evidence for browser upload/library behavior only, not provider publishability.
- `SR-P001` remains `PARTIAL` after V23.

---

### Task 1: Add the RED V23 content-flow contract

**Files:**
- Create: `tests/e2e/content-workflow.e2e.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `startSrocialE2EServer({ seedAccounts })` and `browser.setFileInputFiles(selector, paths)` that intentionally do not exist yet.
- Produces: serial E2E execution plus concrete browser scenarios that fail until fixture/driver support is implemented.

- [ ] **Step 1: Change `test:e2e` to serialize files**

Set:

```json
"test:e2e": "node --test --test-concurrency=1 tests/e2e/*.e2e.js"
```

- [ ] **Step 2: Add one deterministic seeded Facebook account constant**

Use:

```js
const FACEBOOK = Object.freeze({
  id: 'e2e-facebook-account',
  provider: 'facebook',
  providerAccountId: 'e2e-page-1',
  displayName: 'E2E Facebook Page',
  username: 'e2e_page',
  state: 'CONNECTED'
});
```

- [ ] **Step 3: Add browser test setup that requests missing seed/file helpers**

The suite starts:

```js
server = await startSrocialE2EServer({ seedAccounts: [FACEBOOK] });
browser = await launchBrowser();
```

and later calls:

```js
await browser.setFileInputFiles('#media-file', [uploadPath]);
```

- [ ] **Step 4: Add high-level browser scenarios**

Create three serial tests sharing one isolated server/browser:

1. draft/resources/override/compatibility/revision conflict/recovery;
2. media upload/library/use/delete;
3. text-only Facebook scheduling + Queue/Calendar bulk reschedule/cancel.

Every wait must use DOM/API conditions with explicit timeouts.

- [ ] **Step 5: Run exact branch CI and verify RED**

Expected: existing 446 Node tests, migrations, syntax, and V22 E2E remain green; V23 E2E fails specifically because `seedAccounts` / `setFileInputFiles` support is absent or the new contract cannot advance through that missing harness capability.

---

### Task 2: Add deterministic account seeding to the E2E server fixture

**Files:**
- Modify: `tests/e2e/srocial-server.js`

**Interfaces:**
- Changes signature to `startSrocialE2EServer({ seedAccounts = [] } = {})`.
- Writes only temporary test data before server spawn; production server has no seed route.

- [ ] **Step 1: Import `writeFile`**

Use `writeFile` from `node:fs/promises`.

- [ ] **Step 2: Prewrite the JSON fixture when accounts are supplied**

Before spawning the server:

```js
const dataFile = path.join(fixtureDirectory, 'srocial.json');
if (seedAccounts.length) {
  await writeFile(dataFile, JSON.stringify({ accounts: structuredClone(seedAccounts) }, null, 2), 'utf8');
}
```

Use `dataFile` for `DATA_FILE`.

- [ ] **Step 3: Validate seed shape defensively**

Reject a non-array `seedAccounts` argument with a test-helper error before starting Srocial. Do not validate provider credentials because none are supplied or used.

- [ ] **Step 4: Run V22 auth E2E and new V23 setup**

Expected: V22 stays green; the V23 page sees enabled Facebook destination/account controls and advances to file-helper failure.

---

### Task 3: Add CDP file-input support

**Files:**
- Modify: `tests/e2e/browser-driver.js`

**Interfaces:**
- Produces `setFileInputFiles(selector, filePaths): Promise<true>`.

- [ ] **Step 1: Enable the DOM domain after CDP connection**

Alongside `Page.enable` and `Runtime.enable`, call:

```js
await cdp.send('DOM.enable');
```

- [ ] **Step 2: Resolve the current input node**

Implement:

```js
const { root } = await cdp.send('DOM.getDocument', { depth: 1, pierce: true });
const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
```

Fail with `E2E_FILE_INPUT_NOT_FOUND` when `nodeId` is absent.

- [ ] **Step 3: Set explicit test file paths**

Normalize supplied paths to strings, require a non-empty array, and call:

```js
await cdp.send('DOM.setFileInputFiles', { nodeId, files });
```

Return `true`.

- [ ] **Step 4: Export the helper on the frozen browser object**

Do not expose arbitrary filesystem browsing or production behavior.

- [ ] **Step 5: Run browser E2E**

Expected: uploaded PNG becomes the real `File` selected by the page and the existing upload API path executes.

---

### Task 4: Complete the V23 real-browser workflow

**Files:**
- Modify: `tests/e2e/content-workflow.e2e.js`

**Interfaces:**
- Consumes seeded Facebook fixture + CDP file helper.

- [ ] **Step 1: Implement shared login/browserFetch helpers**

Login through `#admin-login-form`. Same-origin API probes must run inside the browser session via `Runtime.evaluate` except for fixture-independent test file creation.

- [ ] **Step 2: Verify draft autosave + reusable resources + effective preview**

Drive:

```text
#draft-name
#post-caption
Facebook checkbox + account select
override:facebook:caption
override:facebook:mediaMode = none
#caption-template-name / #save-caption-template
#hashtag-collection-name / #hashtag-collection-tags / #save-hashtag-collection
#destination-group-name / #save-destination-group
```

Wait for `Saved revision 1.` and `1/1 destinations compatible...`. Assert one Facebook preview is rendered.

- [ ] **Step 3: Verify reload/recovery and stale revision conflict**

Capture draft id/revision from the browser API, navigate away/back to `/`, select the saved draft, and assert caption/destination/override restoration. Then PATCH the same draft through the authenticated browser API using its current revision so persistence advances. Edit the stale loaded draft in the UI and wait for:

```text
Draft changed in another tab. Reload the saved draft before editing again.
```

Assert the browser caption remains the local edit. Re-select the draft to load the persisted revision and continue.

- [ ] **Step 4: Verify caption template + hashtag application**

Clear the caption, select/apply the saved caption template, then select/append the hashtag collection. Assert the resulting caption contains the template text and each expected hashtag once.

- [ ] **Step 5: Upload a byte-valid PNG**

Create a temporary 1x1 PNG in Node from a fixed base64 literal. Select it via `setFileInputFiles`, click `#upload-media`, and wait for the existing local HTTP warning. Assert the Media Library contains one `.media-card`.

- [ ] **Step 6: Verify Media Library reuse and deletion**

Click `Use in composer`; assert `#media-url` matches the card preview source. Clear the composer media again so later scheduling is text-only. Override `window.confirm` only inside the test page for the next delete action, click the enabled `.media-card__delete`, and assert the library becomes empty and reports successful deletion.

- [ ] **Step 7: Schedule text-only Facebook content**

Restore selected Facebook destination, Facebook `mediaMode=none`, caption/override, and a same-day future schedule. Submit the real composer and wait for `Post scheduled.`. Assert Queue contains one row and Calendar contains one card with the caption.

- [ ] **Step 8: Bulk reschedule through Queue**

Select the queue row, set `#queue-bulk-time` to a later same-day time, click `#queue-bulk-reschedule`, and wait for `1 selected post rescheduled.`. Assert Queue and Calendar still represent the post and the persisted post schedule matches the new time through the normal protected API.

- [ ] **Step 9: Bulk cancel through Queue**

Re-select the row, click `#queue-bulk-cancel`, wait for `1 selected post cancelled.`, and assert the visible publication badge/calendar state is cancelled.

- [ ] **Step 10: Run full branch gates**

Expected: 446/446 Node tests and all V22+V23 browser scenarios pass; syntax and migrations remain green.

---

### Task 5: Documentation, tracker, release CI, and merge

**Files:**
- Create: `docs/V23_BROWSER_CONTENT_E2E.md`
- Modify: `README.md`
- Modify: `PROBLEMS.md`

**Interfaces:**
- Records verified scope and remaining `SR-P001` work.

- [ ] **Step 1: Document V23**

Explain seeded fixture account, file-input CDP support, serial browser execution, covered operator path, and safety gates.

- [ ] **Step 2: Update `SR-P001` without resolving it**

Record V22 auth/RBAC plus V23 composer/media/scheduling/Queue/Calendar browser evidence. Remaining browser work must include Accounts/OAuth management, WhatsApp, Operations, Analytics, prompt-driven lifecycle actions, and drag/drop/calendar interaction not covered by V23.

- [ ] **Step 3: Update README**

Promote current status to V23 and set the next production-readiness direction to the remaining `SR-P001` surfaces before `SR-P007`/`SR-P006` and live-provider verification.

- [ ] **Step 4: Run fresh exact-head CI**

Require migrations, 446 Node tests, syntax, V22 auth E2E, and V23 content E2E on one exact SHA.

- [ ] **Step 5: Review changed-file/security scope**

Confirm no provider credentials, production test route, scheduler gate, provider adapter, migration, or production client/server behavior changed unless a browser-discovered defect required a separately justified fix.

- [ ] **Step 6: Open PR and wait for PR CI**

PR title: `V23: Browser E2E Critical Content Workflow`.

- [ ] **Step 7: Squash-merge pinned to the verified PR head**

Use the exact verified head SHA.

- [ ] **Step 8: Verify exact merged `main` CI**

Do not claim V23 complete until the merge commit's push workflow passes every gate.
