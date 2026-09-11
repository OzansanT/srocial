# V9 Media Library & Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class local media library with quota visibility/enforcement, safe deletion, and composer reuse.

**Architecture:** Extend the existing local media-store abstraction for inventory, usage, removal, and total quota; keep persisted post-media reference checks in a dedicated media-library service/route layer. Add a dedicated browser API/page module and connect it to the composer through an explicit callback.

**Tech Stack:** Node.js >=20 built-ins, built-in HTTP server, vanilla ES modules, HTML/CSS, Node test runner, no new npm runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-09-11-media-library-v9-design.md`

## Global Constraints

- Preserve one frontend, one backend, one scheduler, and isolated platform adapters.
- Keep secrets server-only.
- Do not add React, Vue, Tailwind, Bootstrap, jQuery, or a new runtime dependency.
- `MEDIA_UPLOAD_MAX_BYTES` remains the per-file limit.
- Add `MEDIA_UPLOAD_TOTAL_MAX_BYTES=5368709120` as the default 5 GiB total limit.
- Never delete an asset referenced by persisted post media.
- Full `npm test` and `node --check` verification must pass before merge.

---

### Task 1: Media store inventory, deletion, and quota

**Files:**
- Modify: `server/media/local-media-store.js`
- Test: `tests/local-media-store.test.js`

**Interfaces:**
- Produces: `mediaStore.list()`, `mediaStore.usage()`, `mediaStore.remove(key)`.
- Extends: `createLocalMediaStore({ rootDirectory, publicBaseUrl, maxBytes, totalMaxBytes })`.

- [ ] **Step 1: Write failing tests**

Add tests equivalent to:

```js
test('lists uploaded assets and reports aggregate usage', async () => {
  const store = createLocalMediaStore({ rootDirectory, publicBaseUrl: 'https://example.test', totalMaxBytes: 1000 });
  await store.initialize();
  const upload = await store.save(Readable.from([Buffer.from('abc')]), { contentType: 'image/jpeg' });
  const assets = await store.list();
  const usage = await store.usage();
  assert.equal(assets[0].key, upload.key);
  assert.equal(usage.usedBytes, 3);
  assert.equal(usage.maxBytes, 1000);
  assert.equal(usage.remainingBytes, 997);
  assert.equal(usage.count, 1);
});

test('removes a generated media key', async () => {
  const upload = await store.save(Readable.from([Buffer.from('abc')]), { contentType: 'image/jpeg' });
  await store.remove(upload.key);
  await assert.rejects(store.open(upload.key), (error) => error.code === 'MEDIA_NOT_FOUND');
});

test('rejects an upload that would exceed total storage quota and removes the partial file', async () => {
  const store = createLocalMediaStore({ rootDirectory, publicBaseUrl: 'https://example.test', maxBytes: 100, totalMaxBytes: 4 });
  await store.initialize();
  await store.save(Readable.from([Buffer.from('abc')]), { contentType: 'image/jpeg' });
  await assert.rejects(
    store.save(Readable.from([Buffer.from('de')]), { contentType: 'image/jpeg' }),
    (error) => error.code === 'MEDIA_STORAGE_QUOTA_EXCEEDED'
  );
  assert.equal((await store.usage()).usedBytes, 3);
});
```

- [ ] **Step 2: Run branch CI and verify RED**

Expected: new tests fail because `list`, `usage`, `remove`, and total quota behavior do not exist.

- [ ] **Step 3: Implement minimal store behavior**

Use `readdir(..., { withFileTypes: true })` plus `stat()` for generated keys only. Return public metadata, never disk paths. Validate removal keys with the existing `GENERATED_KEY`. During save, compare existing usage plus streamed bytes to `totalMaxBytes` and throw `MEDIA_STORAGE_QUOTA_EXCEEDED` before writing bytes beyond the quota.

- [ ] **Step 4: Run tests and keep them green**

Run repository CI after implementation.

---

### Task 2: Repository contract and media library HTTP API

**Files:**
- Modify: `server/db/json-repository.js`
- Create: `server/services/media-library-service.js`
- Create: `server/routes/media.js`
- Modify: `server/app.js`
- Test: `tests/media-repository.test.js`
- Create: `tests/media-library-api.test.js`

**Interfaces:**
- Produces: `repository.listMedia()`.
- Produces: `listMediaLibrary(repository, mediaStore)` and `deleteMediaAsset(repository, mediaStore, key)`.
- HTTP: `GET /api/media`, `DELETE /api/media/:key`.

- [ ] **Step 1: Write failing repository/API tests**

Add a repository assertion:

```js
const all = await repository.listMedia();
assert.equal(all.length, 1);
assert.equal(all[0].url, 'https://example.test/media/example.jpg');
```

Add HTTP coverage equivalent to:

```js
test('GET /api/media returns assets, usage and reference state', async () => {
  const response = await request(server, { method: 'GET', path: '/api/media' });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.assets[0].referenced, true);
  assert.equal(response.body.usage.count, 1);
});

test('DELETE /api/media/:key refuses referenced assets', async () => {
  const response = await request(server, { method: 'DELETE', path: `/api/media/${key}` });
  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.body, { error: 'media_in_use' });
});
```

- [ ] **Step 2: Verify RED in CI**

Expected: failures because repository/API contracts do not exist.

- [ ] **Step 3: Implement service and route layer**

Reference detection parses persisted media URLs and compares decoded `/media/:key` path keys. `listMediaLibrary` joins store inventory with the referenced-key set. `deleteMediaAsset` checks reference state before calling `mediaStore.remove(key)`.

Map `MEDIA_STORAGE_QUOTA_EXCEEDED` to HTTP 507 for uploads. Map referenced deletion to 409 `media_in_use`.

- [ ] **Step 4: Verify API tests and full backend tests are green**

---

### Task 3: Browser Media Library

**Files:**
- Create: `client/js/api/media-library-api.js`
- Create: `client/js/pages/media-library.js`
- Create: `client/css/pages/media-library.css`
- Modify: `client/js/pages/composer.js`
- Modify: `client/js/app.js`
- Modify: `client/index.html`
- Create: `tests/media-library-client.test.js`
- Create: `tests/media-library-ui.test.js`

**Interfaces:**
- Produces: `listMediaAssets()` and `deleteMediaAsset(key)` client API functions.
- Produces: `initializeMediaLibrary({ onUseMedia })`.
- Extends composer initializer return value with `useMedia({ type, url })`.

- [ ] **Step 1: Write failing browser contract tests**

Assert the API module calls:

```text
GET /api/media
DELETE /api/media/:encodedKey
```

Assert the HTML contains `#media`, `#media-library-list`, `#media-storage-summary`, and the Media stylesheet/module wiring.

- [ ] **Step 2: Verify RED in CI**

- [ ] **Step 3: Implement the Media UI**

Render cards with DOM APIs only. Image assets use `<img>`; video assets use muted `<video controls preload="metadata">`. Buttons provide Use in composer, Copy URL, and Delete. Referenced assets show an in-use badge and disable delete. `Use in composer` calls the injected composer callback and navigates to `#create`.

- [ ] **Step 4: Verify client tests and full tests are green**

---

### Task 4: Configuration, documentation, and final verification

**Files:**
- Modify: `.env.example`
- Modify: `server/server.js`
- Modify: `README.md`
- Modify: `HOW_TO_RUN.md`

**Interfaces:**
- Wires `MEDIA_UPLOAD_TOTAL_MAX_BYTES` to the local media store.

- [ ] **Step 1: Add configuration and docs**

Document:

```text
MEDIA_UPLOAD_TOTAL_MAX_BYTES=5368709120
```

Document the Media Library API/UI, reference-protected deletion, quota semantics, and remaining limitations.

- [ ] **Step 2: Run complete verification**

GitHub Actions must run:

```bash
npm test
find server client tests -name '*.js' -print0 | xargs -0 -n1 node --check
```

Expected: zero failures.

- [ ] **Step 3: Review the PR diff for security boundaries**

Confirm no disk paths, secrets, tokens, or unsafe HTML interpolation are exposed; deletion remains reference-protected.

- [ ] **Step 4: Squash-merge into `main` and verify the merge commit CI**
