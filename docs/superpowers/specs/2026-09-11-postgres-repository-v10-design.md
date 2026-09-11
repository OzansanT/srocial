# V10 PostgreSQL Production Repository Design

## Goal

Make PostgreSQL a real production persistence backend without changing the existing service/scheduler repository contract, while preserving JSON storage as the default local-development backend.

## Scope

V10 includes:

- explicit repository selection with `DATABASE_DRIVER=json|postgres`;
- a PostgreSQL implementation of every repository method currently used by Srocial;
- transaction-safe due-job claiming with `FOR UPDATE SKIP LOCKED` semantics;
- a manual migration runner and migration ledger with checksum validation;
- startup schema verification that never runs migrations automatically;
- database health reporting through `/api/health`;
- graceful PostgreSQL pool shutdown;
- PostgreSQL integration coverage in GitHub Actions;
- documentation/config updates.

V10 does not add provider features, object storage, authentication, analytics, or UI changes.

## Repository Selection

`DATABASE_DRIVER` defaults to `json`.

- `json` -> existing `createJsonRepository({ filePath })` using `DATA_FILE`.
- `postgres` -> `createPostgresRepository({ connectionString })` using `DATABASE_URL`.
- any other value -> startup configuration error.
- `DATABASE_URL` is required only when the PostgreSQL driver is selected.

This explicit switch prevents `.env.example` values from accidentally changing local behavior.

## PostgreSQL Dependency

Use the `pg` package only inside the database layer and migration command. No route, service, scheduler worker, provider, or frontend module imports `pg` directly.

## Repository Contract

The PostgreSQL repository must match the shapes returned by the JSON repository. Database snake_case fields are mapped to the existing camelCase records. `timestamptz` values are returned as ISO-8601 strings.

Required methods:

- `initialize()`
- `healthCheck()`
- `close()`
- `createAccount`, `updateAccount`, `getAccount`, `findAccountByProviderIdentity`, `listAccounts`
- `createOAuthState`, `getOAuthState`, `consumeOAuthState`
- `createMedia`, `listMedia`, `listMediaForPost`
- `createPost`
- `createPublication`, `updatePublication`, `getPublication`
- `createJob`, `updateJob`, `claimDueJobs`, `listJobs`
- `getPost`
- `listPostsWithPublications`

Updates must use whitelisted column mappings; arbitrary object keys must never become SQL identifiers.

## Account Mapping

Existing SQL uses `accounts.platform` and `accounts.connection_state`, while application records use `provider` and `state`.

Map:

- `provider` <-> `platform`
- `state` <-> `connection_state`
- maintain legacy `connected` boolean as `state === 'CONNECTED'`
- token/scopes/timestamps map directly to their snake_case columns.

## Job Claiming

`claimDueJobs()` must claim rows atomically in PostgreSQL.

Eligibility matches JSON behavior:

- `scheduled_at <= now`;
- state is `SCHEDULED` or `RETRYING`; or
- state is `RUNNING` and its lock is missing/stale according to `lockTimeoutMs`.

Use a single transaction-safe statement based on a candidate CTE with:

```sql
SELECT id
FROM scheduler_jobs
...
ORDER BY scheduled_at
FOR UPDATE SKIP LOCKED
LIMIT $n
```

Then update only those rows to `RUNNING`, set `locked_at`, `locked_by`, increment `attempts`, set `updated_at`, and return the claimed rows.

This permits multiple workers to claim concurrently without duplicate ownership.

## Migrations

Server startup must never apply schema changes.

Add `npm run db:migrate`, implemented in `server/db/migrate.js`.

Migration runner behavior:

1. require `DATABASE_URL`;
2. connect with `pg`;
3. create the migration ledger `srocial_migrations` as part of this explicit migration command;
4. load `server/db/migrations/*.sql` in filename order;
5. calculate SHA-256 for each migration;
6. reject a previously applied migration if its checksum changed;
7. execute each migration atomically with its ledger insert;
8. print only migration names/status, never credentials.

Existing migrations contain outer `BEGIN; ... COMMIT;`. The runner strips only those outer wrappers, then executes the body plus ledger insert inside its own transaction so migration and ledger state cannot diverge.

## Startup Schema Verification

`postgresRepository.initialize()` verifies connectivity and that required runtime tables exist. It must not create or alter them.

At minimum verify:

- `accounts`
- `oauth_states`
- `posts`
- `media`
- `publications`
- `scheduler_jobs`

If missing, throw a clear `DATABASE_MIGRATIONS_REQUIRED` error so the operator can run `npm run db:migrate`.

## Health

Both repository implementations expose `healthCheck()`.

Expected shape:

```json
{
  "ok": true,
  "backend": "json"
}
```

or

```json
{
  "ok": true,
  "backend": "postgres"
}
```

PostgreSQL health executes `SELECT 1`. `/api/health` includes this database object and returns HTTP 503 if database health fails. Health output must not expose connection strings, hostnames, usernames, or credentials.

## Shutdown

If a repository exposes `close()`, server shutdown calls it after stopping the scheduler and closing the HTTP listener. JSON `close()` is a no-op; PostgreSQL closes its pool.

## CI

GitHub Actions adds a PostgreSQL service container. Workflow sequence:

1. checkout;
2. setup Node.js 22;
3. install dependencies;
4. run migrations against the CI database;
5. run full tests with `TEST_POSTGRES_URL` available;
6. run JavaScript syntax checks.

PostgreSQL integration tests must cover:

- repository selection/config validation;
- migrations on a clean database;
- account/OAuth persistence;
- post/media/publication/job persistence;
- stale-lock recovery;
- concurrent claims where each due job is returned to at most one worker;
- health check;
- schema-required startup failure.

## Security and Reliability

- parameterize all values;
- whitelist all dynamic columns;
- never log `DATABASE_URL` or credentials;
- no automatic migrations during normal startup;
- no SQL in routes/services/providers;
- pool resources close on shutdown;
- retain existing scheduler idempotency checks above the database lock layer.

## Compatibility

JSON remains the default backend and existing JSON tests must continue to pass unchanged unless health-contract assertions require an additive database field.

No frontend API contract changes are required except additive `/api/health` database metadata.
