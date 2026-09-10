import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createJsonRepository } from '../server/db/json-repository.js';
import { JOB_STATES } from '../server/scheduler/job-states.js';

async function withRepository(run) {
  const directory = await mkdtemp(join(tmpdir(), 'srocial-claim-'));
  const repository = createJsonRepository({ filePath: join(directory, 'data.json') });
  await repository.initialize();
  try { await run(repository); } finally { await rm(directory, { recursive: true, force: true }); }
}

test('concurrent claims return a due job to only one worker', async () => {
  await withRepository(async (repository) => {
    const now = new Date('2026-09-10T12:00:00.000Z');
    const job = await repository.createJob({
      type: 'SOCIAL_PUBLICATION',
      publicationId: 'pub-1',
      state: JOB_STATES.SCHEDULED,
      scheduledAt: '2026-09-10T11:59:00.000Z',
      attempts: 0,
      lockedAt: null,
      lockedBy: null
    });

    const [first, second] = await Promise.all([
      repository.claimDueJobs({ now, workerId: 'worker-a', limit: 10, lockTimeoutMs: 120000 }),
      repository.claimDueJobs({ now, workerId: 'worker-b', limit: 10, lockTimeoutMs: 120000 })
    ]);

    assert.equal(first.length + second.length, 1);
    const claimed = first[0] ?? second[0];
    assert.equal(claimed.id, job.id);
    assert.equal(claimed.state, JOB_STATES.RUNNING);
    assert.equal(claimed.attempts, 1);
    assert.ok(['worker-a', 'worker-b'].includes(claimed.lockedBy));

    const stored = (await repository.listJobs()).find((item) => item.id === job.id);
    assert.equal(stored.state, JOB_STATES.RUNNING);
    assert.equal(stored.attempts, 1);
  });
});

test('reclaims a stale running job after lock timeout', async () => {
  await withRepository(async (repository) => {
    const now = new Date('2026-09-10T12:10:00.000Z');
    const job = await repository.createJob({
      type: 'SOCIAL_PUBLICATION',
      publicationId: 'pub-1',
      state: JOB_STATES.RUNNING,
      scheduledAt: '2026-09-10T12:00:00.000Z',
      attempts: 2,
      lockedAt: '2026-09-10T12:00:00.000Z',
      lockedBy: 'dead-worker'
    });

    const claimed = await repository.claimDueJobs({ now, workerId: 'worker-new', limit: 1, lockTimeoutMs: 120000 });

    assert.equal(claimed.length, 1);
    assert.equal(claimed[0].id, job.id);
    assert.equal(claimed[0].attempts, 3);
    assert.equal(claimed[0].lockedBy, 'worker-new');
    assert.equal(claimed[0].lockedAt, now.toISOString());
  });
});

test('updates and retrieves jobs, publications and posts defensively', async () => {
  await withRepository(async (repository) => {
    const post = await repository.createPost({ caption: 'A', scheduledAt: '2026-09-11T00:00:00.000Z' });
    const publication = await repository.createPublication({ postId: post.id, platform: 'instagram', state: 'SCHEDULED', scheduledAt: post.scheduledAt });
    const job = await repository.createJob({ type: 'SOCIAL_PUBLICATION', publicationId: publication.id, state: JOB_STATES.SCHEDULED, scheduledAt: post.scheduledAt, attempts: 0 });

    const updatedPublication = await repository.updatePublication(publication.id, { state: 'PROCESSING', externalId: 'ext-1' });
    const updatedJob = await repository.updateJob(job.id, { state: JOB_STATES.COMPLETED, lockedAt: null, lockedBy: null });

    assert.equal((await repository.getPost(post.id)).caption, 'A');
    assert.equal((await repository.getPublication(publication.id)).externalId, 'ext-1');
    assert.equal(updatedPublication.state, 'PROCESSING');
    assert.equal(updatedJob.state, JOB_STATES.COMPLETED);

    updatedPublication.state = 'MUTATED';
    assert.equal((await repository.getPublication(publication.id)).state, 'PROCESSING');
  });
});
