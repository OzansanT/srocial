import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresBackupStore, POSTGRES_BACKUP_TABLES } from '../server/maintenance/postgres-backup-store.js';

test('PostgreSQL export reads migrations and all tables from one repeatable-read snapshot', async () => {
  const calls = [];
  const client = {
    async query(text) {
      calls.push(text);
      if (text === 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY') return { rows: [] };
      if (text === 'COMMIT') return { rows: [] };
      if (text === 'ROLLBACK') return { rows: [] };
      if (text.includes('srocial_migrations')) return { rows: [{ name: '001_initial.sql', checksum: 'abc' }] };
      if (text.includes('jsonb_agg')) return { rows: [{ rows_json: '[]' }] };
      throw new Error(`unexpected query: ${text}`);
    },
    release() { calls.push('RELEASE'); }
  };
  const store = createPostgresBackupStore({ pool: { connect: async () => client } });
  const snapshot = await store.exportSnapshot();

  assert.equal(snapshot.driver, 'postgres');
  assert.deepEqual(Object.keys(snapshot.data), POSTGRES_BACKUP_TABLES);
  assert.equal(calls[0], 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(calls.at(-2), 'COMMIT');
  assert.equal(calls.at(-1), 'RELEASE');
  assert.equal(calls.filter((text) => typeof text === 'string' && text.includes('jsonb_agg')).length, POSTGRES_BACKUP_TABLES.length);
});

test('PostgreSQL restore clears transient rate-limit buckets even for an otherwise empty target', async () => {
  const calls = [];
  const client = {
    async query(text) {
      calls.push(text);
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
      if (text.includes('srocial_migrations')) return { rows: [{ name: '001_initial.sql', checksum: 'abc' }] };
      if (text.startsWith('SELECT EXISTS')) return { rows: [{ exists: false }] };
      if (text === 'DELETE FROM "rate_limit_buckets"') return { rows: [] };
      throw new Error(`unexpected query: ${text}`);
    },
    release() { calls.push('RELEASE'); }
  };
  const data = Object.fromEntries(POSTGRES_BACKUP_TABLES.map((table) => [table, '[]']));
  const store = createPostgresBackupStore({ pool: { connect: async () => client } });
  await store.restoreSnapshot({
    driver: 'postgres',
    migrations: [{ name: '001_initial.sql', checksum: 'abc' }],
    data
  });

  const bucketDelete = calls.indexOf('DELETE FROM "rate_limit_buckets"');
  const commit = calls.indexOf('COMMIT');
  assert.notEqual(bucketDelete, -1);
  assert.ok(bucketDelete < commit);
  assert.equal(calls.at(-1), 'RELEASE');
});
