# V19 Drafts + Composer Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add durable drafts, autosave, reusable composer resources, per-platform content overrides, live previews, character counts, and server-authoritative compatibility reporting without changing scheduler topology.

**Architecture:** Unscheduled mutable content lives in dedicated composer-workflow tables and repository methods. Scheduling still goes through `createScheduledPost()`, with generic caption/media overrides persisted per publication and resolved at publish time. Frontend workflow logic lives outside the existing scheduling-focused composer module.

**Tech Stack:** Node.js >= 20, built-in HTTP server, PostgreSQL 17 + JSON development repository, vanilla HTML/CSS/ES modules, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-14-drafts-composer-v19-design.md`

## Global Constraints

- Keep one scheduler and existing job types; drafts never enqueue work.
- Keep WhatsApp isolated from social composer workflows.
- No new public management routes.
- Dynamic browser content must use DOM APIs/text content, not `innerHTML`.
- JSON and PostgreSQL repository behavior must remain contract-compatible.
- Draft updates use optimistic `revision` compare-and-swap.
- Final scheduling remains strict and revalidates all effective per-platform content.
- Existing real-publish safety gates remain unchanged.

---

### Task 1: V19 schema and repository contract

**Files:**
- Create: `server/db/migrations/007_composer_workflows.sql`
- Create: `server/db/postgres-composer.js`
- Modify: `server/db/postgres-repository.js`
- Modify: `server/db/json-repository.js`
- Test: `tests/composer-workflow-repository.test.js`
- Test: `tests/postgres-composer-workflow.test.js`

**Interfaces:**
- Produces repository methods: `createDraft`, `getDraft`, `listDrafts`, `updateDraft(id, patch, expectedRevision)`, `deleteDraft`, CRUD/list methods for caption templates, hashtag collections, destination groups.
- Adds publication fields `captionOverride`, `mediaOverride` to PostgreSQL mapping/update support.

- [ ] **Step 1: Write failing repository tests** for JSON/PostgreSQL draft CRUD, reusable resources, and stale revision rejection.
- [ ] **Step 2: Run targeted tests** and verify missing migration/method failures.
- [ ] **Step 3: Add migration 007** with `composer_drafts`, `caption_templates`, `hashtag_collections`, `destination_groups`, indexes, and publication override columns.
- [ ] **Step 4: Implement PostgreSQL workflow repository module** with normalized row mapping and compare-and-swap draft update: `UPDATE ... WHERE id=$1 AND revision=$2 RETURNING *`.
- [ ] **Step 5: Add JSON collections and methods** using the existing serialized mutation chain; stale revision must throw `DRAFT_REVISION_CONFLICT` before modifying data.
- [ ] **Step 6: Wire PostgreSQL module + required tables + publication mapper/update columns.**
- [ ] **Step 7: Run targeted repository tests** and confirm green.
- [ ] **Step 8: Commit** `feat: add composer workflow persistence`.

### Task 2: Effective publication content and scheduling overrides

**Files:**
- Create: `server/platforms/publication-content.js`
- Modify: `server/services/post-service.js`
- Modify: `server/db/postgres-scheduling.js`
- Modify: `server/platforms/instagram/publish.js`
- Modify: `server/platforms/facebook/publish.js`
- Modify: `server/platforms/threads/publish.js`
- Modify: `server/platforms/tiktok/publish.js`
- Test: `tests/post-service-overrides.test.js`
- Test: `tests/publication-content.test.js`

**Interfaces:**
- `resolvePublicationContent({ post, publication, baseMedia }) -> { post, media }`
- Destination inputs may include `captionOverride` and `mediaOverride`.

- [ ] **Step 1: Write failing tests** proving destination-specific validation and persistence of overrides.
- [ ] **Step 2: Write failing adapter/helper tests** proving effective caption/media override is used.
- [ ] **Step 3: Extend post-service normalization/validation** so each destination is checked using effective content and publication plans carry normalized overrides.
- [ ] **Step 4: Extend PostgreSQL atomic scheduling insert** to persist the two override fields.
- [ ] **Step 5: Add the publication-content helper** with explicit fallback semantics: `null/undefined` means inherit; explicit array means override.
- [ ] **Step 6: Update all four social adapters** to validate/publish effective content without changing provider API logic.
- [ ] **Step 7: Run targeted scheduling/provider tests** and confirm green.
- [ ] **Step 8: Commit** `feat: support per-platform composer overrides`.

### Task 3: Composer workflow service and compatibility report

**Files:**
- Create: `server/services/composer-workflow-service.js`
- Test: `tests/composer-workflow-service.test.js`

**Interfaces:**
- `createComposerWorkflowService({ repository })`
- Methods: draft/resource CRUD plus `compatibility(input, { now })`.
- Stable errors: `WORKFLOW_VALIDATION_ERROR`, `DRAFT_NOT_FOUND`, `DRAFT_REVISION_CONFLICT`.

- [ ] **Step 1: Write failing service tests** for permissive draft storage normalization, resource validation, hashtag normalization, and compatibility result shape.
- [ ] **Step 2: Implement draft normalization** allowing incomplete draft content but rejecting malformed object/array shapes.
- [ ] **Step 3: Implement template/hashtag/destination-group validation** with length/name bounds and deduplication.
- [ ] **Step 4: Implement compatibility reporting** for selected destinations using effective overrides and caption limits: Instagram 2200, Facebook 63206, Threads 500, TikTok 2200.
- [ ] **Step 5: Ensure account existence/connection/platform checks** are reported as issues, not provider calls.
- [ ] **Step 6: Run targeted service tests** and confirm green.
- [ ] **Step 7: Commit** `feat: add composer workflow service`.

### Task 4: Protected workflow APIs

**Files:**
- Create: `server/routes/composer-workflows.js`
- Modify: `server/app.js`
- Test: `tests/composer-workflow-api.test.js`

**Interfaces:**
- Protected routes under `/api/composer/*` exactly as specified in the V19 design.

- [ ] **Step 1: Write failing HTTP tests** for list/create/get/update/delete drafts, stale revision `409`, resource CRUD, compatibility `200`, invalid payload `400`, missing record `404`.
- [ ] **Step 2: Implement small route dispatcher** that parses route params and delegates to service methods; no database logic in route handlers.
- [ ] **Step 3: Wire routes through existing protected API path** in `server/app.js`; do not add public exceptions.
- [ ] **Step 4: Run API/auth regression tests** and confirm green.
- [ ] **Step 5: Commit** `feat: expose composer workflow APIs`.

### Task 5: Browser workflow API + previews

**Files:**
- Create: `client/js/api/composer-workflows-api.js`
- Create: `client/js/components/platform-preview.js`
- Test: `tests/composer-workflow-client.test.js`
- Test: `tests/platform-preview.test.js`

**Interfaces:**
- Browser API wraps all `/api/composer/*` endpoints through shared JSON client.
- Preview component accepts `{ container, compatibility, payload }` and renders safe DOM nodes.

- [ ] **Step 1: Write failing static/module tests** for correct endpoints/methods and no raw fetch scattering.
- [ ] **Step 2: Implement API module** with encoded IDs and JSON payloads.
- [ ] **Step 3: Write failing preview tests** for per-platform cards, character counts, effective captions/media summary, and no `innerHTML`.
- [ ] **Step 4: Implement preview component** using `createElement`, `replaceChildren`, and `textContent` only.
- [ ] **Step 5: Run targeted client tests** and confirm green.
- [ ] **Step 6: Commit** `feat: add composer workflow client primitives`.

### Task 6: Autosave, drafts, reusable resources, and group application

**Files:**
- Create: `client/js/pages/composer-workflows.js`
- Modify: `client/js/pages/composer.js`
- Modify: `client/js/app.js`
- Test: `tests/composer-workflow-ui.test.js`

**Interfaces:**
- `initializeComposerWorkflows({ composer })` receives the existing composer controller and returns `{ refresh, activeDraftId }` style state API.
- Existing composer controller exposes a small read/apply surface rather than workflow code being embedded into it.

- [ ] **Step 1: Write failing UI contract tests** for 800 ms autosave, revision PATCH, stale conflict feedback, draft loading/deletion, template apply, hashtag append/dedupe, destination-group apply, and compatibility refresh.
- [ ] **Step 2: Extend composer controller minimally** with explicit helpers to read/apply base composer state and trigger existing account/TikTok logic.
- [ ] **Step 3: Implement workflow controller** with one in-flight autosave, dirty replay after completion, and explicit conflict stop behavior.
- [ ] **Step 4: Implement reusable resource application** without silently replacing disconnected accounts.
- [ ] **Step 5: Debounce compatibility calls separately** and hand results to preview component.
- [ ] **Step 6: Wire controller from `app.js`** while preserving existing schedule callbacks.
- [ ] **Step 7: Run targeted UI tests** and confirm green.
- [ ] **Step 8: Commit** `feat: add composer autosave workflows`.

### Task 7: Dashboard controls and styling

**Files:**
- Modify: `client/index.html`
- Modify: `client/css/pages/composer.css`
- Test: `tests/composer-workflow-dashboard.test.js`

**Interfaces:**
- Adds semantic controls/containers with stable IDs used by `composer-workflows.js`.

- [ ] **Step 1: Write failing dashboard markup tests** for draft selector/name/status, save/delete controls, caption-template and hashtag/group controls, per-platform override editors, compatibility panel, and preview container.
- [ ] **Step 2: Add semantic HTML** with labels/buttons/forms; no inline JS/CSS.
- [ ] **Step 3: Add responsive composer-only CSS** reusing root spacing/color/radius tokens.
- [ ] **Step 4: Run dashboard/client tests** and confirm green.
- [ ] **Step 5: Commit** `feat: add V19 composer workflow dashboard`.

### Task 8: Documentation, problem tracking, full CI, review, and merge

**Files:**
- Create: `docs/V19_DRAFTS_COMPOSER.md`
- Modify: `README.md`
- Modify: `PROBLEMS.md` only if development discovers new unresolved debt or verification gaps.

**Interfaces:**
- README current status advances to V19 and next source milestone becomes Analytics/Reporting.

- [ ] **Step 1: Run full local/GitHub test gate**: migrations, `npm test`, JS syntax.
- [ ] **Step 2: Review diff for credentials/public-route expansion/provider-side side effects** and fix any Important/Critical issue before merge.
- [ ] **Step 3: Document V19 APIs, autosave/revision behavior, override semantics, compatibility limits, and E2E gap.**
- [ ] **Step 4: Update README roadmap/status and PROBLEMS evidence truthfully.**
- [ ] **Step 5: Run exact-head CI and require green.**
- [ ] **Step 6: Open PR, verify PR head has not moved, squash-merge without further confirmation.**
- [ ] **Step 7: Verify exact post-merge `main` CI and only then report completion.**