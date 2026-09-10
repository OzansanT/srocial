import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createJsonRepository } from '../server/db/json-repository.js';
import { JOB_STATES } from '../server/scheduler/job-states.js';
import { JOB_TYPES } from '../server/scheduler/job-types.js';
import { PUBLICATION_STATES } from '../server/scheduler/states.js';
import { executeStatusCheckJob } from '../server/scheduler/workers/status-check-worker.js';

async function fixture(run, { publicationState = PUBLICATION_STATES.PROCESSING, attempts = 1 } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'srocial-status-'));
  const repository = createJsonRepository({ filePath: join(directory, 'data.json') });
  await repository.initialize();
  const post = await repository.createPost({ caption: 'Check me', scheduledAt: '2026-09-10T11:00:00.000Z' });
  const publication = await repository.createPublication({
    postId: post.id,
    platform: 'instagram',
    state: publicationState,
    scheduledAt: post.scheduledAt,
    externalId: 'container-1',
    externalUrl: null,
    errorCode: null
  });
  const job = await repository.createJob({
    type: JOB_TYPES.STATUS_CHECK,
    publicationId: publication.id,
    state: JOB_STATES.RUNNING,
    scheduledAt: '2026-09-10T12:00:00.000Z',
    attempts,
    lockedAt: '2026-09-10T12:00:00.000Z',
    lockedBy: 'worker-a'
  });
  try { await run({ repository, publication, job }); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

test('processing status reschedules the same status-check job', async () => {
  await fixture(async ({ repository, publication, job }) => {
    const registry = new Map([['instagram', {
      async getStatus({ publication: input }) {
        assert.equal(input.id, publication.id);
        return { status: 'PROCESSING', externalId: 'container-1' };
      }
    }]]);
    const now = new Date('2026-09-10T12:00:30.000Z');

    await executeStatusCheckJob({ job, repository, registry, now });

    const storedJob = (await repository.listJobs()).find((item) => item.id === job.id);
    assert.equal(storedJob.state, JOB_STATES.SCHEDULED);
    assert.equal(storedJob.scheduledAt, '2026-09-10T12:01:30.000Z');
    assert.equal(storedJob.attempts, 0);
    assert.equal(storedJob.lockedAt, null);
    assert.equal((await repository.getPublication(publication.id)).state, PUBLICATION_STATES.PROCESSING);
  });
});

test('published status completes job and updates publication', async () => {
  await fixture(async ({ repository, publication, job }) => {
    const registry = new Map([['instagram', {
      async getStatus() {
        return { status: 'PUBLISHED', externalId: 'ig-999', externalUrl: 'https://example.test/ig-999' };
      }
    }]]);

    await executeStatusCheckJob({ job, repository, registry, now: new Date('2026-09-10T12:00:30.000Z') });

    const storedPublication = await repository.getPublication(publication.id);
    const storedJob = (await repository.listJobs()).find((item) => item.id === job.id);
    assert.equal(storedPublication.state, PUBLICATION_STATES.PUBLISHED);
    assert.equal(storedPublication.externalId, 'ig-999');
    assert.equal(storedJob.state, JOB_STATES.COMPLETED);
  });
});

test('provider-reported failure updates publication and completes status check', async () => {
  await fixture(async ({ repository, publication, job }) => {
    const registry = new Map([['instagram', {
      async getStatus() {
        return { status: 'FAILED', errorCode: 'CONTENT_REJECTED' };
      }
    }]]);

    await executeStatusCheckJob({ job, repository, registry, now: new Date('2026-09-10T12:00:30.000Z') });

    const storedPublication = await repository.getPublication(publication.id);
    const storedJob = (await repository.listJobs()).find((item) => item.id === job.id);
    assert.equal(storedPublication.state, PUBLICATION_STATES.FAILED);
    assert.equal(storedPublication.errorCode, 'CONTENT_REJECTED');
    assert.equal(storedJob.state, JOB_STATES.COMPLETED);
  });
});

test('terminal publication completes status job without calling adapter', async () => {
  await fixture(async ({ repository, job }) => {
    let calls = 0;
    const registry = new Map([['instagram', { async getStatus() { calls += 1; return { status: 'PROCESSING' }; } }]]);

    await executeStatusCheckJob({ job, repository, registry, now: new Date('2026-09-10T12:00:30.000Z') });

    assert.equal(calls, 0);
    const storedJob = (await repository.listJobs()).find((item) => item.id === job.id);
    assert.equal(storedJob.state, JOB_STATES.COMPLETED);
  }, { publicationState: PUBLICATION_STATES.PUBLISHED });
});

test('retryable status lookup error reschedules with retry policy', async () => {
  await fixture(async ({ repository, publication, job }) => {
    const registry = new Map([['instagram', {
      async getStatus() {
        const error = new Error('timeout');
        error.code = 'NETWORK_ERROR';
        throw error;
      }
    }]]);
    const now = new Date('2026-09-10T12:00:30.000Z');

    await executeStatusCheckJob({ job, repository, registry, now });

    const storedJob = (await repository.listJobs()).find((item) => item.id === job.id);
    assert.equal(storedJob.state, JOB_STATES.RETRYING);
    assert.equal(storedJob.scheduledAt, '2026-09-10T12:05:30.000Z');
    assert.equal(storedJob.errorCode, 'NETWORK_ERROR');
    assert.equal((await repository.getPublication(publication.id)).state, PUBLICATION_STATES.PROCESSING);
  }, { attempts: 2 });
});
