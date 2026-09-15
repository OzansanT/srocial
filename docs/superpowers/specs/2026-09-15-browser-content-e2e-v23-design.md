# V23 Browser E2E Critical Content Workflow Design

## Context

The supplied product roadmap ends at item 100. V22 established a dependency-free real-Chrome CI gate and partially closed `SR-P001` for authentication, RBAC, Admin user lifecycle, and session revocation. `SR-P001` remains open because the primary content-operator workflow is still covered only by deterministic module/API contracts rather than a real browser.

V23 extends the existing V22 harness. It does not add a new product feature, provider capability, scheduler, API, or production test endpoint.

## Goal

Exercise Srocial's critical content workflow in real headless Chrome from persisted draft editing through media management, scheduling, and Queue/Calendar lifecycle actions while all external execution remains disabled.

## Scope

### Composer workflow

The browser must verify:

- a seeded connected Facebook account becomes selectable in the real composer;
- draft autosave persists name, caption, destination, schedule, and per-platform content override state;
- navigating/reloading and selecting the saved draft restores persisted values;
- an external revision update causes the stale browser autosave to receive the real `409 draft_revision_conflict` path and preserve current browser values;
- reloading the saved revision clears the conflict and allows further saves;
- caption templates can be saved and applied;
- hashtag collections can be saved and appended without duplicate behavior being bypassed;
- destination groups can be saved from selected account-bound destinations;
- Facebook caption override plus explicit `mediaOverride: []` produces a compatible text-only effective publication;
- compatibility status and rendered platform preview update in the real DOM.

### Media workflow

The browser must upload a real byte-signature-valid image through `<input type=file>` and the existing upload button. Because the E2E server is HTTP loopback, the test expects the existing local-media HTTPS warning rather than pretending the asset is provider-publishable.

The Media Library must show the uploaded asset, allow `Use in composer`, and permit deletion while the asset remains unreferenced. Deletion confirmation must use normal page behavior; the test harness may satisfy the browser dialog but must not modify production code.

### Scheduling and lifecycle

The test schedules a text-only Facebook post using the seeded connected account. Scheduler execution remains disabled. The browser must observe:

- `Post scheduled.` feedback;
- the scheduled item in Queue;
- the item represented in Calendar for the current-day fixture schedule;
- bulk reschedule through the real Queue controls and updated persisted/UI schedule;
- bulk cancel through the real Queue controls and cancelled publication state visible in Queue/Calendar.

Prompt-driven single-row edit/duplicate actions and drag/drop are intentionally left for a later slice; V23 uses non-dialog bulk lifecycle controls to cover authoritative lifecycle mutations without enlarging the CDP harness unnecessarily.

## Test-fixture changes

`startSrocialE2EServer()` gains an optional `seedAccounts` array. Before spawning the real server, the fixture writes only those account records to its temporary JSON data file. The normal repository initializer fills every omitted collection with an empty array, and normal auth bootstrap creates the fixture Admin. No seed path exists in production runtime.

The fixture account is a deterministic Facebook account with `state: CONNECTED`; it has no provider token because no publish adapter is invoked.

## Browser-driver changes

The CDP driver gains `setFileInputFiles(selector, filePaths)`. It enables the DOM domain, resolves the current document/input node, and calls `DOM.setFileInputFiles`. Paths must be explicit local paths supplied by the test.

No generic filesystem or arbitrary script endpoint is added to Srocial.

## E2E process model

With more than one `.e2e.js` file, `npm run test:e2e` must use Node's `--test-concurrency=1`. This prevents two Chrome/Srocial fixtures from competing for hosted-runner resources and makes E2E ordering/resource usage deterministic. Each file still owns independent temporary server/browser state.

All helper operations retain bounded CDP, HTTP, scenario, process-shutdown, and CI timeouts.

## Safety invariants

The V23 E2E server keeps:

```text
DATABASE_DRIVER=json
APP_AUTH_ENABLED=true
SCHEDULER_ENABLED=false
ALLOW_REAL_PUBLISH=false
ALLOW_REAL_WHATSAPP=false
MEDIA_ORPHAN_CLEANUP_ENABLED=false
```

Provider application credentials remain blank. Scheduling persists jobs but no scheduler worker can execute them. Local uploaded media is never presented as real provider verification.

## Error handling

The E2E suite waits on observable DOM/API state rather than arbitrary sleeps except for bounded autosave debounce windows represented through condition polling. Every browser/CDP operation remains bounded. A failed assertion or timeout must fail CI; Chrome absence must not silently skip tests.

## Files

Create:
- `tests/e2e/content-workflow.e2e.js`
- `docs/V23_BROWSER_CONTENT_E2E.md`
- `docs/superpowers/plans/2026-09-15-browser-content-e2e-v23.md`

Modify:
- `tests/e2e/srocial-server.js`
- `tests/e2e/browser-driver.js`
- `package.json`
- `README.md`
- `PROBLEMS.md`

Production `server/` and `client/` code should not change unless a real browser test exposes a product defect. If that happens, the defect must be root-caused and fixed through the normal TDD/debugging workflow rather than weakening the E2E assertion.

## Completion criteria

V23 is complete only when:

1. a deliberate RED run proves the new E2E contract fails for the missing harness capabilities;
2. existing deterministic tests remain green;
3. all V22 and V23 real-browser scenarios pass on the exact release head;
4. `SR-P001` is updated to record the newly covered content flow while remaining `PARTIAL` for Accounts/OAuth, WhatsApp, Operations, Analytics, prompt/drag lifecycle paths, and other unverified browser surfaces;
5. PR CI passes on the exact verified head;
6. the PR is squash-merged pinned to that head;
7. the exact merge commit on `main` passes migrations, deterministic tests, syntax, and browser E2E.
