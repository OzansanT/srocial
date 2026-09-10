import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createJsonRepository } from '../server/db/json-repository.js';
import { JOB_STATES } from '../server/scheduler/job-states.js';
import { JOB_TYPES } from '../server/scheduler/job-types.js';
import { PUBLICATION_STATES } from '../server/scheduler/states.js';
import { runSchedulerTick } from '../server/scheduler/run-scheduler-tick.js';

async function withRepository(run) {
  const directory = await mkdtemp(join(tmpdir(), 'srocial-runner-'));
  const repository = createJsonRepository({ filePath: join(directory, 'data.json') });
  await repository.initialize();
  try { await run(repository); } finally { await rm(directory, { recursive: true, force: true }); }
}

async function createDuePublicationJob(repository, { type = JOB_TYPES.SOCIAL_PUBLICATION, publicationState = PUBLICATION_STATES.SCHEDULED } = {}) {
  const post = await repository.createPost({ caption: 'Tick post', scheduledAt: '2026-09-10T11:00:00.000Z' });
  const publication = await repository.createPublication({
    postId: post.id,
    platform: 'instagram',
    state: publicationState,
    scheduledAt: post.scheduledAt,
    externalId: publicationState === PUBLICATION_STATES.PROCESSING ? 'container-1' : null
  });
  const job = await repository.createJob({
    type,
    publicationId: publication.id,
    state: JOB_STATES.SCHEDULED,
    scheduledAt: '2026-09-10T11:59:00.000Z',
    attempts: 0,
    lockedAt: null,
    lockedBy: null
  });
  return { post, publication, job };
}

test('scheduler tick claims, publishes and never processes completed job twice', async () => {
  await withRepository(async (repository) => {
    const { publication } = await createDuePublicationJob(repository);
    let publishCalls = 0;
    const registry = new Map([['instagram', {
      async publish() {
        publishCalls += 1;
        return { status: 'PUBLISHED', externalId: 'ig-tick' };
      }
    }]]);
    const now = new Date('2026-09-10T12:00:00.000Z');

    const first = await runSchedulerTick({ repository, registry, now, workerId: 'runner-a' });
    const second = await runSchedulerTick({ repository, registry, now: new Date('2026-09-10T12:00:01.000Z'), workerId: 'runner-b' });

    assert.equal(first.claimed, 1);
    assert.equal(first.completed, 1);
    assert.equal(first.failed, 0);
    assert.equal(second.claimed, 0);
    assert.equal(publishCalls, 1);
    assert.equal((await repository.getPublication(publication.id)).state, PUBLICATION_STATES.PUBLISHED);
  });
});

test('scheduler tick dispatches status-check jobs to getStatus', async () => {
  await withRepository(async (repository) => {
    const { publication } = await createDuePublicationJob(repository, { type: JOB_TYPES.STATUS_CHECK, publicationState: PUBLICATION_STATES.PROCESSING });
    let publishCalls = 0;
    let statusCalls = 0;
    const registry = new Map([['instagram', {
      async publish() { publishCalls += 1; return { status: 'PUBLISHED' }; },
      async getStatus() { statusCalls += 1; return { status: 'PUBLISHED', externalId: 'ig-status' }; }
    }]]);

    const result = await runSchedulerTick({
      repository,
      registry,
      now: new Date('2026-09-10T12:00:00.000Z'),
      workerId: 'runner-a'
    });

    assert.equal(result.claimed, 1);
    assert.equal(result.completed, 1);
    assert.equal(publishCalls, 0);
    assert.equal(statusCalls, 1);
    assert.equal((await repository.getPublication(publication.id)).externalId, 'ig-status');
  });
});

test('unsupported job type is failed and unlocked instead of crashing the tick', async () => {
  await withRepository(async (repository) => {
    const job = await repository.createJob({
      type: 'UNKNOWN_JOB',
      publicationId: null,
      state: JOB_STATES.SCHEDULED,
      scheduledAt: '2026-09-10T11:00:00.000Z',
      attempts: 0,
      lockedAt: null,
      lockedBy: null
    });

    const result = await runSchedulerTick({
      repository,
      registry: new Map(),
      now: new Date('2026-09-10T12:00:00.000Z'),
      workerId: 'runner-a'
    });

    const stored = (await repository.listJobs()).find((item) => item.id === job.id);
    assert.equal(result.claimed, 1);
    assert.equal(result.failed, 1);
    assert.equal(stored.state, JOB_STATES.FAILED);
    assert.equal(stored.errorCode, 'UNSUPPORTED_JOB_TYPE');
    assert.equal(stored.lockedAt, null);
  });
});
