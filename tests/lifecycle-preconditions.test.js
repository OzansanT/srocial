import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { applyJsonPostLifecycleMutations } from '../server/db/json-post-lifecycle.js';
import { createPostgresRepository } from '../server/db/postgres-repository.js';
import {
  clearPostgresRuntimeTables,
  dropPostgresTestSchema,
  hasPostgresTestDatabase,
  preparePostgresTestSchema
} from './helpers/postgres-test-db.js';

const timestamp = '2026-09-14T12:30:00.000Z';
const scheduledAt = '2026-09-15T12:30:00.000Z';

function staleMutation({ postId = 'post-1', publicationId = 'pub-1', jobId = 'job-1' } = {}) {
  return {
    postId,
    postPatch: { caption: 'Must not commit', updatedAt: timestamp },
    publicationPatches: [{
      id: publicationId,
      expected: { state: 'SCHEDULED', externalId: null },
      patch: { state: 'CANCELLED', updatedAt: timestamp }
    }],
    jobPatches: [{
      id: jobId,
      expected: { state: 'SCHEDULED' },
      patch: { state: 'CANCELLED', lockedAt: null, lockedBy: null, updatedAt: timestamp }
    }]
  };
}

test('JSON lifecycle mutation rejects a scheduler claim that happened after service validation without partial writes', () => {
  const data = {
    posts: [{ id: 'post-1', caption: 'Original', scheduledAt }],
    media: [],
    publications: [{ id: 'pub-1', postId: 'post-1', platform: 'instagram', state: 'SCHEDULED', externalId: null, scheduledAt }],
    jobs: [{ id: 'job-1', type: 'SOCIAL_PUBLICATION', publicationId: 'pub-1', state: 'RUNNING', lockedAt: timestamp, lockedBy: 'scheduler-race', scheduledAt }]
  };

  assert.throws(
    () => applyJsonPostLifecycleMutations(data, [staleMutation()]),
    (error) => error?.code === 'LIFECYCLE_STALE_STATE'
  );
  assert.equal(data.posts[0].caption, 'Original');
  assert.equal(data.publications[0].state, 'SCHEDULED');
  assert.equal(data.jobs[0].state, 'RUNNING');
});

const enabled = hasPostgresTestDatabase();
const schema = 'test_v18_lifecycle_preconditions';
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

test('PostgreSQL lifecycle mutation rejects a concurrently claimed job and rolls back earlier patches', { skip: !enabled }, async () => {
  const graph = await repository.createSocialScheduleGraph({
    post: { caption: 'Original', scheduledAt, createdAt: timestamp, updatedAt: timestamp },
    media: [],
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

  await pool.query(
    `UPDATE scheduler_jobs SET state = 'RUNNING', locked_at = $1, locked_by = 'scheduler-race' WHERE id = $2`,
    [timestamp, graph.jobs[0].id]
  );

  await assert.rejects(
    () => repository.applyPostLifecycleMutations({
      mutations: [staleMutation({
        postId: graph.post.id,
        publicationId: graph.publications[0].id,
        jobId: graph.jobs[0].id
      })]
    }),
    (error) => error?.code === 'LIFECYCLE_STALE_STATE'
  );

  const post = await repository.getPostOperation(graph.post.id);
  assert.equal(post.caption, 'Original');
  assert.equal(post.publications[0].state, 'SCHEDULED');
  assert.equal(post.publications[0].jobs[0].state, 'RUNNING');
});
