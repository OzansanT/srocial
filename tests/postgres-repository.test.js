import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresRepository } from '../server/db/postgres-repository.js';
import {
  clearPostgresRuntimeTables,
  dropPostgresTestSchema,
  hasPostgresTestDatabase,
  preparePostgresTestSchema
} from './helpers/postgres-test-db.js';

const enabled = hasPostgresTestDatabase();
const schema = 'test_repository_v10';
let pool;
let repository;

before(async () => {
  if (!enabled) return;
  pool = await preparePostgresTestSchema(schema);
  repository = createPostgresRepository({ pool });
});

beforeEach(async () => {
  if (!enabled) return;
  await clearPostgresRuntimeTables(pool);
});

after(async () => {
  if (!enabled) return;
  await pool.end();
  await dropPostgresTestSchema(schema);
});


test('PostgreSQL initialize refuses an unmigrated schema', async () => {
  const fakePool = {
    async query(sql) {
      assert.match(sql, /to_regclass/);
      return { rows: [{ table_name: 'accounts', regclass: null }] };
    }
  };
  const repo = createPostgresRepository({ pool: fakePool });
  await assert.rejects(() => repo.initialize(), /DATABASE_MIGRATIONS_REQUIRED/);
});


test('PostgreSQL health check executes a live query', async () => {
  const queries = [];
  const fakePool = {
    async query(sql) {
      queries.push(sql);
      return { rows: [{ ok: 1 }] };
    }
  };
  const repo = createPostgresRepository({ pool: fakePool });
  assert.deepEqual(await repo.healthCheck(), { ok: true, backend: 'postgres' });
  assert.deepEqual(queries, ['SELECT 1 AS ok']);
});


test('PostgreSQL repository verifies schema and reports healthy backend', { skip: !enabled }, async () => {
  await repository.initialize();
  assert.deepEqual(await repository.healthCheck(), { ok: true, backend: 'postgres' });
});


test('PostgreSQL repository persists account and OAuth state in JSON-compatible shapes', { skip: !enabled }, async () => {
  const createdAt = '2026-09-11T08:00:00.000Z';
  const account = await repository.createAccount({
    provider: 'instagram',
    providerAccountId: 'ig-123',
    displayName: 'Primary IG',
    username: 'primary_ig',
    state: 'CONNECTED',
    scopes: ['instagram_business_basic'],
    accessTokenEncrypted: 'enc-access',
    refreshTokenEncrypted: 'enc-refresh',
    tokenExpiresAt: '2026-11-01T08:00:00.000Z',
    connectedAt: createdAt,
    disconnectedAt: null,
    lastErrorCode: null,
    createdAt,
    updatedAt: createdAt
  });

  assert.equal(account.provider, 'instagram');
  assert.equal(account.state, 'CONNECTED');
  assert.equal(account.accessTokenEncrypted, 'enc-access');
  assert.equal((await repository.getAccount(account.id)).providerAccountId, 'ig-123');
  assert.equal((await repository.findAccountByProviderIdentity('instagram', 'ig-123')).id, account.id);
  assert.equal((await repository.listAccounts()).length, 1);

  const disconnected = await repository.updateAccount(account.id, {
    state: 'DISCONNECTED',
    accessTokenEncrypted: null,
    refreshTokenEncrypted: null,
    disconnectedAt: '2026-09-11T09:00:00.000Z',
    updatedAt: '2026-09-11T09:00:00.000Z'
  });
  assert.equal(disconnected.state, 'DISCONNECTED');
  assert.equal(disconnected.accessTokenEncrypted, null);

  const oauth = await repository.createOAuthState({
    stateHash: 'hash-1',
    provider: 'instagram',
    redirectUri: 'https://example.test/callback',
    expiresAt: '2026-09-11T10:00:00.000Z',
    consumedAt: null,
    createdAt
  });
  assert.equal((await repository.getOAuthState('hash-1')).id, oauth.id);
  const consumed = await repository.consumeOAuthState('hash-1', { now: new Date('2026-09-11T09:30:00.000Z') });
  assert.equal(consumed.consumedAt, '2026-09-11T09:30:00.000Z');
  assert.equal(await repository.consumeOAuthState('hash-1', { now: new Date('2026-09-11T09:31:00.000Z') }), null);
});


test('PostgreSQL repository persists content, media, publications, and scheduler jobs', { skip: !enabled }, async () => {
  const timestamp = '2026-09-11T08:00:00.000Z';
  const scheduledAt = '2026-09-12T08:00:00.000Z';
  const post = await repository.createPost({ caption: 'hello', scheduledAt, createdAt: timestamp, updatedAt: timestamp });
  const media2 = await repository.createMedia({ postId: post.id, type: 'image', url: 'https://cdn.test/2.jpg', sortOrder: 2, metadata: { slot: 2 }, createdAt: timestamp });
  const media1 = await repository.createMedia({ postId: post.id, type: 'image', url: 'https://cdn.test/1.jpg', sortOrder: 1, metadata: { slot: 1 }, createdAt: timestamp });
  assert.equal(media1.postId, post.id);
  assert.deepEqual((await repository.listMediaForPost(post.id)).map((item) => item.id), [media1.id, media2.id]);
  assert.equal((await repository.listMedia()).length, 2);

  const publication = await repository.createPublication({
    postId: post.id,
    accountId: null,
    platform: 'instagram',
    state: 'SCHEDULED',
    scheduledAt,
    externalId: null,
    errorCode: null,
    createdAt: timestamp,
    updatedAt: timestamp
  });
  assert.equal((await repository.getPublication(publication.id)).platform, 'instagram');
  const updatedPublication = await repository.updatePublication(publication.id, {
    state: 'PROCESSING',
    externalId: 'provider-1',
    updatedAt: '2026-09-11T08:05:00.000Z'
  });
  assert.equal(updatedPublication.state, 'PROCESSING');

  const job = await repository.createJob({
    type: 'SOCIAL_PUBLICATION',
    publicationId: publication.id,
    campaignId: null,
    accountId: null,
    state: 'SCHEDULED',
    scheduledAt,
    attempts: 0,
    lockedAt: null,
    lockedBy: null,
    errorCode: null,
    createdAt: timestamp,
    updatedAt: timestamp
  });
  const updatedJob = await repository.updateJob(job.id, { state: 'RETRYING', errorCode: 'NETWORK_ERROR', updatedAt: '2026-09-11T08:06:00.000Z' });
  assert.equal(updatedJob.errorCode, 'NETWORK_ERROR');
  assert.equal((await repository.listJobs())[0].id, job.id);
  assert.equal((await repository.getPost(post.id)).caption, 'hello');

  const listed = await repository.listPostsWithPublications();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].publications[0].id, publication.id);
});
