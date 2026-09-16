# V28 Backup & Restore Design

## Context

The supplied Srocial feature source lists **#14 Backup command** and **#15 Restore command** as P0 operational features after the PostgreSQL production repository/migration work. Those commands are not present on `main` after V27.

V28 implements those two source-defined items without adding a second server, scheduler, database, media system, or external dependency.

## Goals

- Provide an operator CLI that creates a complete, versioned Srocial backup containing application persistence plus media.
- Support both current database drivers: JSON and PostgreSQL.
- Support both current media drivers: local filesystem and S3-compatible object storage.
- Preserve media keys exactly so persisted media URLs/references remain valid after restore.
- Validate a complete backup before changing the restore target.
- Refuse destructive restore by default.
- Never write environment secrets such as `DATABASE_URL`, S3 credentials, provider app secrets, `SESSION_SECRET`, or `TOKEN_ENCRYPTION_KEY` into the backup manifest.
- Keep server/scheduler/provider execution completely out of the maintenance path.

## Non-goals

- Cross-driver database conversion. A JSON backup restores to JSON; PostgreSQL restores to PostgreSQL.
- Point-in-time/WAL recovery.
- Incremental backups.
- Online zero-downtime restore.
- Encrypting the backup archive itself. Operators must protect backup storage because database rows can contain encrypted provider credentials, password hashes, session-token hashes, phone numbers, and other sensitive application data.
- Backing up transient PostgreSQL `rate_limit_buckets`; restored deployments should start with fresh rate-limit windows.

## Operator Interface

Add package scripts:

```text
npm run backup -- --output <directory>
npm run restore -- --input <directory>
npm run restore -- --input <directory> --force
```

`--output` and `--input` are required. Backup refuses an existing destination. Restore refuses a non-empty database or media store unless `--force` is explicitly present.

The commands use normal Srocial environment variables to locate the configured database and media store. They do not start the HTTP server or scheduler and never call provider APIs.

## Backup Format

A backup is a directory written through a temporary sibling directory and atomically renamed only after completion:

```text
<backup>/
|- manifest.json
|- database.json
`- media/
   |- <exact-media-key>
   `- ...
```

`manifest.json` format version 1 contains:

```json
{
  "format": "srocial-backup",
  "version": 1,
  "createdAt": "2026-09-16T00:00:00.000Z",
  "database": {
    "driver": "json|postgres",
    "file": "database.json",
    "sha256": "...",
    "migrations": []
  },
  "media": {
    "driver": "local|s3",
    "directory": "media",
    "assets": [
      {
        "key": "uuid.jpg",
        "contentType": "image/jpeg",
        "size": 123,
        "sha256": "..."
      }
    ]
  }
}
```

The manifest records driver identity but no connection strings, credentials, tokens, secrets, endpoints, buckets, or private environment values.

Media assets are sorted by key for deterministic manifests. Database snapshots use deterministic collection/table ordering.

## Database Snapshot Contract

Repositories gain maintenance-only methods:

```text
exportBackupSnapshot() -> Promise<{ driver, migrations, data }>
restoreBackupSnapshot(snapshot, { force }) -> Promise<void>
```

The methods are backend-specific internally but exposed through the existing repository object so the CLI does not know SQL or JSON storage details.

### JSON

The JSON repository exports its complete normalized in-memory state after queued writes settle. Restore validates the snapshot structure, checks whether any persisted collection is non-empty, and replaces the entire state through the repository's existing atomic temporary-file persistence mechanism.

### PostgreSQL

A focused `postgres-backup.js` module owns logical export/restore. It uses the repository pool and a fixed ordered list of Srocial data tables. `srocial_migrations` is exported as compatibility metadata, not restored as data. `rate_limit_buckets` is intentionally excluded.

Export reads each configured table into JSON-compatible rows and sorts the result deterministically.

Restore:

1. starts one PostgreSQL transaction;
2. compares backup migration names/checksums with the target's `srocial_migrations` rows and fails on mismatch;
3. checks all backed-up tables for existing rows and refuses them unless `force=true`;
4. for forced restore, deletes data in reverse foreign-key dependency order;
5. inserts snapshot rows in dependency order using PostgreSQL's typed `jsonb_populate_recordset` against each known table row type;
6. commits only after every table succeeds.

This makes database replacement atomic even when forced.

## Media Backup and Restore

Both media stores already expose `list()` and `open()`. V28 adds a maintenance-only exact-key restore operation:

```text
restore(key, readable, { contentType })
```

It validates the key/declared media type and applies the same content-signature, per-file size, and total-storage quota protections as normal upload, but preserves the supplied key instead of generating a new UUID.

Backup streams every media object to `<backup>/media/<key>` while calculating SHA-256 and verifying the observed byte count matches the media-store metadata.

Before restore mutates anything, V28 validates:

- manifest format/version;
- requested database/media drivers match the target environment;
- database snapshot SHA-256;
- every media filename/key is safe and matches the manifest;
- every media byte count and SHA-256;
- no unlisted file exists in the backup media directory.

Restore then checks target database/media emptiness. Without `--force`, either being non-empty aborts before mutation.

For media restore:

- empty-target restore writes exact keys directly;
- forced restore removes existing media, then writes exact backup keys;
- the operation is not represented as transactionally atomic across PostgreSQL + object storage because S3 has no shared transaction with PostgreSQL. Complete validation occurs first, and the non-destructive empty-target path remains the default.

## Failure Handling

Stable operator-facing error codes are used for expected failures, including:

```text
BACKUP_OUTPUT_REQUIRED
BACKUP_OUTPUT_EXISTS
BACKUP_FORMAT_INVALID
BACKUP_VERSION_UNSUPPORTED
BACKUP_DATABASE_DRIVER_MISMATCH
BACKUP_MEDIA_DRIVER_MISMATCH
BACKUP_DATABASE_CHECKSUM_MISMATCH
BACKUP_MEDIA_CHECKSUM_MISMATCH
BACKUP_MEDIA_SIZE_MISMATCH
BACKUP_MEDIA_SET_MISMATCH
BACKUP_MIGRATION_MISMATCH
RESTORE_TARGET_NOT_EMPTY
```

The CLI prints a concise error code and exits non-zero. It must not echo secrets or connection strings.

Incomplete backup temporary directories are cleaned up best-effort. A failed restore never starts Srocial runtime workers.

## Security

- Backup paths are resolved locally; media keys are validated and may not contain path separators/traversal.
- The manifest never includes secret environment variable values.
- Backups are treated as sensitive because persisted rows themselves contain private data and encrypted credentials.
- Restore refuses driver mismatch and schema/migration mismatch rather than guessing conversions.
- Real provider publishing/sending remains impossible because no scheduler, web server, provider adapter, or messaging worker is constructed by the maintenance CLI.

## Testing

Deterministic tests cover:

- manifest generation and secret exclusion;
- database/media checksum validation;
- existing-output refusal and temporary-directory cleanup;
- JSON full-state backup/restore and non-empty/force behavior;
- PostgreSQL table export, migration compatibility, empty-target refusal, forced reverse-delete/ordered-insert transaction behavior, and rollback on failure;
- local-media exact-key restore and content validation;
- S3 exact-key restore request behavior;
- complete backup -> destructive target change -> restore round trip using JSON + local media;
- CLI argument parsing/error behavior.

Existing PostgreSQL migration, deterministic Node, JavaScript syntax, and real Chrome E2E CI gates remain required. V28 itself adds no browser UI.

## Documentation / Roadmap

README is corrected to note that source item #100 was the last numbered item, but the earlier claim that no source-defined internal work remained was too strong: the source list still contains individual P0 operational items #14 and #15. V28 closes those two items. The next development must again be selected by auditing the remaining source feature list against the actual repository rather than inventing item 101.
