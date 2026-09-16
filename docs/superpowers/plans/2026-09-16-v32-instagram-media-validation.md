# V32 Instagram Media Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate Instagram image aspect ratio, video duration, and media file size before scheduling and expose the same provider-specific result in Composer compatibility.

**Architecture:** Add a media-domain inspector that only opens Srocial-managed media through the existing media-store contract, plus an Instagram-specific policy module with centralized limits. Inject the media store from `app.js` into scheduling and Composer compatibility; never fetch arbitrary remote media URLs.

**Tech Stack:** Node.js ES modules, vanilla JavaScript, existing local/S3 media-store interfaces, Node test runner, headless Chrome/CDP E2E.

**Spec:** `docs/superpowers/specs/2026-09-16-v32-instagram-media-validation-design.md`

## Global Constraints

- Source roadmap scope is exactly #26 image aspect-ratio validation, #27 video-duration validation, #28 file-size validation.
- No new npm dependency unless strictly required; prefer focused native parsers.
- No arbitrary server-side HTTP fetch for metadata.
- Production Instagram scheduling fails closed when managed metadata cannot be verified.
- Non-Instagram scheduling behavior remains unchanged.
- Validation happens before repository mutation.
- User/provider/storage secrets must not appear in validation errors.

---

### Task 1: Instagram media policy

**Files:**
- Create: `server/platforms/instagram/media-policy.js`
- Create: `tests/instagram-media-policy.test.js`

**Interfaces:**
- Produces: `INSTAGRAM_MEDIA_LIMITS`
- Produces: `validateInstagramMediaMetadata(media, metadata)` returning zero or more stable issue objects.

- [ ] **Step 1: Write failing boundary tests** for 4:5 and 1.91:1 image ratios, 8 MiB image size, 3–900 second video duration, and 300 MiB video size.
- [ ] **Step 2: Run the complete CI test job and confirm only the new policy contract fails.**
- [ ] **Step 3: Implement the minimal policy module** with centralized constants and stable issue codes.
- [ ] **Step 4: Run policy tests and the complete Node suite.**
- [ ] **Step 5: Commit the coherent policy change.**

### Task 2: Managed media metadata inspection

**Files:**
- Create: `server/media/media-metadata.js`
- Create: `server/media/managed-media-inspector.js`
- Create: `tests/media-metadata.test.js`
- Create: `tests/managed-media-inspector.test.js`

**Interfaces:**
- Produces: `parseImageDimensions(contentType, bytes)` -> `{ width, height }` for JPEG/PNG/WebP.
- Produces: `parseMp4Duration(bytes)` -> seconds.
- Produces: `createManagedMediaInspector({ mediaStore })` with `inspect(media)` -> trusted `{ sizeBytes, contentType, width?, height?, durationSeconds? }`.

- [ ] **Step 1: Add RED parser tests** using deterministic tiny PNG/JPEG/WebP/MP4 fixtures.
- [ ] **Step 2: Add RED inspector tests** proving managed key resolution/open, no arbitrary URL fetch, safe unavailable errors, and file-size short-circuiting.
- [ ] **Step 3: Implement focused native parsers and bounded stream collection.**
- [ ] **Step 4: Implement managed-store inspection and safe error normalization.**
- [ ] **Step 5: Run focused plus complete Node tests.**
- [ ] **Step 6: Commit.**

### Task 3: Scheduling preflight

**Files:**
- Modify: `server/services/post-service.js`
- Modify: `server/routes/posts.js`
- Modify: `server/app.js`
- Modify: `tests/instagram-carousel-post-service.test.js`
- Modify/Add route/API tests as needed.

**Interfaces:**
- `createScheduledPost(repository, input, { now, allowLegacyPlatforms, mediaStore })`
- production app passes configured `mediaStore` explicitly.

- [ ] **Step 1: Add RED tests** for valid managed image, invalid image ratio, invalid video duration, file-size rejection, unmanaged Instagram media, effective destination override validation, and unchanged Facebook behavior.
- [ ] **Step 2: Verify RED before persistence** (`createSocialScheduleGraph` remains untouched on invalid input).
- [ ] **Step 3: Add request-local deduplicated Instagram inspection** before graph construction.
- [ ] **Step 4: Persist trusted metadata on base media records without accepting client metadata.**
- [ ] **Step 5: Wire `mediaStore` through posts route/application entrypoint.**
- [ ] **Step 6: Run focused and full Node tests.**
- [ ] **Step 7: Commit.**

### Task 4: Composer compatibility preflight

**Files:**
- Modify: `server/services/composer-workflow-service.js`
- Modify: `server/routes/composer-workflows.js`
- Modify: `server/app.js`
- Modify: `tests/composer-workflow-service.test.js`
- Modify route tests as needed.

**Interfaces:**
- `createComposerWorkflowService({ repository, mediaStore })`
- `compatibility()` reports the same Instagram media issue codes used by scheduling.

- [ ] **Step 1: Add RED compatibility tests** for valid/invalid managed Instagram media and unchanged non-Instagram compatibility.
- [ ] **Step 2: Implement request-local Instagram preflight in compatibility.**
- [ ] **Step 3: Wire `mediaStore` through Composer workflow route/application entrypoint.**
- [ ] **Step 4: Run focused and full Node tests.**
- [ ] **Step 5: Commit.**

### Task 5: Real-browser managed-media coverage

**Files:**
- Modify: `tests/e2e/instagram-carousel.e2e.js`
- Modify test helpers only if required by the existing browser API.

**Interfaces:**
- Browser test uploads deterministic valid media to Srocial, converts returned managed path to an HTTPS-shaped URL with the same key, and schedules the ordered Instagram carousel.

- [ ] **Step 1: Update the E2E fixture to use Srocial-managed valid image bytes.**
- [ ] **Step 2: Assert compatibility succeeds and scheduling persists order.**
- [ ] **Step 3: Run the full Chrome suite.**
- [ ] **Step 4: Commit.**

### Task 6: Release documentation and problem tracking

**Files:**
- Create: `docs/V32_INSTAGRAM_MEDIA_VALIDATION.md`
- Modify: `README.md`
- Modify: `HOW_TO_RUN.md` if operator behavior needs explicit guidance.
- Modify: `PROBLEMS.md`

**Interfaces:**
- README current status becomes V32 only on the release branch that will be merged with the code.
- `SR-P011` remains `VERIFY` and is extended to cover live acceptance of V32 media-boundary behavior.

- [ ] **Step 1: Document managed-media requirement, current limits, trust boundary, safe failure behavior, and source roadmap #26–28 completion.**
- [ ] **Step 2: Update README current status and set source #29 as the next development candidate after V32.**
- [ ] **Step 3: Review active `PROBLEMS.md`; add/extend only genuine unresolved verification gaps.**
- [ ] **Step 4: Commit.**

### Task 7: Final verification and integration

**Files:** No new product files unless review finds a concrete defect.

- [ ] **Step 1: Open/reconcile the V32 PR and inspect changed filenames/diff/review threads.**
- [ ] **Step 2: Run exact-final-head CI: migrations 001–010, complete Node suite, syntax, complete Chrome suite.**
- [ ] **Step 3: Check for accidental secrets and unrelated changes.**
- [ ] **Step 4: Mark PR ready and squash-merge with `expected_head_sha`.**
- [ ] **Step 5: Verify the push-triggered workflow on the exact merge SHA.**
- [ ] **Step 6: Fetch `main` README/PROBLEMS to verify V32 status actually landed.**

## Self-review

- Spec coverage: #26 is Task 1/2/3/4; #27 is Task 1/2/3/4; #28 is Task 1/2/3/4; browser/release verification is Task 5/7.
- No cross-provider feature expansion is included.
- No arbitrary URL fetch or new dependency is required.
- Existing media-store contract is reused rather than redesigned.
- Stable interface names above are consistent across tasks.
