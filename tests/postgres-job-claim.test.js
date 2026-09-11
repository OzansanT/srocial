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
const schema = 'test_claim_v10';
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

async function createPublicationAndJob({
  state = 'SCHEDULED',
  scheduledAt = '2026-09-11T09:00:00.000Z',
  lockedAt = null,
  lockedBy = null,
  attempts = 0
} = {}) {
  const timestamp = '2026-09-11T08:00:00.000Z';
  const post = await repository.createPost({ caption: 'claim test', scheduledAt, createdAt: timestamp, updatedAt: timestamp });
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
  return repository.createJob({
    type: 'SOCIAL_PUBLICATION',
    publicationId: publication.id,
    campaignId: null,
    accountId: null,
    state,
    scheduledAt,
    attempts,
    lockedAt,
    lockedBy,
    errorCode: null,
    createdAt: timestamp,
    updatedAt: timestamp
  });
}


test('concurrent PostgreSQL claims return each due job to at most one worker', { skip: !enabled }, async () => {
  const jobs = [];
  for (let index = 0; index < 6; index += 1) jobs.push(await createPublicationAndJob());

  const now = new Date('2026-09-11T10:00:00.000Z');
  const workerA = createPostgresRepository({ pool });
  const workerB = createPostgresRepository({ pool });
  const [claimedA, claimedB] = await Promise.all([
    workerA.claimDueJobs({ now, workerId: 'worker-a', limit: 6, lockTimeoutMs: 120000 }),
    workerB.claimDueJobs({ now, workerId: 'worker-b', limit: 6, lockTimeoutMs: 120000 })
  ]);

  const ids = [...claimedA, ...claimedB].map((job) => job.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(new Set(ids), new Set(jobs.map((job) => job.id)));
  for (const job of [...claimedA, ...claimedB]) {
    assert.equal(job.state, 'RUNNING');
    assert.equal(job.attempts, 1);
    assert.equal(job.lockedAt, now.toISOString());
    assert.match(job.lockedBy, /^worker-[ab]$/);
  }
});


test('PostgreSQL claims due scheduled jobs and stale running jobs but preserves fresh locks and future jobs', { skip: !enabled }, async () => {
  const due = await createPublicationAndJob({ state: 'SCHEDULED' });
  const stale = await createPublicationAndJob({
    state: 'RUNNING',
    lockedAt: '2026-09-11T09:55:00.000Z',
    lockedBy: 'dead-worker',
    attempts: 2
  });
  const fresh = await createPublicationAndJob({
    state: 'RUNNING',
    lockedAt: '2026-09-11T09:59:30.000Z',
    lockedBy: 'active-worker',
    attempts: 1
  });
  const future = await createPublicationAndJob({
    state: 'SCHEDULED',
    scheduledAt: '2026-09-11T11:00:00.000Z'
  });

  const now = new Date('2026-09-11T10:00:00.000Z');
  const claimed = await repository.claimDueJobs({ now, workerId: 'recovery-worker', limit: 10, lockTimeoutMs: 120000 });
  assert.deepEqual(new Set(claimed.map((job) => job.id)), new Set([due.id, stale.id]));

  const staleClaim = claimed.find((job) => job.id === stale.id);
  assert.equal(staleClaim.attempts, 3);
  assert.equal(staleClaim.lockedBy, 'recovery-worker');
  assert.equal(staleClaim.lockedAt, now.toISOString());

  const jobs = await repository.listJobs();
  const freshStored = jobs.find((job) => job.id === fresh.id);
  const futureStored = jobs.find((job) => job.id === future.id);
  assert.equal(freshStored.lockedBy, 'active-worker');
  assert.equal(futureStored.state, 'SCHEDULED');
});


test('PostgreSQL claim validation matches the JSON repository contract', { skip: !enabled }, async () => {
  await assert.rejects(
    () => repository.claimDueJobs({ now: new Date(), workerId: '   ' }),
    /workerId is required/
  );
  assert.deepEqual(await repository.claimDueJobs({ now: new Date(), workerId: 'worker', limit: 0 }), []);
});
