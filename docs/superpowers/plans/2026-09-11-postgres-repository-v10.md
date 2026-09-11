# PostgreSQL Production Repository V10 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate PostgreSQL as a production repository with transaction-safe scheduler claims, explicit migrations, database health, and CI integration while keeping JSON as the default backend.

**Architecture:** Preserve the existing repository interface and add a PostgreSQL implementation behind explicit `DATABASE_DRIVER` selection. Keep SQL confined to `server/db/`, run schema migrations only through `npm run db:migrate`, and verify concurrency against a real PostgreSQL service in GitHub Actions.

**Tech Stack:** Node.js 22, ES modules, `pg`, PostgreSQL, GitHub Actions, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-11-postgres-repository-v10-design.md`

## Global Constraints

- `DATABASE_DRIVER` defaults to `json`.
- Normal server startup must never run migrations.
- PostgreSQL values are parameterized and dynamic update fields use fixed whitelists.
- PostgreSQL scheduler claims use `FOR UPDATE SKIP LOCKED` semantics.
- JSON remains compatible and remains the default backend.
- Database credentials must never be returned or logged.
- No provider or frontend feature work is included in V10.

---

### Task 1: Repository selection and dependency

**Files:**
- Modify: `package.json`
- Modify: `server/db/create-repository.js`
- Create: `tests/repository-selection.test.js`

**Interfaces:**
- Produces: `createRepositoryFromEnvironment(env)` selecting `json` or `postgres`.
- Consumes later: `createPostgresRepository({ connectionString })`.

- [ ] **Step 1: Write failing tests**

Cover default JSON selection, explicit PostgreSQL selection, missing `DATABASE_URL`, and unsupported `DATABASE_DRIVER`.

- [ ] **Step 2: Run tests and confirm red**

Run: `node --test tests/repository-selection.test.js`

Expected: PostgreSQL selection tests fail because no PostgreSQL repository exists.

- [ ] **Step 3: Add dependency and selection logic**

Add `pg` to runtime dependencies. `DATABASE_DRIVER` is normalized to lowercase and defaults to `json`; `postgres` requires non-empty `DATABASE_URL`; unsupported values throw `DATABASE_DRIVER_UNSUPPORTED`.

- [ ] **Step 4: Run focused tests**

Run: `node --test tests/repository-selection.test.js`

Expected: pass.

---

### Task 2: PostgreSQL repository parity

**Files:**
- Create: `server/db/postgres-repository.js`
- Create: `tests/postgres-repository.test.js`
- Modify: `server/db/json-repository.js`

**Interfaces:**
- Produces: `createPostgresRepository({ connectionString, pool })`.
- Produces repository methods documented by the V10 design.
- Adds `healthCheck()` and `close()` to JSON for contract parity.

- [ ] **Step 1: Write PostgreSQL integration tests**

Using `TEST_POSTGRES_URL`, test account create/update/find/list, OAuth create/get/consume, post/media/publication/job create/get/list/update, and `listPostsWithPublications()` record shapes. Tests skip only when `TEST_POSTGRES_URL` is absent outside CI.

- [ ] **Step 2: Confirm tests fail before implementation**

Run: `node --test tests/postgres-repository.test.js`

Expected: fail because `postgres-repository.js` does not exist.

- [ ] **Step 3: Implement fixed row/column mappings**

Use table-specific whitelists. Map `accounts.platform` to `provider`, `accounts.connection_state` to `state`, and all snake_case timestamp/token fields to existing camelCase shapes. Convert PostgreSQL `Date` values to ISO strings.

- [ ] **Step 4: Implement initialization and health**

`initialize()` checks required tables with `to_regclass` and throws `DATABASE_MIGRATIONS_REQUIRED` if absent. `healthCheck()` runs `SELECT 1` and returns `{ ok, backend: 'postgres' }`. `close()` ends the owned pool.

- [ ] **Step 5: Add JSON health/close parity**

JSON health returns `{ ok: true, backend: 'json' }`; JSON close is a no-op.

- [ ] **Step 6: Run repository tests**

Run the PostgreSQL integration test against a migrated test database and existing JSON repository tests.

---

### Task 3: Transaction-safe scheduler claims

**Files:**
- Modify: `server/db/postgres-repository.js`
- Create: `tests/postgres-job-claim.test.js`

**Interfaces:**
- Produces: `claimDueJobs({ now, workerId, limit, lockTimeoutMs })` with the same behavior as JSON plus PostgreSQL row-level concurrency protection.

- [ ] **Step 1: Write red concurrency tests**

Create multiple due jobs and issue simultaneous claims from independent repository/pool connections. Assert a job ID appears in only one worker result. Also verify stale `RUNNING` jobs are reclaimed and fresh locks are not.

- [ ] **Step 2: Confirm red**

Run: `node --test tests/postgres-job-claim.test.js`.

- [ ] **Step 3: Implement atomic CTE claim**

Use a candidate CTE ordered by `scheduled_at` with `FOR UPDATE SKIP LOCKED`, then update and `RETURNING` the selected scheduler rows in the same SQL statement. Validate `workerId`, normalize `limit`, and derive stale cutoff from `lockTimeoutMs` exactly as JSON does.

- [ ] **Step 4: Run claim tests repeatedly**

Run the focused test multiple times to catch race-sensitive failures, then run `tests/job-claim.test.js` to preserve JSON behavior.

---

### Task 4: Explicit migration runner

**Files:**
- Create: `server/db/migrate.js`
- Create: `server/db/migration-runner.js`
- Create: `tests/migration-runner.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `runMigrations({ connectionString, migrationsDirectory, pool })`.
- Produces CLI: `npm run db:migrate`.

- [ ] **Step 1: Write failing migration tests**

Test clean-database application, ordered migration recording, idempotent rerun, and checksum mismatch rejection. Verify the ledger contains filename/checksum/applied timestamp and no connection string is returned.

- [ ] **Step 2: Confirm red**

Run: `node --test tests/migration-runner.test.js`.

- [ ] **Step 3: Implement migration runner**

Create `srocial_migrations` only inside the explicit migration command. Load `.sql` files sorted lexically, SHA-256 each file, validate applied checksums, strip only an outer `BEGIN;` and final `COMMIT;`, and execute migration body plus ledger insert inside one transaction. Roll back on failure.

- [ ] **Step 4: Implement CLI**

Require `DATABASE_URL`; print concise migration statuses and set nonzero exit code on failure without printing credentials.

- [ ] **Step 5: Verify clean migration and rerun**

Run `npm run db:migrate` twice against CI PostgreSQL; second run must be a no-op.

---

### Task 5: Database health and graceful shutdown

**Files:**
- Modify: `server/routes/health.js`
- Modify: `server/app.js`
- Modify: `server/server.js`
- Modify: `tests/health.test.js`
- Modify: server API health tests if needed

**Interfaces:**
- `getHealthPayload(repository)` returns service metadata plus safe `database` metadata.
- `/api/health` returns 200 when database is healthy and 503 when repository health fails.

- [ ] **Step 1: Write failing health tests**

Assert JSON health includes `{ ok: true, backend: 'json' }`; simulated database failure returns service `ok:false` without exposing error internals.

- [ ] **Step 2: Confirm red**

Run: `node --test tests/health.test.js` plus the server API test containing `/api/health`.

- [ ] **Step 3: Implement async health**

Call `repository.healthCheck()` when available. Catch failures and return `{ ok:false, backend:'unavailable' }` without raw exception text. App maps unhealthy payload to HTTP 503.

- [ ] **Step 4: Close repository on shutdown**

After scheduler stop and HTTP server close, await optional `repository.close()`. Preserve error exit behavior.

- [ ] **Step 5: Re-run health/server tests**

Expected: pass.

---

### Task 6: CI, configuration, and docs

**Files:**
- Modify: `.github/workflows/test.yml`
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `HOW_TO_RUN.md`

**Interfaces:**
- CI provides `TEST_POSTGRES_URL` and migrates a PostgreSQL service before tests.
- Operator config documents `DATABASE_DRIVER=postgres` plus `DATABASE_URL`.

- [ ] **Step 1: Add PostgreSQL CI service**

Use a PostgreSQL service container with health checks. Install npm dependencies before migration/tests. Run migrations with `DATABASE_URL` and tests with `TEST_POSTGRES_URL`.

- [ ] **Step 2: Update environment example**

Add `DATABASE_DRIVER=json`. Keep fake `DATABASE_URL`; document that it is unused unless the driver is `postgres`.

- [ ] **Step 3: Update README and beginner run guide**

Mark current status V10. Document `npm install`, JSON default behavior, PostgreSQL setup/migration command, no automatic startup migration, backup expectations, and health behavior.

- [ ] **Step 4: Run full verification**

Run:

```bash
npm test
find server client tests -name '*.js' -print0 | xargs -0 -n1 node --check
```

In CI, confirm PostgreSQL integration tests run rather than skip.

- [ ] **Step 5: Review diff and merge**

Confirm no secrets, provider behavior, unrelated frontend changes, or schema auto-migration slipped into the diff. Open PR, require green PR CI, squash-merge the exact verified head, then verify `main` CI on the merge commit.
