# V31 — Instagram Carousel & Multi-Image Composer Implementation Plan

> Execute with TDD on `v31-instagram-carousel`; do not merge until the exact final head and merged `main` are both green.

## Task 1 — Pin server media-count contracts

Files: `tests/instagram-validator.test.js`, post-service tests, `server/platforms/instagram/validator.js`, `server/services/post-service.js`.

1. RED: add tests for ordered 2-item mixed carousel, 10-item acceptance, 11-item rejection, and generic scheduling that allows multi-media only for Instagram.
2. Run CI and record the expected failures.
3. GREEN: change Instagram provider media max to 10 and update Instagram validator to normalize 1–10 items while preserving the one-item output shape for compatibility.
4. Run Node tests/syntax through CI.

## Task 2 — Implement resumable Instagram carousel provider flow

Files: `tests/instagram-publish.test.js`, scheduler worker tests, `server/platforms/instagram/publish.js`, `server/scheduler/workers/social-publication-worker.js`, `server/scheduler/workers/status-check-worker.js`.

1. RED: test ordered child-container creation for image/video, child-processing resume state, parent-processing resume state, final publish, error mapping, and scheduler persistence of adapter-returned `providerOptions`.
2. Verify RED failures are limited to missing carousel/provider-state behavior.
3. GREEN: create ordered child containers, persist temporary namespaced workflow state in `providerOptions`, resume via existing status checks, create/check parent, publish final parent, and clear temporary state.
4. Preserve existing single image/Reel tests exactly.
5. Run Node tests/syntax.

## Task 3 — Implement ordered multi-media Composer payload/state

Files: `tests/composer-payload.test.js`, `tests/composer-upload.test.js`, relevant composer workflow tests, `client/js/pages/composer.js`.

1. RED: assert repeated `mediaUrl`/`mediaType` form fields produce ordered media arrays and state apply/get round-trips multiple media.
2. RED: assert upload/library selection fills the first empty media row or appends without overwriting occupied media.
3. GREEN: change base-media extraction to `getAll`, add media-row helpers, make `useMedia()` append/fill, preserve all rows in `getState()`/`applyState()`, and reset to one row after scheduling.
4. Keep old one-media tests passing.

## Task 4 — Add multi-image Composer UI

Files: `client/index.html`, `client/css/pages/composer.css`, structural UI tests.

1. RED: assert the Composer exposes a media-items container, Add media control, and repeatable ordered row contract.
2. GREEN: update HTML/CSS and DOM event handling for up to ten rows, removable extra rows, accessible labels, count/limit feedback, and busy-state disabling.
3. Verify existing upload/Media Library integration remains functional.

## Task 5 — Real-browser persistence coverage

Files: `tests/e2e/*` appropriate Composer E2E fixture.

1. RED: seed/connect Instagram, enter two ordered HTTPS media rows, schedule through the real browser, and assert the API/repository returns the two media records in the same order.
2. GREEN only if browser support needs bounded synchronization/UI fixes; do not enable live publishing.
3. Run the full Chrome gate.

## Task 6 — Documentation/tracker reconciliation

Files: `README.md`, `docs/V31_INSTAGRAM_CAROUSEL.md`, `PROBLEMS.md`.

1. Update current status to V31 and test counts only after the code-complete green gate.
2. Document source #24–25 behavior and that #26–28 remain next.
3. If no live Instagram Professional provider execution is available, add a `VERIFY` tracker entry for real carousel publishing instead of claiming live verification.
4. Re-read `PROBLEMS.md` and ensure existing external blockers remain accurate.

## Task 7 — Final release gates and merge

1. Require one full exact-head GitHub Actions run: PostgreSQL migrations, all Node tests, JS syntax, all Chrome E2E.
2. Review PR diff/file list and review threads/reviews.
3. Mark PR ready and squash-merge with expected head SHA.
4. Require the push-triggered `main` workflow on the exact merge SHA to pass.
5. Fetch `main` README/PROBLEMS and confirm V31/current tracker state.
6. Report merge SHA, exact verification counts, any external VERIFY blocker, and source next #26–28.