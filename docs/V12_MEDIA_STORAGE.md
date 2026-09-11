# V12 Media Storage Hardening

V12 adds a storage abstraction for uploaded media while preserving local filesystem storage as the default. It also strengthens upload validation and adds optional orphan-media retention cleanup.

## Storage drivers

`MEDIA_STORAGE_DRIVER` selects the implementation:

```text
MEDIA_STORAGE_DRIVER=local
```

Supported values:

- `local` — default. Uses `MEDIA_UPLOAD_DIR` and serves media through Srocial at `/media/:key`.
- `s3` — S3-compatible object storage using AWS Signature Version 4 and path-style requests.

The common store contract supports initialization, upload/save, listing, aggregate usage, open, delete, and URL-to-key mapping. Media-library routes and reference protection therefore do not depend on the active storage backend.

## Upload validation

Supported upload types remain:

```text
image/jpeg
image/png
image/webp
video/mp4
```

V12 no longer trusts the declared `Content-Type` alone. Uploaded bytes are inspected for a matching JPEG, PNG, WebP, or MP4 signature before the asset is accepted. Unsupported media returns HTTP 415. A supported declared MIME whose bytes are malformed or belong to another supported type also returns a sanitized HTTP 415 response.

Per-file and aggregate storage quotas remain controlled by:

```text
MEDIA_UPLOAD_MAX_BYTES=52428800
MEDIA_UPLOAD_TOTAL_MAX_BYTES=5368709120
```

## S3-compatible configuration

Example:

```text
MEDIA_STORAGE_DRIVER=s3
MEDIA_S3_ENDPOINT=https://objects.example.com
MEDIA_S3_REGION=auto
MEDIA_S3_BUCKET=srocial
MEDIA_S3_ACCESS_KEY_ID=<server-only-access-key>
MEDIA_S3_SECRET_ACCESS_KEY=<server-only-secret>
MEDIA_S3_PREFIX=media/
MEDIA_PUBLIC_BASE_URL=https://cdn.example.com/media
```

Required S3 values fail closed when missing or blank. `MEDIA_S3_ENDPOINT` must use HTTPS except for explicit loopback development endpoints such as `http://127.0.0.1:9000` or `http://localhost:9000`.

Signed object-store requests use AWS Signature Version 4. Credentials are placed only in signed headers, never in request URLs. Redirect following is disabled for signed S3 requests so authorization headers cannot be automatically forwarded to a redirected host.

`MEDIA_PUBLIC_BASE_URL` is the public URL prefix returned to the composer/provider layer. It should be HTTPS for real social-provider publishing.

## Orphan retention cleanup

Automatic cleanup is opt-in:

```text
MEDIA_ORPHAN_CLEANUP_ENABLED=false
MEDIA_ORPHAN_RETENTION_MS=2592000000
MEDIA_ORPHAN_CLEANUP_INTERVAL_MS=21600000
MEDIA_ORPHAN_CLEANUP_MAX_DELETES=100
```

Defaults when enabled:

- retention age: 30 days;
- cleanup interval: 6 hours;
- maximum deletions per pass: 100.

Cleanup deletes only assets that are older than the retention cutoff and are not referenced by persisted post media. Referenced assets, young assets, and assets with missing/invalid modification timestamps are retained. Eligible assets are removed oldest-first and the configured batch limit is enforced.

The maintenance loop does not overlap with itself. It is independent of `ALLOW_REAL_PUBLISH` and `SCHEDULER_ENABLED`, and stops during normal process shutdown. Storage failures are logged only with sanitized internal error codes.

## Local development

Existing local setups require no change because `local` remains the default driver:

```text
MEDIA_STORAGE_DRIVER=local
MEDIA_UPLOAD_DIR=./data/uploads
PUBLIC_BASE_URL=http://127.0.0.1:3000
```

Local media continues to be available through Srocial's `/media/:key` route.

## Security notes

- Keep S3 credentials server-side and out of browser code, API payloads, logs, and Git history.
- Use HTTPS for production object-store endpoints and the public media URL.
- Signature inspection is format validation, not antivirus/malware scanning.
- Provider-accessible media is intentionally public by URL; management operations remain protected by Srocial application authentication when enabled.
