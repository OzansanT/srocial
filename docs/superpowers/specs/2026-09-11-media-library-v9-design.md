# V9 Media Library & Lifecycle Design

## Goal

Turn V8 uploads into manageable first-class assets without changing the existing post/media contract.

V9 adds a local media library, total-storage quota enforcement, safe deletion, and a dashboard Media section. Object storage, authentication, transformations, malware scanning, and automatic orphan cleanup remain out of scope for this version.

## Architecture

V9 preserves the existing storage abstraction. `createLocalMediaStore()` remains responsible for file-system operations and gains `list()`, `remove(key)`, and `usage()` methods plus a configurable total-byte quota. The HTTP layer exposes the library through dedicated media-library route helpers rather than placing repository rules directly inside `server/app.js`.

Deletion is reference-aware. Srocial lists persisted post media records through the repository and refuses to delete an uploaded asset whose `/media/:key` path is referenced by any post media URL. This protects scheduled and historical post records even if `PUBLIC_BASE_URL` later changes host names.

The browser gets a dedicated API module and Media page module. The Media page can preview assets, copy an asset URL, send an asset into the existing composer through an explicit callback, refresh usage, and request deletion. The composer exposes a small `useMedia(upload)` method rather than allowing the Media module to reach into unrelated form internals.

## API

### `GET /api/media`

Returns:

```json
{
  "assets": [
    {
      "key": "uuid.jpg",
      "type": "image",
      "contentType": "image/jpeg",
      "size": 12345,
      "url": "https://example.test/media/uuid.jpg",
      "isHttps": true,
      "referenced": false
    }
  ],
  "usage": {
    "usedBytes": 12345,
    "maxBytes": 5368709120,
    "remainingBytes": 5368696775,
    "count": 1
  }
}
```

Assets are sorted newest-first by file modification time, then key for deterministic ties. File-system paths are never returned.

### `DELETE /api/media/:key`

- `204` when an unreferenced asset is deleted.
- `404 {"error":"not_found"}` for unknown/invalid keys.
- `409 {"error":"media_in_use"}` when a persisted post media URL references the key.
- `503 {"error":"media_storage_unavailable"}` if media storage is not configured.

Deletion never removes post media records and never cascades into scheduled posts.

## Quota

Keep the existing per-upload limit (`MEDIA_UPLOAD_MAX_BYTES`). Add:

```text
MEDIA_UPLOAD_TOTAL_MAX_BYTES=5368709120
```

Default total quota is 5 GiB. Before accepting bytes, the local store measures current stored usage. During the streamed write it rejects the upload once `currentUsage + incomingBytes` would exceed the total quota. Failed/over-quota partial files are removed.

The error code is `MEDIA_STORAGE_QUOTA_EXCEEDED`, mapped to HTTP `507` and `{ "error": "media_storage_quota_exceeded" }`.

## Repository Contract

Add `listMedia()` to the repository contract. It returns all persisted post-media records as safe clones. V9 does not add a second metadata table for uploads because the local media store itself is authoritative for uploaded-file inventory.

## Browser UI

Add `#media` navigation and a Media Library panel containing:

- storage usage summary and progress bar;
- refresh button;
- responsive asset cards;
- image/video preview;
- type and human-readable file size;
- `Use in composer` action;
- `Copy URL` action;
- `Delete` action disabled/blocked for referenced assets;
- empty and error states through text nodes, not raw HTML interpolation.

`Use in composer` sets the composer's media type and URL and moves focus to the composer section. It does not schedule automatically.

## Security and Safety

- Keep generated-key validation for all file operations.
- Never expose disk paths.
- Never delete referenced assets.
- Preserve `nosniff` serving headers and immutable media caching.
- Keep provider tokens and OAuth behavior untouched.
- Do not add browser-local secrets or credentials.

## Testing

Add test-first coverage for:

1. store inventory/usage;
2. store deletion and invalid-key protection;
3. total quota rejection and partial-file cleanup;
4. repository `listMedia()`;
5. `GET /api/media` shape and reference marking;
6. safe deletion, including `409 media_in_use`;
7. client media-library API behavior;
8. static UI/module wiring smoke checks.

Full `npm test` and JavaScript syntax verification must pass before merge.
