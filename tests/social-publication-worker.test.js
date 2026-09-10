import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createJsonRepository } from '../server/db/json-repository.js';
import { JOB_STATES } from '../server/scheduler/job-states.js';
import { JOB_TYPES } from '../server/scheduler/job-types.js';
import { PUBLICATION_STATES } from '../server/scheduler/states.js';
import { executeSocialPublicationJob } from '../server/scheduler/workers/social-publication-worker.js';

async function fixture(run, { publicationState = PUBLICATION_STATES.SCHEDULED, attempts = 1 } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'srocial-worker-'));
  const repository = createJsonRepository({ filePath: join(directory, 'data.json') });
  await repository.initialize();
  const post = await repository.createPost({ caption: 'Publish me', scheduledAt: '2026-09-10T11:00:00.000Z' });
  const publication = await repository.createPublication({
    postId: post.id,
    platform: 'instagram',
    state: publicationState,
    scheduledAt: post.scheduledAt,
    externalId: publicationState === PUBLICATION_STATES.PUBLISHED ? 'already-1' : null,
    externalUrl: null,
    errorCode: null
  });
  const job = await repository.createJob({
    type: JOB_TYPES.SOCIAL_PUBLICATION,
    publicationId: publication.id,
    state: JOB_STATES.RUNNING,
    scheduledAt: post.scheduledAt,
    attempts,
    lockedAt: '2026-09-10T12:00:00.000Z',
    lockedBy: 'worker-a'
  });
  try { await run({ repository, post, publication, job }); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

test('publishes once with stable idempotency key and completes the job', async () => {
  await fixture(async ({ repository, publication, job }) => {
    let calls = 0;
    const registry = new Map([['instagram', {
      async publish(payload, options) {
        calls += 1;
        assert.equal(payload.publication.id, publication.id);
        assert.equal(payload.post.caption, 'Publish me');
        assert.equal(options.idempotencyKey, publication.id);
        return { status: 'PUBLISHED', externalId: 'ig-123', externalUrl: 'https://example.test/ig-123' };
      }
    }]]);

    await executeSocialPublicationJob({ job, repository, registry, now: new Date('2026-09-10T12:00:30.000Z') });

    const storedPublication = await repository.getPublication(publication.id);
    const storedJob = (await repository.listJobs()).find((item) => item.id === job.id);
    assert.equal(calls, 1);
    assert.equal(storedPublication.state, PUBLICATION_STATES.PUBLISHED);
    assert.equal(storedPublication.externalId, 'ig-123');
    assert.equal(storedJob.state, JOB_STATES.COMPLETED);
    assert.equal(storedJob.lockedAt, null);
    assert.equal(storedJob.lockedBy, null);
  });
});

test('processing result creates one follow-up status-check job', async () => {
  await fixture(async ({ repository, publication, job }) => {
    let calls = 0;
    const registry = new Map([['instagram', {
      async publish() {
        calls += 1;
        return { status: 'PROCESSING', externalId: 'container-1', externalUrl: null };
      }
    }]]);
    const now = new Date('2026-09-10T12:00:30.000Z');

    await executeSocialPublicationJob({ job, repository, registry, now });
    await executeSocialPublicationJob({ job, repository, registry, now: new Date('2026-09-10T12:00:31.000Z') });

    const storedPublication = await repository.getPublication(publication.id);
    const jobs = await repository.listJobs();
    const checks = jobs.filter((item) => item.type === JOB_TYPES.STATUS_CHECK && item.publicationId === publication.id);
    assert.equal(calls, 1);
    assert.equal(storedPublication.state, PUBLICATION_STATES.PROCESSING);
    assert.equal(checks.length, 1);
    assert.equal(checks[0].state, JOB_STATES.SCHEDULED);
    assert.equal(checks[0].scheduledAt, '2026-09-10T12:01:30.000Z');
  });
});

test('already published publication completes without calling adapter again', async () => {
  await fixture(async ({ repository, publication, job }) => {
    let calls = 0;
    const registry = new Map([['instagram', { async publish() { calls += 1; throw new Error('must not run'); } }]]);

    await executeSocialPublicationJob({ job, repository, registry, now: new Date('2026-09-10T12:00:30.000Z') });

    const storedJob = (await repository.listJobs()).find((item) => item.id === job.id);
    assert.equal(calls, 0);
    assert.equal((await repository.getPublication(publication.id)).externalId, 'already-1');
    assert.equal(storedJob.state, JOB_STATES.COMPLETED);
  }, { publicationState: PUBLICATION_STATES.PUBLISHED });
});

test('retryable provider error reschedules and unlocks the same job', async () => {
  await fixture(async ({ repository, publication, job }) => {
    const registry = new Map([['instagram', {
      async publish() {
        const error = new Error('slow down');
        error.code = 'RATE_LIMIT';
        throw error;
      }
    }]]);
    const now = new Date('2026-09-10T12:00:30.000Z');

    await executeSocialPublicationJob({ job, repository, registry, now });

    const storedJob = (await repository.listJobs()).find((item) => item.id === job.id);
    const storedPublication = await repository.getPublication(publication.id);
    assert.equal(storedJob.state, JOB_STATES.RETRYING);
    assert.equal(storedJob.scheduledAt, '2026-09-10T12:05:30.000Z');
    assert.equal(storedJob.lockedAt, null);
    assert.equal(storedJob.errorCode, 'RATE_LIMIT');
    assert.equal(storedPublication.state, PUBLICATION_STATES.RATE_LIMITED);
    assert.equal(storedPublication.errorCode, 'RATE_LIMIT');
  }, { attempts: 2 });
});

test('permanent authentication error fails job and records publication state', async () => {
  await fixture(async ({ repository, publication, job }) => {
    const registry = new Map([['instagram', {
      async publish() {
        const error = new Error('reconnect');
        error.code = 'AUTH_ERROR';
        throw error;
      }
    }]]);

    await executeSocialPublicationJob({ job, repository, registry, now: new Date('2026-09-10T12:00:30.000Z') });

    const storedJob = (await repository.listJobs()).find((item) => item.id === job.id);
    const storedPublication = await repository.getPublication(publication.id);
    assert.equal(storedJob.state, JOB_STATES.FAILED);
    assert.equal(storedJob.errorCode, 'AUTH_ERROR');
    assert.equal(storedPublication.state, PUBLICATION_STATES.AUTH_ERROR);
    assert.equal(storedPublication.errorCode, 'AUTH_ERROR');
  });
});
