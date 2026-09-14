import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPostgresRepository } from '../server/db/postgres-repository.js';
import {
  clearPostgresRuntimeTables,
  dropPostgresTestSchema,
  hasPostgresTestDatabase,
  preparePostgresTestSchema
} from './helpers/postgres-test-db.js';

const enabled = hasPostgresTestDatabase();
const schema = 'test_v18_schedule_atomicity';
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

const timestamp = '2026-09-14T12:30:00.000Z';
const scheduledAt = '2026-09-15T12:30:00.000Z';

test('PostgreSQL social scheduling rolls back the post when a child insert fails', { skip: !enabled }, async () => {
  const missingAccountId = randomUUID();
  await assert.rejects(() => repository.createSocialScheduleGraph({
    post: { caption: 'Must roll back', scheduledAt, createdAt: timestamp, updatedAt: timestamp },
    media: [],
    publicationPlans: [{
      publication: {
        accountId: missingAccountId,
        platform: 'instagram',
        state: 'SCHEDULED',
        scheduledAt,
        providerOptions: {},
        externalId: null,
        externalUrl: null,
        errorCode: null,
        createdAt: timestamp,
        updatedAt: timestamp
      },
      job: {
        type: 'SOCIAL_PUBLICATION',
        accountId: missingAccountId,
        state: 'SCHEDULED',
        scheduledAt,
        attempts: 0,
        lockedAt: null,
        lockedBy: null,
        errorCode: null,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    }]
  }), (error) => error?.code === '23503');

  assert.equal((await repository.listPostsWithPublications()).length, 0);
  assert.equal((await repository.listJobs()).length, 0);
});

test('PostgreSQL social scheduling commits linked post, publication and job together', { skip: !enabled }, async () => {
  const result = await repository.createSocialScheduleGraph({
    post: { caption: 'Commit together', scheduledAt, createdAt: timestamp, updatedAt: timestamp },
    media: [{ type: 'image', url: 'https://cdn.example.test/atomic.jpg', sortOrder: 0, metadata: {}, createdAt: timestamp }],
    publicationPlans: [{
      publication: {
        accountId: null,
        platform: 'instagram',
        state: 'SCHEDULED',
        scheduledAt,
        providerOptions: {},
        externalId: null,
        externalUrl: null,
        errorCode: null,
        createdAt: timestamp,
        updatedAt: timestamp
      },
      job: {
        type: 'SOCIAL_PUBLICATION',
        accountId: null,
        state: 'SCHEDULED',
        scheduledAt,
        attempts: 0,
        lockedAt: null,
        lockedBy: null,
        errorCode: null,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    }]
  });

  assert.equal(result.media[0].postId, result.post.id);
  assert.equal(result.publications[0].postId, result.post.id);
  assert.equal(result.jobs[0].publicationId, result.publications[0].id);
  assert.equal((await repository.listPostsWithPublications()).length, 1);
  assert.equal((await repository.listJobs()).length, 1);
});

test('PostgreSQL WhatsApp scheduling rolls back campaign when recipient FK fails', { skip: !enabled }, async () => {
  await assert.rejects(() => repository.createWhatsAppCampaignGraph({
    campaign: {
      userId: null,
      accountId: null,
      templateId: null,
      name: 'Must roll back campaign',
      state: 'SCHEDULED',
      scheduledAt,
      templateComponents: [],
      createdAt: timestamp,
      updatedAt: timestamp
    },
    recipients: [{ contactId: randomUUID(), state: 'QUEUED', createdAt: timestamp }],
    job: {
      type: 'WHATSAPP_CAMPAIGN',
      state: 'SCHEDULED',
      scheduledAt,
      attempts: 0,
      lockedAt: null,
      lockedBy: null,
      errorCode: null,
      createdAt: timestamp,
      updatedAt: timestamp
    }
  }), (error) => error?.code === '23503');

  assert.equal((await repository.listCampaigns()).length, 0);
  assert.equal((await repository.listJobs()).length, 0);
});
