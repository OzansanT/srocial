import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createLocalMediaStore } from '../server/media/local-media-store.js';
import { createJsonBackupStore } from '../server/maintenance/json-backup-store.js';
import { createPostgresBackupStore, POSTGRES_BACKUP_TABLES } from '../server/maintenance/postgres-backup-store.js';
import { createBackup } from '../server/maintenance/create-backup.js';
import { restoreBackup } from '../server/maintenance/restore-backup.js';
import { parseBackupArgs, parseRestoreArgs } from '../server/maintenance/cli-args.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

async function tempRoot(prefix) {
  return mkdtemp(join(tmpdir(), prefix));
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function collect(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

test('JSON backup store exports normalized state and refuses non-empty restore without force', async () => {
  const root = await tempRoot('srocial-json-backup-');
  try {
    const path = join(root, 'srocial.json');
    await writeFile(path, JSON.stringify({ posts: [{ id: 'p1' }], accounts: [{ id: 'a1' }] }), 'utf8');
    const store = createJsonBackupStore({ filePath: path });
    const snapshot = await store.exportSnapshot();
    assert.equal(snapshot.driver, 'json');
    assert.deepEqual(snapshot.migrations, []);
    assert.deepEqual(snapshot.data.posts, [{ id: 'p1' }]);
    assert.deepEqual(snapshot.data.accounts, [{ id: 'a1' }]);
    assert.deepEqual(snapshot.data.publications, []);
    assert.equal(await store.isEmpty(), false);

    await assert.rejects(
      () => store.restoreSnapshot({ ...snapshot, data: { ...snapshot.data, posts: [{ id: 'restored' }] } }),
      (error) => error?.code === 'RESTORE_TARGET_NOT_EMPTY'
    );

    await store.restoreSnapshot({ ...snapshot, data: { ...snapshot.data, posts: [{ id: 'restored' }] } }, { force: true });
    assert.deepEqual((await readJson(path)).posts, [{ id: 'restored' }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('JSON backup restore validates driver and collections before replacing the target file', async () => {
  const root = await tempRoot('srocial-json-backup-');
  try {
    const path = join(root, 'srocial.json');
    await writeFile(path, JSON.stringify({ posts: [] }), 'utf8');
    const store = createJsonBackupStore({ filePath: path });
    await assert.rejects(
      () => store.restoreSnapshot({ driver: 'postgres', migrations: [], data: {} }),
      (error) => error?.code === 'BACKUP_DATABASE_DRIVER_MISMATCH'
    );
    await assert.rejects(
      () => store.restoreSnapshot({ driver: 'json', migrations: [], data: { posts: 'bad' } }),
      (error) => error?.code === 'BACKUP_FORMAT_INVALID'
    );
    assert.deepEqual((await readJson(path)).posts, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('PostgreSQL backup export uses a fixed table set and excludes transient rate-limit buckets', async () => {
  const queries = [];
  const pool = {
    async query(text) {
      queries.push(text);
      if (text.includes('srocial_migrations')) return { rows: [{ name: '001_initial.sql', checksum: 'abc' }] };
      return { rows: [{ rows_json: '[]' }] };
    }
  };
  const store = createPostgresBackupStore({ pool });
  const snapshot = await store.exportSnapshot();
  assert.equal(snapshot.driver, 'postgres');
  assert.deepEqual(snapshot.migrations, [{ name: '001_initial.sql', checksum: 'abc' }]);
  assert.deepEqual(Object.keys(snapshot.data), POSTGRES_BACKUP_TABLES);
  assert.equal(POSTGRES_BACKUP_TABLES.includes('rate_limit_buckets'), false);
  assert.equal(queries.some((query) => query.includes('rate_limit_buckets')), false);
});

test('PostgreSQL restore fails migration mismatch before deletes/inserts and rolls back', async () => {
  const calls = [];
  const client = {
    async query(text) {
      calls.push(text);
      if (text === 'BEGIN') return { rows: [] };
      if (text.includes('srocial_migrations')) return { rows: [{ name: '001_initial.sql', checksum: 'target' }] };
      if (text === 'ROLLBACK') return { rows: [] };
      throw new Error(`unexpected query: ${text}`);
    },
    release() { calls.push('RELEASE'); }
  };
  const store = createPostgresBackupStore({ pool: { connect: async () => client } });
  const data = Object.fromEntries(POSTGRES_BACKUP_TABLES.map((table) => [table, '[]']));
  await assert.rejects(
    () => store.restoreSnapshot({ driver: 'postgres', migrations: [{ name: '001_initial.sql', checksum: 'backup' }], data }, { force: true }),
    (error) => error?.code === 'BACKUP_MIGRATION_MISMATCH'
  );
  assert.equal(calls.includes('ROLLBACK'), true);
  assert.equal(calls.some((call) => typeof call === 'string' && call.startsWith('DELETE FROM')), false);
  assert.equal(calls.at(-1), 'RELEASE');
});

test('PostgreSQL forced restore deletes reverse dependency order and inserts forward in one transaction', async () => {
  const calls = [];
  const client = {
    async query(text, params = []) {
      calls.push({ text, params });
      if (text === 'BEGIN' || text === 'COMMIT') return { rows: [] };
      if (text.includes('srocial_migrations')) return { rows: [{ name: '001_initial.sql', checksum: 'abc' }] };
      if (text.startsWith('SELECT EXISTS')) return { rows: [{ exists: true }] };
      if (text.startsWith('DELETE FROM')) return { rows: [] };
      if (text.startsWith('INSERT INTO')) return { rows: [] };
      throw new Error(`unexpected query: ${text}`);
    },
    release() {}
  };
  const store = createPostgresBackupStore({ pool: { connect: async () => client } });
  const data = Object.fromEntries(POSTGRES_BACKUP_TABLES.map((table) => [table, table === POSTGRES_BACKUP_TABLES[0] ? '[{"id":"x"}]' : '[]']));
  await store.restoreSnapshot({ driver: 'postgres', migrations: [{ name: '001_initial.sql', checksum: 'abc' }], data }, { force: true });

  const deletes = calls.filter((call) => call.text?.startsWith('DELETE FROM')).map((call) => call.text.match(/"([^"]+)"/)[1]);
  assert.deepEqual(deletes, [...POSTGRES_BACKUP_TABLES].reverse());
  const inserts = calls.filter((call) => call.text?.startsWith('INSERT INTO')).map((call) => call.text.match(/"([^"]+)"/)[1]);
  assert.deepEqual(inserts, [POSTGRES_BACKUP_TABLES[0]]);
  assert.equal(calls.some((call) => call.text === 'COMMIT'), true);
});

test('backup and forced restore round-trip JSON data plus local media with exact keys', async () => {
  const root = await tempRoot('srocial-backup-roundtrip-');
  try {
    const dataFile = join(root, 'data.json');
    const mediaDirectory = join(root, 'uploads');
    const backupDirectory = join(root, 'backup');
    await writeFile(dataFile, JSON.stringify({ posts: [{ id: 'original', caption: 'kept' }] }), 'utf8');

    const databaseStore = createJsonBackupStore({ filePath: dataFile });
    const mediaStore = createLocalMediaStore({ rootDirectory: mediaDirectory, publicBaseUrl: 'https://srocial.test' });
    await mediaStore.initialize();
    const asset = await mediaStore.save(Readable.from([JPEG]), { contentType: 'image/jpeg' });

    const result = await createBackup({
      outputDirectory: backupDirectory,
      databaseStore,
      databaseDriver: 'json',
      mediaStore,
      mediaDriver: 'local',
      now: () => new Date('2026-09-16T09:00:00.000Z')
    });
    assert.equal(result.mediaCount, 1);
    const manifest = await readJson(join(backupDirectory, 'manifest.json'));
    assert.equal(manifest.format, 'srocial-backup');
    assert.equal(manifest.version, 1);
    assert.equal(manifest.database.driver, 'json');
    assert.equal(manifest.media.assets[0].key, asset.key);
    assert.equal(JSON.stringify(manifest).includes('DATABASE_URL'), false);

    await writeFile(dataFile, JSON.stringify({ posts: [{ id: 'changed' }] }), 'utf8');
    await mediaStore.remove(asset.key);
    await mediaStore.save(Readable.from([JPEG]), { contentType: 'image/jpeg' });

    await restoreBackup({
      inputDirectory: backupDirectory,
      databaseStore,
      databaseDriver: 'json',
      mediaStore,
      mediaDriver: 'local',
      force: true
    });

    assert.deepEqual((await readJson(dataFile)).posts, [{ id: 'original', caption: 'kept' }]);
    const restoredAssets = await mediaStore.list();
    assert.deepEqual(restoredAssets.map((item) => item.key), [asset.key]);
    const opened = await mediaStore.open(asset.key);
    assert.deepEqual(await collect(opened.stream), JPEG);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('restore verifies media checksums before mutating a non-empty target', async () => {
  const root = await tempRoot('srocial-backup-corrupt-');
  try {
    const dataFile = join(root, 'data.json');
    const mediaDirectory = join(root, 'uploads');
    const backupDirectory = join(root, 'backup');
    await writeFile(dataFile, JSON.stringify({ posts: [{ id: 'original' }] }), 'utf8');
    const databaseStore = createJsonBackupStore({ filePath: dataFile });
    const mediaStore = createLocalMediaStore({ rootDirectory: mediaDirectory, publicBaseUrl: 'https://srocial.test' });
    await mediaStore.initialize();
    const asset = await mediaStore.save(Readable.from([JPEG]), { contentType: 'image/jpeg' });
    await createBackup({ outputDirectory: backupDirectory, databaseStore, databaseDriver: 'json', mediaStore, mediaDriver: 'local' });

    await writeFile(join(backupDirectory, 'media', asset.key), Buffer.from('tampered'));
    await writeFile(dataFile, JSON.stringify({ posts: [{ id: 'target-must-remain' }] }), 'utf8');

    await assert.rejects(
      () => restoreBackup({ inputDirectory: backupDirectory, databaseStore, databaseDriver: 'json', mediaStore, mediaDriver: 'local', force: true }),
      (error) => error?.code === 'BACKUP_MEDIA_CHECKSUM_MISMATCH'
    );
    assert.deepEqual((await readJson(dataFile)).posts, [{ id: 'target-must-remain' }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('backup refuses an existing output directory', async () => {
  const root = await tempRoot('srocial-backup-existing-');
  try {
    const databaseStore = { exportSnapshot: async () => ({ driver: 'json', migrations: [], data: {} }) };
    const mediaStore = { list: async () => [] };
    await assert.rejects(
      () => createBackup({ outputDirectory: root, databaseStore, databaseDriver: 'json', mediaStore, mediaDriver: 'local' }),
      (error) => error?.code === 'BACKUP_OUTPUT_EXISTS'
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('CLI argument parsing is strict and force is explicit', () => {
  assert.deepEqual(parseBackupArgs(['--output', './backup']), { output: './backup' });
  assert.deepEqual(parseRestoreArgs(['--input', './backup']), { input: './backup', force: false });
  assert.deepEqual(parseRestoreArgs(['--input', './backup', '--force']), { input: './backup', force: true });
  assert.throws(() => parseBackupArgs([]), (error) => error?.code === 'BACKUP_OUTPUT_REQUIRED');
  assert.throws(() => parseRestoreArgs([]), (error) => error?.code === 'BACKUP_INPUT_REQUIRED');
  assert.throws(() => parseRestoreArgs(['--input', './backup', '--wat']), (error) => error?.code === 'MAINTENANCE_ARGUMENT_INVALID');
});
