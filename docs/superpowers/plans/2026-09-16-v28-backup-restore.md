# V28 Backup & Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement source roadmap items #14 Backup command and #15 Restore command for Srocial's JSON/PostgreSQL persistence and local/S3 media while preserving exact media keys and failing closed on unsafe restores.

**Architecture:** Add maintenance-only repository snapshot methods, exact-key media restore primitives, and a dependency-free versioned backup-directory orchestrator. The CLI constructs only repository/media-store infrastructure, never the HTTP server, scheduler, provider adapters, or messaging workers.

**Tech Stack:** Node.js >= 20 built-ins, existing `pg` dependency, existing media-store abstractions, Node test runner, GitHub Actions PostgreSQL 17 + Chrome gate.

**Spec:** `docs/superpowers/specs/2026-09-16-v28-backup-restore-design.md`

## Global Constraints

- No new npm dependency.
- No provider API call, scheduler start, or HTTP server start from backup/restore commands.
- Backup manifest must contain no environment secret values or connection strings.
- Restore validates the entire backup before mutation.
- Restore refuses a non-empty database or media store unless `--force` is explicit.
- Database driver and media driver must match the backup manifest.
- PostgreSQL migration names/checksums must match before restore.
- `rate_limit_buckets` are not backed up or restored.
- Exact media keys must be preserved.
- Existing deterministic, migration, syntax, and Chrome E2E gates remain green.

---

### Task 1: Exact-key media restore primitive

**Files:**
- Modify: `server/media/local-media-store.js`
- Modify: `server/media/s3-media-store.js`
- Test: `tests/local-media-store.test.js`
- Test: `tests/s3-media-store.test.js`

**Interfaces:**
- Produces: `mediaStore.restore(key, readable, { contentType }) -> Promise<{ key, type, contentType, size, url, isHttps }>`
- Consumes: existing `mediaMetadataFromKey`, signature-validation iterable, size/quota rules.

- [ ] Add failing local-store tests asserting exact key preservation, valid content signature, duplicate-key refusal/overwrite semantics used by restore orchestration, and quota enforcement.
- [ ] Add failing S3-store tests asserting the supplied key becomes the object key, `PUT` carries the normalized content type/length/hash, and invalid media is rejected before request.
- [ ] Implement the smallest exact-key restore method in each media store while reusing existing media validation and quota code.
- [ ] Run focused media-store tests and confirm GREEN.
- [ ] Commit `feat: add exact-key media restore primitive`.

### Task 2: Repository backup snapshot contract — JSON

**Files:**
- Modify: `server/db/json-repository.js`
- Test: `tests/json-backup.test.js`

**Interfaces:**
- Produces: `repository.exportBackupSnapshot()` and `repository.restoreBackupSnapshot(snapshot, { force })`.
- Snapshot shape: `{ driver: 'json', migrations: [], data: <normalized JSON repository state> }`.

- [ ] Write RED tests that seed representative records, export complete normalized state, mutate target state, refuse non-empty restore without force, and force-restore exactly.
- [ ] Add validation tests for wrong driver/invalid collection shape.
- [ ] Implement export after `writeChain` settles and restore through atomic temporary-file persistence.
- [ ] Run focused JSON backup tests and existing JSON repository tests.
- [ ] Commit `feat: add JSON repository backup snapshots`.

### Task 3: Repository backup snapshot contract — PostgreSQL

**Files:**
- Create: `server/db/postgres-backup.js`
- Modify: `server/db/postgres-repository.js`
- Test: `tests/postgres-backup.test.js`

**Interfaces:**
- Produces from `createPostgresBackup(database)`: `exportBackupSnapshot()` and `restoreBackupSnapshot(snapshot, { force })`.
- Fixed dependency-ordered data-table list covers current Srocial application tables, excludes `srocial_migrations` from restored data, and excludes `rate_limit_buckets` entirely.

- [ ] Write RED fake-pool tests for deterministic table export + migration metadata.
- [ ] Write RED tests for migration mismatch, non-empty refusal, reverse-order forced deletes, dependency-order inserts, commit, and rollback on one-table failure.
- [ ] Implement export using `SELECT to_jsonb(t) AS row FROM <known table> t`, sorting rows deterministically in JavaScript.
- [ ] Implement restore in one database transaction; compare `srocial_migrations`; use `DELETE` in reverse table order and typed `jsonb_populate_recordset(NULL::<table>, $1::jsonb)` inserts in forward order.
- [ ] Wire the module into `createPostgresRepository`.
- [ ] Run focused tests plus existing PostgreSQL repository tests.
- [ ] Commit `feat: add PostgreSQL logical backup snapshots`.

### Task 4: Versioned backup format and validation

**Files:**
- Create: `server/maintenance/backup-format.js`
- Test: `tests/backup-format.test.js`

**Interfaces:**
- Produces: SHA-256 file/stream helpers; `writeManifest`; `readAndValidateManifest`; safe media-key validation; database/media checksum verification helpers.
- Manifest format: `format='srocial-backup'`, `version=1` as defined in the spec.

- [ ] Write RED tests for valid manifest, unsupported version, unsafe/path-traversal media keys, driver fields, database hash mismatch, media size/hash mismatch, and extra/missing media files.
- [ ] Implement strict validation with stable error codes from the spec.
- [ ] Ensure manifest serialization contains only passed safe metadata and never reads environment variables.
- [ ] Run focused tests.
- [ ] Commit `feat: add versioned backup format validation`.

### Task 5: Backup orchestration

**Files:**
- Create: `server/maintenance/create-backup.js`
- Test: `tests/create-backup.test.js`

**Interfaces:**
- Produces: `createBackup({ outputDirectory, repository, databaseDriver, mediaStore, mediaDriver, now })`.

- [ ] Write RED test using a fake repository/media store: existing output refusal, temp-directory behavior, streamed media files, deterministic sorted manifest, database hash, per-media hash/size.
- [ ] Write RED cleanup test for a media read failure: final output absent and partial directory removed best-effort.
- [ ] Implement temporary sibling directory creation, `database.json`, streamed media backup, manifest-last write, and atomic rename.
- [ ] Run focused tests.
- [ ] Commit `feat: create complete Srocial backups`.

### Task 6: Restore orchestration

**Files:**
- Create: `server/maintenance/restore-backup.js`
- Test: `tests/restore-backup.test.js`
- Test: `tests/backup-restore-roundtrip.test.js`

**Interfaces:**
- Produces: `restoreBackup({ inputDirectory, repository, databaseDriver, mediaStore, mediaDriver, force })`.

- [ ] Write RED tests proving all manifest/database/media checks run before repository/media mutation.
- [ ] Write RED tests for database-driver mismatch, media-driver mismatch, non-empty DB/media refusal without force, force media cleanup, exact-key restore, and propagation of backend restore errors.
- [ ] Add a JSON + local-media round-trip test: backup known state/assets, deliberately alter target, force restore, then assert exact recovered data and bytes.
- [ ] Implement preflight validation, target emptiness checks, forced media cleanup, exact-key media restore, and repository restore call.
- [ ] Run focused tests.
- [ ] Commit `feat: restore validated Srocial backups`.

### Task 7: Operator CLI and package scripts

**Files:**
- Create: `server/maintenance/cli-args.js`
- Create: `server/maintenance/backup-cli.js`
- Create: `server/maintenance/restore-cli.js`
- Modify: `package.json`
- Test: `tests/maintenance-cli.test.js`

**Interfaces:**
- `npm run backup -- --output <directory>`
- `npm run restore -- --input <directory> [--force]`

- [ ] Write RED argument-parser tests for required input/output, unknown flags, duplicate values, and boolean `--force`.
- [ ] Implement dependency-free parser with stable error codes.
- [ ] Implement CLIs that construct repository/media store from current environment, initialize/close them safely, invoke orchestration, print a concise success path/count, and on expected failure print only the error code then set non-zero exit status.
- [ ] Add package scripts.
- [ ] Verify CLI modules contain no server/scheduler/provider imports.
- [ ] Run focused tests.
- [ ] Commit `feat: add backup and restore CLI commands`.

### Task 8: Documentation, source-roadmap correction, and full verification

**Files:**
- Create: `docs/V28_BACKUP_RESTORE.md`
- Modify: `README.md`
- Modify: `HOW_TO_RUN.md`
- Review: `PROBLEMS.md`

**Interfaces:**
- Documents backup sensitivity, supported drivers, exact commands, empty-target default, `--force` risk, schema/driver matching, and restore verification.

- [ ] Document operator backup/restore procedure and limitations.
- [ ] Correct README Development Direction: item #100 is the final numbered source feature, but source items #14/#15 were still outstanding and V28 closes them; future work must audit remaining source items rather than inventing #101.
- [ ] Review `PROBLEMS.md`; add only genuinely unresolved V28 gaps. If none remain, do not create a fake problem entry.
- [ ] Run full CI-equivalent gate: PostgreSQL migrations, all Node tests, JavaScript syntax, Chrome E2E.
- [ ] Review final diff for secrets, unsafe paths, provider/scheduler coupling, and accidental unrelated changes.
- [ ] Open PR, verify exact-final-head CI, review threads, squash-merge with expected head SHA, then verify the push workflow on exact merged `main` SHA.
