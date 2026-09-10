# Direct Media Upload V8 Design

## Goal

Let a Srocial user choose an image or video file in the browser, upload it directly to Srocial, and reuse the resulting public media URL in the existing account-bound scheduling flow without changing the post/publication contract.

## Chosen Approach

V8 adds a dependency-free streamed upload endpoint backed by a storage abstraction. The first implementation is a local filesystem store under `data/uploads/`; later S3/R2 storage can implement the same interface without changing the composer or scheduling service.

Alternatives rejected for V8:

1. **Multipart parsing library** — convenient, but introduces a runtime dependency only to move one binary body.
2. **Direct browser-to-R2/S3 presigned upload** — production-friendly, but requires cloud credentials/configuration and a second upload flow before the self-hosted development path exists.
3. **Selected: raw binary upload to Srocial** — keeps the runtime dependency-free, streams instead of buffering videos, and centralizes validation/storage policy server-side.

## Upload API

```http
POST /api/media/uploads
Content-Type: image/jpeg | image/png | image/webp | video/mp4
Content-Length: <optional>

<raw file bytes>
```

A successful upload returns `201`:

```json
{
  "upload": {
    "key": "5e8c...uuid....jpg",
    "type": "image",
    "contentType": "image/jpeg",
    "size": 12345,
    "url": "https://srocial.example.com/media/5e8c...uuid....jpg",
    "isHttps": true
  }
}
```

The original browser filename is not used as the storage path. V8 does not require or persist it.

### Allowed media

Exact allowlist:

```text
image/jpeg -> image -> .jpg
image/png  -> image -> .png
image/webp -> image -> .webp
video/mp4  -> video -> .mp4
```

SVG, HTML, JavaScript, arbitrary binary files, and unknown MIME types are rejected with `415 unsupported_media_type`.

Empty uploads are rejected with `400 empty_media`.

Uploads larger than `MEDIA_UPLOAD_MAX_BYTES` are rejected with `413 media_too_large`. The default is 50 MiB (`52428800`). Any partially written file is deleted on overflow or stream/write failure.

## Storage Interface

`server/media/local-media-store.js` exports:

```js
createLocalMediaStore({ rootDirectory, publicBaseUrl, maxBytes })
```

Returned store exposes:

```js
await store.initialize()
await store.save(requestStream, { contentType })
await store.open(key)
```

`save()` returns safe metadata:

```js
{
  key,
  type,
  contentType,
  size,
  url,
  isHttps
}
```

`open(key)` returns:

```js
{
  stream,
  contentType,
  size,
  key
}
```

The store accepts only its generated key syntax and trusted extension map. It never joins an arbitrary user path directly onto the upload directory.

## Filesystem Layout

Default local storage:

```text
data/uploads/
  <uuid>.jpg
  <uuid>.png
  <uuid>.webp
  <uuid>.mp4
```

Generated names are immutable. Overwrite is not part of V8.

## Media Serving

```http
GET /media/:key
```

A valid stored asset returns:

```text
Content-Type: trusted mapped MIME
Content-Length: exact file size
Cache-Control: public, max-age=31536000, immutable
X-Content-Type-Options: nosniff
```

Missing, malformed, traversal-like, or unsupported keys return `404`.

The serving path does not expose directory listings or arbitrary files under `data/`.

## HTTPS / Provider Publishing Constraint

The existing post-service HTTPS validation remains unchanged.

If `PUBLIC_BASE_URL` is HTTP, for example:

```text
http://127.0.0.1:3000
```

Srocial can store and serve the uploaded file for local development, but the resulting URL is not accepted as provider media by the existing scheduling contract. The upload response therefore exposes:

```json
{ "isHttps": false }
```

The browser must warn the user that a public HTTPS Srocial URL is required before the media can be scheduled for a provider such as Instagram.

When deployed with:

```text
PUBLIC_BASE_URL=https://srocial.example.com
```

the returned media URL is HTTPS and can enter the existing scheduling flow, subject to the provider adapter's own validation/reachability requirements.

## Server Composition

`server/server.js` creates one media store using:

```text
MEDIA_UPLOAD_DIR=./data/uploads
MEDIA_UPLOAD_MAX_BYTES=52428800
PUBLIC_BASE_URL=<existing value>
```

It initializes the store before listening and passes it into `createRequestHandler()`.

`server/app.js` owns HTTP routing only:

- POST upload -> `mediaStore.save(request, { contentType })`
- GET asset -> `mediaStore.open(key)` then pipe stream to response
- maps storage errors to safe HTTP codes

Storage implementation details remain outside `server/app.js`.

## Browser Integration

Add `client/js/api/media-api.js`:

```js
uploadMedia(file)
```

It sends the `File` as the raw request body with `Content-Type: file.type` and receives safe JSON metadata.

The composer keeps the existing manual media URL/type controls for backward compatibility and adds:

```text
Choose file [file input]
[Upload file]
<upload feedback>
```

After a successful HTTPS upload:

1. set `media-url` to `upload.url`;
2. set `media-type` to `upload.type`;
3. show upload success;
4. scheduling proceeds through the existing `buildComposerPayload()` and `POST /api/posts` contract.

After a successful non-HTTPS upload:

1. retain the uploaded URL so the user can see the local asset;
2. set media type;
3. show a warning that Srocial must use a public HTTPS `PUBLIC_BASE_URL` before provider scheduling;
4. do not weaken post-service validation.

The upload button is disabled while an upload is in flight.

## Security

- Never use the original filename as a disk path.
- Generate keys with `crypto.randomUUID()`.
- Accept only the four exact MIME types above.
- Do not accept SVG or HTML.
- Enforce size while streaming, not after full buffering.
- Delete partial files on rejection/failure.
- Reject malformed/traversal-like asset keys before touching the filesystem.
- Serve with `X-Content-Type-Options: nosniff`.
- Do not expose filesystem paths in API responses or errors.
- Uploaded assets are public by URL because provider APIs must fetch them. Srocial has no user-authentication subsystem yet; V8 documents this explicitly.
- Existing token/OAuth boundaries are unchanged.

## Testing

### Store tests

`tests/local-media-store.test.js` covers:

- accepted JPEG save with UUID key and public URL;
- supported MIME-to-extension/type mapping;
- unsupported MIME rejection;
- empty upload rejection;
- max-size rejection with no partial file left behind;
- valid asset open;
- malformed/traversal key rejection;
- missing asset handling.

### HTTP tests

`tests/media-upload-api.test.js` covers:

- valid raw upload returns `201` safe metadata;
- unsupported MIME returns `415`;
- oversized upload returns `413`;
- uploaded asset can be fetched with trusted headers and exact bytes;
- missing/traversal-like asset paths return `404`;
- repository/OAuth/post APIs remain unaffected.

### Client tests

`tests/media-upload-client.test.js` covers pure helper behavior used to apply an upload result to composer state, especially HTTPS versus non-HTTPS messaging.

Finally, the complete repository `npm test` suite and JavaScript syntax sweep must pass in GitHub Actions before merge.
