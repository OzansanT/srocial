import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { runMigrations } from '../server/db/migration-runner.js';
import { createPostgresBackupStore } from '../server/maintenance/postgres-backup-store.js';

const { Pool } = pg;
const connectionString = process.env.TEST_POSTGRES_URL;

test('PostgreSQL backup round-trips real typed rows and clears transient rate limits', {
  skip: !connectionString
}, async () => {
  const schema = `backup_${randomUUID().replaceAll('-', '')}`;
  const admin = new Pool({ connectionString });
  let pool;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    pool = new Pool({
      connectionString,
      options: `-c search_path=${schema}`
    });
    await runMigrations({ pool });

    const userId = randomUUID();
    const postId = randomUUID();
    const scheduledAt = '2026-09-17T10:00:00.000Z';
    await pool.query(
      'INSERT INTO users (id, email) VALUES ($1, $2)',
      [userId, 'backup-test@srocial.invalid']
    );
    await pool.query(
      'INSERT INTO posts (id, user_id, caption, scheduled_at) VALUES ($1, $2, $3, $4)',
      [postId, userId, 'original backup row', scheduledAt]
    );
    await pool.query(
      `INSERT INTO rate_limit_buckets (scope, client_key, window_start_ms, request_count, updated_at)
       VALUES ('api', '127.0.0.1', 1, 9, now())`
    );

    const store = createPostgresBackupStore({ pool });
    const snapshot = await store.exportSnapshot();
    assert.equal(snapshot.driver, 'postgres');
    const backedUpPosts = JSON.parse(snapshot.data.posts);
    assert.equal(backedUpPosts.length, 1);
    assert.equal(backedUpPosts[0].id, postId);
    assert.equal(backedUpPosts[0].caption, 'original backup row');
    assert.equal(Object.hasOwn(snapshot.data, 'rate_limit_buckets'), false);

    await pool.query('UPDATE posts SET caption = $1 WHERE id = $2', ['changed after backup', postId]);
    await pool.query(
      'INSERT INTO users (id, email) VALUES ($1, $2)',
      [randomUUID(), 'extra@srocial.invalid']
    );

    await store.restoreSnapshot(snapshot, { force: true });

    const restoredPosts = await pool.query('SELECT id, user_id, caption, scheduled_at FROM posts ORDER BY id');
    assert.equal(restoredPosts.rows.length, 1);
    assert.equal(restoredPosts.rows[0].id, postId);
    assert.equal(restoredPosts.rows[0].user_id, userId);
    assert.equal(restoredPosts.rows[0].caption, 'original backup row');
    assert.equal(new Date(restoredPosts.rows[0].scheduled_at).toISOString(), scheduledAt);

    const restoredUsers = await pool.query('SELECT id FROM users ORDER BY id');
    assert.deepEqual(restoredUsers.rows.map((row) => row.id), [userId]);
    const rateLimits = await pool.query('SELECT COUNT(*)::int AS count FROM rate_limit_buckets');
    assert.equal(rateLimits.rows[0].count, 0);
  } finally {
    if (pool) await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
});
