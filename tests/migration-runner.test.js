import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runMigrations } from '../server/db/migration-runner.js';
import {
  dropPostgresTestSchema,
  hasPostgresTestDatabase,
  prepareEmptyPostgresTestSchema
} from './helpers/postgres-test-db.js';

const enabled = hasPostgresTestDatabase();


test('migration runner applies current schema once and records checksums', { skip: !enabled }, async () => {
  const schema = 'test_migrations_full_v10';
  const pool = await prepareEmptyPostgresTestSchema(schema);
  try {
    const first = await runMigrations({ pool });
    assert.ok(first.length >= 3);
    assert.ok(first.every((item) => item.status === 'applied'));

    const tables = await pool.query("SELECT to_regclass('accounts') AS accounts, to_regclass('scheduler_jobs') AS jobs");
    assert.ok(tables.rows[0].accounts);
    assert.ok(tables.rows[0].jobs);

    const ledger = await pool.query('SELECT name, checksum, applied_at FROM srocial_migrations ORDER BY name');
    assert.equal(ledger.rows.length, first.length);
    for (const row of ledger.rows) {
      assert.match(row.name, /^\d+.*\.sql$/);
      assert.match(row.checksum, /^[a-f0-9]{64}$/);
      assert.ok(row.applied_at instanceof Date);
    }

    const second = await runMigrations({ pool });
    assert.deepEqual(second.map((item) => item.status), first.map(() => 'skipped'));
  } finally {
    await pool.end();
    await dropPostgresTestSchema(schema);
  }
});


test('migration runner rejects a changed migration after it has been applied', { skip: !enabled }, async () => {
  const schema = 'test_migrations_checksum_v10';
  const directory = await mkdtemp(join(tmpdir(), 'srocial-migrations-'));
  const migration = join(directory, '001_widget.sql');
  const pool = await prepareEmptyPostgresTestSchema(schema);

  try {
    await writeFile(migration, 'BEGIN;\nCREATE TABLE widget (id integer PRIMARY KEY);\nCOMMIT;\n', 'utf8');
    assert.deepEqual(await runMigrations({ pool, migrationsDirectory: directory }), [
      { name: '001_widget.sql', status: 'applied' }
    ]);

    await writeFile(migration, 'BEGIN;\nCREATE TABLE widget (id bigint PRIMARY KEY);\nCOMMIT;\n', 'utf8');
    await assert.rejects(
      () => runMigrations({ pool, migrationsDirectory: directory }),
      /MIGRATION_CHECKSUM_MISMATCH:001_widget\.sql/
    );
  } finally {
    await pool.end();
    await dropPostgresTestSchema(schema);
    await rm(directory, { recursive: true, force: true });
  }
});
