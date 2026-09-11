# Direct Media Upload V8 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users upload supported images/videos directly to Srocial and reuse the generated public URL in the existing account-bound scheduling flow.

**Architecture:** Add a streamed local-media-store abstraction under `server/media/`, wire raw-binary upload and immutable media-serving routes at the HTTP boundary, and add a small client upload API plus composer controls. The existing post/media publication contract remains unchanged; uploads simply produce the HTTPS URL already accepted by scheduling.

**Tech Stack:** Node.js >=20 built-ins (`fs`, `stream`, `crypto`), vanilla HTML/CSS/JS ES modules, built-in `node:test`, existing GitHub Actions CI.

**Spec:** `docs/superpowers/specs/2026-09-10-direct-media-upload-design.md`

## Global Constraints

- No new npm runtime dependency.
- Default upload directory: `./data/uploads`.
- Default upload limit: `52428800` bytes (50 MiB).
- Exact MIME allowlist: `image/jpeg`, `image/png`, `image/webp`, `video/mp4`.
- No SVG/HTML upload support.
- Use `crypto.randomUUID()` generated asset keys; never use the original filename as a storage path.
- Stream upload bytes to disk and delete partial files after overflow/failure.
- Do not weaken the existing HTTPS media validation in post scheduling.
- `GET /media/:key` must use trusted MIME mapping and `X-Content-Type-Options: nosniff`.
- Uploaded media is public-by-URL in V8 because provider APIs must retrieve it.

---

### Task 1: Local Media Store

**Files:**
- Create: `server/media/local-media-store.js`
- Create: `tests/local-media-store.test.js`

**Interfaces:**
- Produces: `createLocalMediaStore({ rootDirectory, publicBaseUrl, maxBytes })`
- Returned methods: `initialize()`, `save(readable, { contentType })`, `open(key)`
- `save()` metadata: `{ key, type, contentType, size, url, isHttps }`
- `open()` result: `{ key, stream, contentType, size }`

- [ ] **Step 1: Write failing store tests**

Create tests using `Readable.from()`, `mkdtemp()`, and temporary directories. Assert:

```js
const store = createLocalMediaStore({
  rootDirectory,
  publicBaseUrl: 'https://srocial.test',
  maxBytes: 8
});
await store.initialize();
const upload = await store.save(Readable.from([Buffer.from('jpeg')]), {
  contentType: 'image/jpeg'
});
assert.match(upload.key, /^[0-9a-f-]{36}\.jpg$/);
assert.equal(upload.url, `https://srocial.test/media/${upload.key}`);
assert.equal(upload.type, 'image');
assert.equal(upload.isHttps, true);
```

Also assert unsupported MIME throws `UNSUPPORTED_MEDIA_TYPE`, empty body throws `EMPTY_MEDIA`, overflow throws `MEDIA_TOO_LARGE` and leaves the upload directory empty, valid `open()` returns correct bytes, malformed `../x.jpg` throws `MEDIA_NOT_FOUND`, and missing generated-style key throws `MEDIA_NOT_FOUND`.

- [ ] **Step 2: Run the store test and verify RED**

Run in CI or local checkout:

```bash
node --test tests/local-media-store.test.js
```

Expected: failure because `server/media/local-media-store.js` does not exist.

- [ ] **Step 3: Implement minimal streamed store**

Use this exact trusted mapping:

```js
const MEDIA_TYPES = Object.freeze({
  'image/jpeg': { extension: '.jpg', type: 'image' },
  'image/png': { extension: '.png', type: 'image' },
  'image/webp': { extension: '.webp', type: 'image' },
  'video/mp4': { extension: '.mp4', type: 'video' }
});
```

Generate `${randomUUID()}${extension}`. Create the root directory recursively. Stream chunks through a writable file handle/stream while incrementing byte count. On zero bytes or overflow, destroy/close and `rm()` the partial path. Convert all externally visible failures to store error codes without returning filesystem paths.

`open(key)` must validate a generated-key regex before `join()`:

```js
/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|mp4)$/i
```

Map extension back to trusted MIME and return a `createReadStream()` plus `stat.size`.

- [ ] **Step 4: Run the store tests and require green**

```bash
node --test tests/local-media-store.test.js
```

Expected: all store tests pass.

---

### Task 2: Upload and Asset HTTP Routes

**Files:**
- Modify: `server/app.js`
- Modify: `server/server.js`
- Modify: `.env.example`
- Create: `tests/media-upload-api.test.js`

**Interfaces:**
- `createRequestHandler({ ..., mediaStore = null })`
- `POST /api/media/uploads`
- `GET /media/:key`

- [ ] **Step 1: Write failing HTTP tests**

Start a temporary HTTP server with a real temporary local media store and assert:

```js
const response = await fetch(`${base}/api/media/uploads`, {
  method: 'POST',
  headers: { 'content-type': 'image/jpeg' },
  body: Buffer.from('jpeg-data')
});
assert.equal(response.status, 201);
const { upload } = await response.json();
assert.equal(upload.contentType, 'image/jpeg');
```

Then fetch `${base}/media/${upload.key}` and assert exact body bytes plus:

```text
content-type: image/jpeg
x-content-type-options: nosniff
cache-control: public, max-age=31536000, immutable
```

Also assert unsupported MIME -> `415 {error:'unsupported_media_type'}`, overflow -> `413 {error:'media_too_large'}`, empty body -> `400 {error:'empty_media'}`, missing/malformed media key -> `404`.

- [ ] **Step 2: Run HTTP tests and verify RED**

```bash
node --test tests/media-upload-api.test.js
```

Expected: routes return not-found/method-not-allowed because V8 routing is absent.

- [ ] **Step 3: Implement HTTP mapping**

In `server/app.js`, before the generic method/static fallback:

```js
if (request.method === 'POST' && url.pathname === '/api/media/uploads') { ... }
const mediaMatch = url.pathname.match(/^\/media\/([^/]+)$/);
if ((request.method === 'GET' || request.method === 'HEAD') && mediaMatch) { ... }
```

Map store codes exactly:

```text
UNSUPPORTED_MEDIA_TYPE -> 415 unsupported_media_type
EMPTY_MEDIA            -> 400 empty_media
MEDIA_TOO_LARGE        -> 413 media_too_large
MEDIA_NOT_FOUND        -> 404 not_found
```

Unknown store failures remain `500 internal_error` through the existing outer handler. Do not include filesystem paths/errors in responses.

For GET/HEAD set trusted content headers; for HEAD do not pipe a body.

- [ ] **Step 4: Compose store at startup**

In `server/server.js`:

```js
const mediaStore = createLocalMediaStore({
  rootDirectory: process.env.MEDIA_UPLOAD_DIR ?? './data/uploads',
  publicBaseUrl,
  maxBytes: Number.parseInt(process.env.MEDIA_UPLOAD_MAX_BYTES ?? '52428800', 10)
});
await mediaStore.initialize();
```

Pass `mediaStore` into `createRequestHandler()`.

In `.env.example` add:

```text
MEDIA_UPLOAD_DIR=./data/uploads
MEDIA_UPLOAD_MAX_BYTES=52428800
```

- [ ] **Step 5: Run HTTP + existing server tests**

```bash
node --test tests/media-upload-api.test.js tests/server.test.js tests/accounts-oauth-api.test.js tests/posts-api.test.js
```

Expected: zero failures.

---

### Task 3: Browser Upload API and Composer Integration

**Files:**
- Create: `client/js/api/media-api.js`
- Modify: `client/js/pages/composer.js`
- Modify: `client/index.html`
- Modify: `client/css/pages/composer.css`
- Create: `tests/media-upload-client.test.js`

**Interfaces:**
- `uploadMedia(file)` -> upload JSON payload.
- Pure helper `describeUploadedMedia(upload)` -> `{ url, type, message, state }`.

- [ ] **Step 1: Write failing pure helper tests**

Assert an HTTPS upload maps to:

```js
{
  url: 'https://srocial.test/media/id.jpg',
  type: 'image',
  state: 'success',
  message: 'Media uploaded.'
}
```

Assert HTTP upload maps to the same URL/type with `state:'warning'` and a message containing `public HTTPS`.

- [ ] **Step 2: Verify helper test is RED**

```bash
node --test tests/media-upload-client.test.js
```

Expected: missing `media-api.js` / helper implementation.

- [ ] **Step 3: Implement binary client API**

`client/js/api/media-api.js`:

```js
import { requestJson } from './client.js';
export function uploadMedia(file) {
  return requestJson('/api/media/uploads', {
    method: 'POST',
    headers: { 'content-type': file.type },
    body: file
  });
}
```

Do not set multipart boundaries or serialize the file.

- [ ] **Step 4: Add composer controls**

In `client/index.html`, add a file input and explicit Upload button near the existing media URL controls:

```html
<input id="media-file" type="file" accept="image/jpeg,image/png,image/webp,video/mp4">
<button id="upload-media" type="button" class="button button--secondary">Upload file</button>
<p id="media-upload-feedback" class="form-feedback" aria-live="polite"></p>
```

Keep the existing media URL and media type controls.

- [ ] **Step 5: Wire upload behavior in composer**

On Upload click:

1. require a selected file;
2. disable button and display `Uploading…`;
3. call `uploadMedia(file)`;
4. call `describeUploadedMedia(result.upload)`;
5. set `#media-url.value` and `#media-type.value`;
6. show helper message/state;
7. re-enable button in `finally` unless navigation/unload occurs.

Manual media URL entry must still work exactly as before.

- [ ] **Step 6: Add page CSS only for upload layout**

Use existing spacing tokens and button/form components. No inline styles and no `!important`.

- [ ] **Step 7: Run client/composer tests and syntax checks**

```bash
node --test tests/media-upload-client.test.js tests/composer-payload.test.js
find client/js -name '*.js' -print0 | xargs -0 -n1 node --check
```

Expected: zero failures.

---

### Task 4: Documentation, Full Verification, Review, Merge

**Files:**
- Modify: `README.md`
- Modify: `HOW_TO_RUN.md`

- [ ] **Step 1: Update documentation**

Document:

- direct file upload supports JPEG/PNG/WebP/MP4;
- default 50 MiB limit and configurable environment variables;
- local files live under `data/uploads/`;
- assets are public-by-URL;
- local HTTP uploads are not provider-publishable until `PUBLIC_BASE_URL` is public HTTPS;
- manual media URL entry remains supported;
- future R2/S3 can replace the local store through the storage boundary.

- [ ] **Step 2: Run complete GitHub Actions verification**

Require both CI steps green on the final feature-branch head:

```bash
npm test
find server client tests -name '*.js' -print0 | xargs -0 -n1 node --check
```

- [ ] **Step 3: Security/diff review**

Compare V8 against `main` and verify:

- original filename never becomes a disk path;
- no traversal input reaches filesystem joins;
- SVG/HTML are rejected;
- partial files are removed on oversize/failure;
- response errors do not contain filesystem paths;
- served content has `nosniff`;
- HTTPS scheduling validation remains unchanged;
- no OAuth/token code changed unnecessarily.

- [ ] **Step 4: PR and merge**

Open a PR from `build/direct-media-upload-v8` to `main`, require PR CI green, then squash-merge using the exact expected feature head SHA under the user's standing merge-without-ask instruction.

- [ ] **Step 5: Verify main**

Confirm `refs/heads/main` equals the merge SHA and the resulting `main` push CI has successful test and JavaScript syntax steps.
