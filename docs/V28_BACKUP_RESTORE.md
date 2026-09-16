# V28 — Portable Backup & Restore

V28 closes source roadmap items **#14 Backup command** and **#15 Restore command** from the V10 production-repository block.

## Scope

V28 adds maintenance-only backup and restore commands for both supported database backends and both supported media backends. The maintenance path does not start the HTTP server, scheduler, provider adapters, or WhatsApp worker.

```bash
npm run backup -- --output ./backups/srocial-2026-09-16
npm run restore -- --input ./backups/srocial-2026-09-16
npm run restore -- --input ./backups/srocial-2026-09-16 --force
```

The commands use the same environment configuration as the selected deployment:

```text
DATABASE_DRIVER=json|postgres
DATA_FILE=./data/srocial.json
DATABASE_URL=postgres://...
MEDIA_STORAGE_DRIVER=local|s3
```

Local/S3 media settings remain the same settings used by the normal media store.

## Backup format

A backup is a directory with a versioned, secret-free manifest:

```text
<backup>/
|- manifest.json
|- database.json
`- media/
   `- <exact generated media keys>
```

`manifest.json` records:

- `format: "srocial-backup"`;
- format version `1`;
- creation timestamp;
- database driver, logical snapshot file, SHA-256 checksum, and migration metadata;
- media driver and one record per asset with exact key, content type, size, and SHA-256 checksum.

Environment secrets, database URLs, object-storage credentials, provider credentials, session secrets, and encryption keys are not copied into the manifest.

## Database backup semantics

### JSON

The JSON backend exports normalized persisted state to `database.json`.

Restore validates the backup driver and expected collections before replacing the configured JSON data file. Replacement is atomic at the target-file level.

### PostgreSQL

PostgreSQL export uses one **repeatable-read, read-only transaction** so migration metadata and all backed-up tables come from one consistent logical snapshot.

Restore:

1. starts one database transaction;
2. verifies the target migration names/checksums against the backup before destructive work;
3. validates whether the target is empty unless `--force` is present;
4. deletes persisted application tables in reverse dependency order when replacement is required;
5. inserts backed-up rows in forward dependency order;
6. clears transient `rate_limit_buckets` instead of restoring stale throttling state;
7. commits only after the complete restore succeeds.

`rate_limit_buckets` is deliberately excluded from the logical backup because it is transient operational state rather than durable application content.

## Media backup semantics

Local and S3-compatible stores expose an exact-key restore primitive used only by maintenance recovery.

Backup streams every managed media asset into the backup `media/` directory and records its exact key, trusted content type, byte size, and SHA-256 checksum.

Restore preserves the exact generated media key. Media bytes are signature-validated by the existing media-format rules before being accepted by the destination store.

## Fail-closed restore rules

Restore validates the complete backup before mutating the target:

- manifest format/version;
- database checksum;
- exact media-file set;
- media byte sizes;
- every media SHA-256 checksum;
- database backend compatibility;
- media backend compatibility;
- PostgreSQL migration compatibility.

By default, restore refuses a non-empty database or media store. Replacing existing application state requires explicit `--force`.

`--force` is destructive. It is intended for deliberate disaster recovery or environment replacement, not for merging one Srocial instance into another.

## Operational procedure

For a production recovery:

1. stop Srocial application instances that use the target database/media store;
2. configure the shell/process environment for the intended target backend;
3. run `npm run restore -- --input <backup>` for an empty target, or add `--force` only when intentional replacement is required;
4. start Srocial normally;
5. verify `/api/health`, authentication, media retrieval, Queue/Calendar state, and provider account state before re-enabling real execution gates.

For PostgreSQL, run the repository's migrations on a new/empty database before restoring so the target schema and migration checksums match the backup contract.

## Verification

V28 was developed test-first and includes:

- exact-key local/S3 media restore tests;
- JSON backup/restore validation and round-trip tests;
- checksum-before-mutation corruption tests;
- strict CLI argument tests;
- PostgreSQL fixed-table logical export tests;
- repeatable-read snapshot enforcement;
- migration-mismatch rollback tests;
- reverse-delete/forward-insert transaction tests;
- transient rate-limit reset tests;
- a real PostgreSQL 17 typed-row backup → destructive mutation → restore integration test.

PR run `35081145319` passed PostgreSQL migrations `001–010`, **480/480 Node tests**, JavaScript syntax verification, and **14/14 real Chrome/CDP E2E scenarios**.

## Non-goals

V28 does not:

- schedule automatic recurring backups;
- upload backup archives to a remote backup service;
- encrypt backup files itself;
- merge two independent Srocial datasets;
- restore provider-side content already published outside Srocial;
- replace normal infrastructure/database backup policy.

Operators should protect backup directories using filesystem/object-storage access controls and, where required, encryption at rest provided by the deployment environment.
