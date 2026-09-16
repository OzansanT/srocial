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
import { executeStatusCheckJob } from '../server/scheduler/workers/status-check-worker.js';

async function withRepository(run) {
  const directory = await mkdtemp(join(tmpdir(), 'srocial-carousel-state-'));
  const repository = createJsonRepository({ filePath: join(directory, 'data.json') });
  await repository.initialize();
  try { await run(repository); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

async function seed(repository, { publicationState = PUBLICATION_STATES.SCHEDULED, providerOptions = {} } = {}) {
  const post = await repository.createPost({ caption: 'Carousel', scheduledAt: '2026-09-16T11:00:00.000Z' });
  const publication = await repository.createPublication({
    postId: post.id,
    accountId: 'account-1',
    platform: 'instagram',
    state: publicationState,
    scheduledAt: post.scheduledAt,
    providerOptions,
    externalId: null,
    externalUrl: null,
    errorCode: null
  });
  return { post, publication };
}

test('social publication worker persists adapter-returned carousel providerOptions', async () => {
  await withRepository(async (repository) => {
    const { publication } = await seed(repository);
    const job = await repository.createJob({
      type: JOB_TYPES.SOCIAL_PUBLICATION,
      publicationId: publication.id,
      state: JOB_STATES.RUNNING,
      scheduledAt: publication.scheduledAt,
      attempts: 1,
      lockedAt: '2026-09-16T12:00:00.000Z',
      lockedBy: 'worker'
    });
    const workflow = {
      instagramCarousel: {
        stage: 'children',
        caption: 'Carousel',
        children: [{ id: 'child-1', type: 'video' }]
      }
    };
    const registry = new Map([['instagram', {
      async publish() { return { status: 'PROCESSING', externalId: null, providerOptions: workflow }; }
    }]]);

    await executeSocialPublicationJob({ job, repository, registry, now: new Date('2026-09-16T12:00:30.000Z') });
    const stored = await repository.getPublication(publication.id);
    assert.deepEqual(stored.providerOptions, workflow);
    assert.equal(stored.state, PUBLICATION_STATES.PROCESSING);
  });
});

test('status-check worker advances persisted carousel providerOptions with adapter result', async () => {
  await withRepository(async (repository) => {
    const initial = {
      instagramCarousel: {
        stage: 'children',
        caption: 'Carousel',
        children: [{ id: 'child-1', type: 'video' }]
      }
    };
    const { publication } = await seed(repository, { publicationState: PUBLICATION_STATES.PROCESSING, providerOptions: initial });
    const job = await repository.createJob({
      type: JOB_TYPES.STATUS_CHECK,
      publicationId: publication.id,
      state: JOB_STATES.RUNNING,
      scheduledAt: publication.scheduledAt,
      attempts: 1,
      lockedAt: '2026-09-16T12:00:00.000Z',
      lockedBy: 'worker'
    });
    const advanced = {
      instagramCarousel: {
        stage: 'parent',
        caption: 'Carousel',
        parentId: 'parent-1',
        children: [{ id: 'child-1', type: 'video' }]
      }
    };
    const registry = new Map([['instagram', {
      async getStatus({ publication: input }) {
        assert.deepEqual(input.providerOptions, initial);
        return { status: 'PROCESSING', externalId: 'parent-1', providerOptions: advanced };
      }
    }]]);

    await executeStatusCheckJob({ job, repository, registry, now: new Date('2026-09-16T12:01:30.000Z') });
    const stored = await repository.getPublication(publication.id);
    assert.deepEqual(stored.providerOptions, advanced);
    assert.equal(stored.externalId, 'parent-1');
  });
});
