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
const schema = 'test_analytics_v20';
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

test('PostgreSQL analytics snapshots are append-only, filterable, and latest-selectable', { skip: !enabled }, async () => {
  const createdAt = '2026-09-14T10:00:00.000Z';
  const account = await repository.createAccount({
    provider: 'instagram',
    providerAccountId: 'ig-analytics-1',
    displayName: 'Analytics IG',
    username: 'analytics_ig',
    state: 'CONNECTED',
    scopes: ['instagram_business_basic', 'instagram_business_manage_insights'],
    accessTokenEncrypted: 'enc-access',
    refreshTokenEncrypted: null,
    tokenExpiresAt: '2026-11-01T10:00:00.000Z',
    connectedAt: createdAt,
    disconnectedAt: null,
    lastErrorCode: null,
    createdAt,
    updatedAt: createdAt
  });
  const post = await repository.createPost({
    caption: 'analytics post',
    scheduledAt: '2026-09-14T11:00:00.000Z',
    createdAt,
    updatedAt: createdAt
  });
  const publication = await repository.createPublication({
    postId: post.id,
    accountId: account.id,
    platform: 'instagram',
    state: 'PUBLISHED',
    scheduledAt: '2026-09-14T11:00:00.000Z',
    externalId: 'ig-media-123',
    externalUrl: 'https://instagram.example/p/ig-media-123',
    errorCode: null,
    createdAt,
    updatedAt: '2026-09-14T11:05:00.000Z'
  });

  const first = await repository.createPublicationMetricSnapshot({
    publicationId: publication.id,
    accountId: account.id,
    provider: 'instagram',
    externalId: 'ig-media-123',
    views: 100,
    reach: 80,
    likes: 10,
    comments: 2,
    shares: 1,
    saves: 3,
    extraMetrics: { plays: 90 },
    capturedAt: '2026-09-14T12:00:00.000Z'
  });
  const second = await repository.createPublicationMetricSnapshot({
    publicationId: publication.id,
    accountId: account.id,
    provider: 'instagram',
    externalId: 'ig-media-123',
    views: 180,
    reach: 120,
    likes: 18,
    comments: 4,
    shares: 2,
    saves: 6,
    extraMetrics: { plays: 165 },
    capturedAt: '2026-09-14T13:00:00.000Z'
  });

  assert.notEqual(first.id, second.id);
  const history = await repository.listPublicationMetricSnapshots({
    publicationId: publication.id,
    accountId: account.id,
    provider: 'instagram'
  });
  assert.deepEqual(history.map((snapshot) => snapshot.id), [first.id, second.id]);
  assert.deepEqual(history[0].extraMetrics, { plays: 90 });

  const latest = await repository.getLatestPublicationMetricSnapshot(publication.id);
  assert.equal(latest.id, second.id);
  assert.equal(latest.views, 180);
  assert.equal(latest.reach, 120);
  assert.equal(latest.likes, 18);
  assert.equal(latest.capturedAt, '2026-09-14T13:00:00.000Z');
});
