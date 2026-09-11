# V12 Media Storage Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local/S3-compatible media storage selection, real file-signature validation, and bounded automatic orphan-retention cleanup without changing the existing media API/UI contract.

**Architecture:** Keep the current media-store interface and move driver selection into a factory. Extract shared media type/signature rules so both local and S3 drivers enforce identical upload safety. Add an S3 REST/SigV4 adapter using Node built-ins, then add orphan cleanup as a maintenance loop under the scheduler subsystem.

**Tech Stack:** Node.js >=20, built-in `crypto`, `fetch`, streams, filesystem APIs, existing vanilla JS/Node test runner, GitHub Actions + PostgreSQL 17.

**Spec:** `docs/superpowers/specs/2026-09-11-media-storage-v12-design.md`

## Global Constraints

- Local media storage remains the default.
- No AWS SDK or new runtime dependency is introduced.
- Existing `/api/media`, upload, deletion, and `/media/:key` response shapes remain compatible.
- Object-store credentials remain server-only and are never logged or returned.
- File content must match declared JPEG/PNG/WebP/MP4 MIME before storage succeeds.
- Orphan cleanup is opt-in, retention-based, bounded, and belongs under `server/scheduler/`.
- No database migration is required.

---

### Task 1: Shared media type and signature validation

**Files:**
- Create: `server/media/media-format.js`
- Create: `server/media/validated-media.js`
- Modify: `server/media/local-media-store.js`
- Modify: `tests/local-media-store.test.js`
- Create: `tests/media-format.test.js`

**Interfaces:**
- Produces `getMediaFormat(contentType)`, `getMediaMetadataFromKey(key)`, and `iterateValidatedMedia(readable, { contentType, maxBytes, totalRemainingBytes })`.
- `iterateValidatedMedia` yields original bytes after validating the prefix and reports total bytes through a returned state object or completion callback used by store implementations.

- [ ] Write tests with real minimal JPEG, PNG, WebP, and MP4 byte fixtures.
- [ ] Add mismatch/malformed-signature tests that assert no local file remains.
- [ ] Run `npm test` and confirm the new signature tests fail before implementation.
- [ ] Implement format lookup, magic-byte detection, and replaying validated stream logic.
- [ ] Refactor local store to use shared validation while preserving quota, short-write, list/open/remove behavior.
- [ ] Run `npm test` and syntax checks; commit the green slice.

### Task 2: Storage factory and URL-reference abstraction

**Files:**
- Create: `server/media/create-media-store.js`
- Modify: `server/media/local-media-store.js`
- Modify: `server/services/media-library-service.js`
- Modify: `server/server.js`
- Create: `tests/create-media-store.test.js`
- Modify: relevant media-library/API tests.

**Interfaces:**
- Produces `createMediaStoreFromEnvironment({ env, fetchImpl, now })`.
- Every media store exposes `keyFromUrl(url): string|null`.

- [ ] Write failing tests for default local selection, unsupported driver rejection, local URL mapping, and S3 required-config validation.
- [ ] Run the targeted tests and confirm red failures.
- [ ] Implement the factory and local `keyFromUrl`.
- [ ] Change reference protection to call `mediaStore.keyFromUrl(record.url)`.
- [ ] Wire `server.js` through the factory.
- [ ] Run the full suite and syntax checks; commit the green slice.

### Task 3: S3-compatible SigV4 request client

**Files:**
- Create: `server/media/s3-signer.js`
- Create: `server/media/s3-request.js`
- Create: `tests/s3-signer.test.js`
- Create: `tests/s3-request.test.js`

**Interfaces:**
- `signS3Request({ method, url, region, accessKeyId, secretAccessKey, headers, payloadHash, now })` returns signed headers.
- `createS3RequestClient(config)` exposes `request({ method, url, headers, body, payloadHash })` and maps non-2xx failures to sanitized error codes.

- [ ] Add deterministic signing tests using a fixed timestamp and canonical request assertions.
- [ ] Add fake-fetch tests verifying `Authorization`, `x-amz-date`, `x-amz-content-sha256`, and sanitized failure mapping.
- [ ] Confirm tests fail before implementation.
- [ ] Implement RFC3986 query/path canonicalization and AWS4 key derivation with built-in crypto.
- [ ] Implement the request wrapper without logging response bodies or credentials.
- [ ] Run tests and syntax checks; commit.

### Task 4: S3-compatible media store

**Files:**
- Create: `server/media/s3-media-store.js`
- Modify: `server/media/create-media-store.js`
- Create: `tests/s3-media-store.test.js`

**Interfaces:**
- Implements the common media-store contract.
- Uses path-style object API keys `${prefix}${generatedKey}` and public URLs `${MEDIA_PUBLIC_BASE_URL}/${generatedKey}`.

- [ ] Build a fake S3 HTTP/fetch harness covering PUT, paginated ListObjectsV2, GET, and DELETE.
- [ ] Write failing tests for save/list/usage/open/remove, pagination, quota, public URL, `keyFromUrl`, and signature mismatch.
- [ ] Confirm red failures.
- [ ] Implement object URL/list URL construction and XML entity-safe parsing for ListObjectsV2 fields used by Srocial.
- [ ] Buffer one validated upload up to the configured file limit, compute SHA-256/content-length, then PUT it.
- [ ] Implement authenticated GET/DELETE and metadata derivation from generated keys.
- [ ] Run the full suite and syntax checks; commit.

### Task 5: Orphan-retention cleanup service and scheduler maintenance loop

**Files:**
- Create: `server/services/media-retention-service.js`
- Create: `server/scheduler/start-media-retention-loop.js`
- Modify: `server/server.js`
- Create: `tests/media-retention-service.test.js`
- Create: `tests/media-retention-loop.test.js`

**Interfaces:**
- `cleanupOrphanMedia({ repository, mediaStore, now, retentionMs, maxDeletes })` returns `{ scanned, eligible, deleted }`.
- `startMediaRetentionLoop({ enabled, repository, mediaStore, retentionMs, intervalMs, maxDeletes, ... })` returns `{ started, stop() }`.

- [ ] Write failing tests for referenced assets, young assets, oldest-first deletion, batch cap, and delete-error sanitization.
- [ ] Write failing loop tests for disabled mode, non-overlap, periodic cleanup, and stop.
- [ ] Confirm red failures.
- [ ] Implement cleanup service using store `keyFromUrl` reference resolution.
- [ ] Implement the maintenance loop under `server/scheduler/` and wire graceful stop in `server.js`.
- [ ] Run full tests and syntax checks; commit.

### Task 6: HTTP error mapping, environment examples, and operator docs

**Files:**
- Modify: `server/app.js`
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `HOW_TO_RUN.md`
- Modify: relevant upload/API tests.

**Interfaces:**
- `MEDIA_SIGNATURE_MISMATCH` and `INVALID_MEDIA_SIGNATURE` map to HTTP 415 with safe public error codes.

- [ ] Add failing API tests for signature errors.
- [ ] Implement safe HTTP mapping.
- [ ] Document local/S3 configuration, public URL requirements, memory behavior for S3 uploads, and opt-in retention settings.
- [ ] Advance README current status to V12 and move roadmap priority to Instagram token refresh.
- [ ] Run exact-head GitHub Actions verification and inspect logs for test count, migrations, syntax, and npm audit.

### Task 7: Review, PR, merge, and post-merge verification

**Files:** no new implementation scope.

- [ ] Compare `main...build/media-storage-v12` for unrelated changes and credential leakage.
- [ ] Review all public-route/auth behavior remains unchanged.
- [ ] Open PR with exact verified head SHA and verification evidence.
- [ ] Confirm PR-triggered CI is green and no review threads block merge.
- [ ] Squash-merge with `expected_head_sha`.
- [ ] Verify the `main` workflow succeeds on the resulting merge commit.
