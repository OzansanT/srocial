import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import pg from 'pg';

const { Pool } = pg;
const DEFAULT_MIGRATIONS_DIRECTORY = fileURLToPath(new URL('./migrations/', import.meta.url));
const MIGRATION_LOCK_KEY = 'srocial_schema_migrations';

function checksum(content) {
  return createHash('sha256').update(content).digest('hex');
}

function stripOuterTransaction(content) {
  let sql = String(content ?? '').trim();
  sql = sql.replace(/^BEGIN\s*;\s*/i, '');
  sql = sql.replace(/\s*COMMIT\s*;\s*$/i, '');
  return sql;
}

async function migrationFiles(directory) {
  return (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

export async function runMigrations({
  connectionString,
  migrationsDirectory = DEFAULT_MIGRATIONS_DIRECTORY,
  pool = null
} = {}) {
  const url = String(connectionString ?? '').trim();
  if (!pool && !url) throw new Error('DATABASE_URL_REQUIRED');

  const database = pool ?? new Pool({ connectionString: url });
  const ownsPool = !pool;
  const client = await database.connect();
  const results = [];
  let locked = false;

  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [MIGRATION_LOCK_KEY]);
    locked = true;

    await client.query(`
      CREATE TABLE IF NOT EXISTS srocial_migrations (
        name text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const appliedResult = await client.query('SELECT name, checksum FROM srocial_migrations');
    const applied = new Map(appliedResult.rows.map((row) => [row.name, row.checksum]));

    for (const name of await migrationFiles(migrationsDirectory)) {
      const content = await readFile(join(migrationsDirectory, name), 'utf8');
      const migrationChecksum = checksum(content);
      const previousChecksum = applied.get(name);

      if (previousChecksum) {
        if (previousChecksum !== migrationChecksum) {
          throw new Error(`MIGRATION_CHECKSUM_MISMATCH:${name}`);
        }
        results.push({ name, status: 'skipped' });
        continue;
      }

      const sql = stripOuterTransaction(content);
      await client.query('BEGIN');
      try {
        if (sql) await client.query(sql);
        await client.query(
          'INSERT INTO srocial_migrations (name, checksum) VALUES ($1, $2)',
          [name, migrationChecksum]
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
      results.push({ name, status: 'applied' });
      applied.set(name, migrationChecksum);
    }

    return results;
  } finally {
    if (locked) {
      try {
        await client.query('SELECT pg_advisory_unlock(hashtext($1))', [MIGRATION_LOCK_KEY]);
      } catch {
        // The original migration error remains authoritative.
      }
    }
    client.release();
    if (ownsPool) await database.end();
  }
}
