# V12 Media Storage Hardening Design

## Goal

Implement the first V11 roadmap priority without changing the existing dashboard/media API contract: add a storage-driver boundary with local and S3-compatible backends, validate uploaded file signatures rather than trusting declared MIME alone, and provide automatic orphan-retention cleanup through the scheduler subsystem.

## Scope

V12 includes:

- `MEDIA_STORAGE_DRIVER=local|s3`, default `local`;
- a media-store factory so `server/server.js` no longer constructs local storage directly;
- the existing local store behind the same interface;
- an S3-compatible path-style object-store implementation using Node built-ins and AWS Signature Version 4;
- shared JPEG/PNG/WebP/MP4 magic-byte validation;
- a store-level `keyFromUrl(url)` operation so media-reference protection works for both `/media/:key` URLs and object-storage public URLs;
- opt-in automatic orphan cleanup with retention age, interval, and bounded deletions per pass;
- documentation, environment examples, and tests.

V12 does not add image/video transformations, multipart S3 uploads, malware scanning, signed CDN URLs, provider-specific media rules, or a media metadata database table.

## Media Store Contract

Both drivers expose:

```js
{
  initialize(): Promise<void>,
  save(readable, { contentType }): Promise<UploadMetadata>,
  list(): Promise<AssetMetadata[]>,
  usage(): Promise<UsageMetadata>,
  remove(key): Promise<void>,
  open(key): Promise<{ key, stream, contentType, size }>,
  keyFromUrl(url): string | null
}
```

`UploadMetadata` keeps the existing shape: `key`, `type`, `contentType`, `size`, `url`, `isHttps`.

## File Signature Validation

Declared MIME remains an allowlist gate, but bytes must also match the selected MIME before storage begins.

Accepted signatures:

- JPEG: `FF D8 FF`;
- PNG: `89 50 4E 47 0D 0A 1A 0A`;
- WebP: `RIFF....WEBP`;
- MP4: ISO BMFF first box with `ftyp` at bytes 4-7.

A declared/actual mismatch fails with `MEDIA_SIGNATURE_MISMATCH`. Too-short or malformed bytes fail with `INVALID_MEDIA_SIGNATURE`. Unsupported declared MIME remains `UNSUPPORTED_MEDIA_TYPE`.

The validator buffers only the initial signature window, then replays those bytes into the store path. The local driver remains streaming. The S3 driver buffers one validated upload in memory up to `MEDIA_UPLOAD_MAX_BYTES` so it can send a deterministic content length and SHA-256 payload hash without adding an AWS SDK dependency.

## S3-Compatible Driver

Configuration:

```text
MEDIA_STORAGE_DRIVER=s3
MEDIA_S3_ENDPOINT=https://object.example.com
MEDIA_S3_REGION=auto
MEDIA_S3_BUCKET=srocial
MEDIA_S3_ACCESS_KEY_ID=
MEDIA_S3_SECRET_ACCESS_KEY=
MEDIA_S3_PREFIX=media/
MEDIA_PUBLIC_BASE_URL=https://cdn.example.com/media
```

The driver uses path-style S3 REST requests and AWS Signature Version 4. Credentials stay server-only. Object keys use the generated UUID filename below `MEDIA_S3_PREFIX`. The public URL uses `MEDIA_PUBLIC_BASE_URL/<key>` and is independent of the S3 API endpoint.

ListObjectsV2 is paginated and used for library listing/quota calculations. `open()` performs an authenticated GET so the legacy `/media/:key` proxy route continues to work, although new S3 uploads advertise the direct public object URL.

Non-2xx object-store responses map to sanitized media-store error codes; response bodies and credentials are never returned to clients or logs.

## Reference Protection

The media-library service must no longer parse `/media/:key` itself. It asks `mediaStore.keyFromUrl(record.url)` for each persisted media record. This keeps deletion/orphan protection correct when records use CDN/object-store URLs.

## Orphan Retention Cleanup

An orphan is a stored asset whose key is not referenced by any persisted media record.

Configuration:

```text
MEDIA_ORPHAN_CLEANUP_ENABLED=false
MEDIA_ORPHAN_RETENTION_MS=2592000000
MEDIA_ORPHAN_CLEANUP_INTERVAL_MS=21600000
MEDIA_ORPHAN_CLEANUP_MAX_DELETES=100
```

Defaults are conservative: disabled unless explicitly enabled, 30-day retention, 6-hour interval, maximum 100 deletions per pass.

The cleanup implementation belongs to the scheduler subsystem, not a provider cron. Each pass:

1. obtains stored assets and referenced keys;
2. ignores referenced assets;
3. ignores assets newer than the retention cutoff;
4. sorts eligible assets oldest first;
5. deletes at most `MEDIA_ORPHAN_CLEANUP_MAX_DELETES`;
6. logs only a summary count/error code.

The retention loop starts independently of real-publish gates because cleanup is maintenance, not provider publishing. It prevents overlapping cleanup executions and exposes `stop()` for graceful shutdown.

## Compatibility

- local storage remains the default;
- current HTTP routes and Media Library UI keep their public shapes;
- existing V11 auth rules remain unchanged;
- object-storage configuration is required only when `MEDIA_STORAGE_DRIVER=s3`;
- orphan cleanup is opt-in;
- no database migration is required.

## Testing

TDD coverage will include:

- valid/invalid magic-byte detection for all four formats;
- local-store rejection of MIME/signature mismatch without leaving files;
- storage factory selection and fail-closed S3 config validation;
- deterministic SigV4 request signing behavior with a fake S3 HTTP endpoint;
- S3 save/list/usage/open/remove and public URL mapping;
- `keyFromUrl` reference detection for local and S3 URLs;
- orphan cleanup retention/reference/batch-limit behavior;
- non-overlapping cleanup loop behavior and stop semantics;
- full existing PostgreSQL CI and JavaScript syntax verification.
