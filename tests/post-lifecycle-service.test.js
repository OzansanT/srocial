import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bulkCancelPostLifecycle,
  bulkReschedulePostLifecycle,
  cancelPostLifecycle,
  duplicatePostLifecycle,
  listPostOperations,
  retryPublicationLifecycle,
  updatePostLifecycle
} from '../server/services/post-lifecycle-service.js';

const NOW = new Date('2026-09-14T12:00:00.000Z');
const FUTURE = '2026-09-14T15:00:00.000Z';
const LATER = '2026-09-15T16:30:00.000Z';

function fixture({ posts = null, accounts = null } = {}) {
  const records = posts ? structuredClone(posts) : [{
    id: 'post-1', caption: 'Original', scheduledAt: FUTURE,
    media: [{ id: 'media-1', postId: 'post-1', type: 'image', url: 'https://cdn.example.test/a.jpg', sortOrder: 0 }],
    publications: [{
      id: 'pub-1', postId: 'post-1', accountId: 'acc-1', platform: 'instagram', state: 'SCHEDULED',
      scheduledAt: FUTURE, providerOptions: {}, externalId: null, errorCode: null,
      jobs: [{ id: 'job-1', type: 'SOCIAL_PUBLICATION', publicationId: 'pub-1', state: 'SCHEDULED', scheduledAt: FUTURE, attempts: 0, lockedAt: null, lockedBy: null, errorCode: null }]
    }]
  }];
  const accountRecords = accounts ? structuredClone(accounts) : [{ id: 'acc-1', provider: 'instagram', state: 'CONNECTED' }];
  let mutationCalls = 0;
  let duplicateGraphs = 0;

  function operationByPostId(id) { return records.find((item) => item.id === id) ?? null; }
  function operationByPublicationId(id) {
    for (const post of records) {
      const publication = post.publications.find((item) => item.id === id);
      if (publication) return { post, publication };
    }
    return null;
  }

  function applyPatch(item, patch) { Object.assign(item, structuredClone(patch)); }

  return {
    records,
    get mutationCalls() { return mutationCalls; },
    get duplicateGraphs() { return duplicateGraphs; },
    async listPostOperations() { return structuredClone(records); },
    async getPostOperation(id) { return structuredClone(operationByPostId(id)); },
    async getPublicationOperation(id) {
      const result = operationByPublicationId(id);
      return result ? structuredClone(result) : null;
    },
    async applyPostLifecycleMutations({ mutations }) {
      mutationCalls += 1;
      for (const mutation of mutations) {
        const post = operationByPostId(mutation.postId);
        if (!post) throw new Error('TEST_POST_NOT_FOUND');
        if (mutation.postPatch) applyPatch(post, mutation.postPatch);
        for (const { id, patch } of mutation.publicationPatches ?? []) {
          const publication = post.publications.find((item) => item.id === id);
          if (!publication) throw new Error('TEST_PUBLICATION_NOT_FOUND');
          applyPatch(publication, patch);
        }
        for (const { id, patch } of mutation.jobPatches ?? []) {
          const job = post.publications.flatMap((item) => item.jobs).find((item) => item.id === id);
          if (!job) throw new Error('TEST_JOB_NOT_FOUND');
          applyPatch(job, patch);
        }
      }
      return structuredClone(mutations.map((mutation) => operationByPostId(mutation.postId)));
    },
    async getAccount(id) { return structuredClone(accountRecords.find((item) => item.id === id) ?? null); },
    async createSocialScheduleGraph({ post, media = [], publicationPlans = [] }) {
      duplicateGraphs += 1;
      const postId = `post-${records.length + 1}`;
      const created = {
        id: postId,
        ...structuredClone(post),
        media: media.map((item, index) => ({ id: `media-new-${index + 1}`, ...structuredClone(item), postId })),
        publications: publicationPlans.map((plan, index) => {
          const publicationId = `pub-new-${index + 1}`;
          return {
            id: publicationId,
            ...structuredClone(plan.publication),
            postId,
            jobs: [{ id: `job-new-${index + 1}`, ...structuredClone(plan.job), publicationId, campaignId: null }]
          };
        })
      };
      records.push(created);
      return {
        post: structuredClone({ ...created, media: undefined, publications: undefined }),
        media: structuredClone(created.media),
        publications: structuredClone(created.publications.map(({ jobs, ...publication }) => publication)),
        jobs: structuredClone(created.publications.flatMap((publication) => publication.jobs))
      };
    }
  };
}

function failedPost({ externalId = null } = {}) {
  return [{
    id: 'post-1', caption: 'Failed', scheduledAt: FUTURE, media: [],
    publications: [{
      id: 'pub-1', postId: 'post-1', accountId: 'acc-1', platform: 'facebook', state: 'FAILED',
      scheduledAt: FUTURE, providerOptions: {}, externalId, errorCode: 'PROVIDER_ERROR',
      jobs: [{ id: 'job-1', type: 'SOCIAL_PUBLICATION', publicationId: 'pub-1', state: 'FAILED', scheduledAt: FUTURE, attempts: 3, lockedAt: null, lockedBy: null, errorCode: 'PROVIDER_ERROR' }]
    }]
  }];
}

test('operator list filters by platform, account, state and time range', async () => {
  const repository = fixture({ posts: [
    { id: 'a', caption: 'A', scheduledAt: '2026-09-14T15:00:00.000Z', media: [], publications: [{ id: 'pa', platform: 'instagram', accountId: 'ig', state: 'SCHEDULED', jobs: [] }] },
    { id: 'b', caption: 'B', scheduledAt: '2026-09-16T15:00:00.000Z', media: [], publications: [{ id: 'pb', platform: 'facebook', accountId: 'fb', state: 'FAILED', jobs: [] }] }
  ] });
  const posts = await listPostOperations(repository, {
    platform: 'instagram', accountId: 'ig', state: 'scheduled',
    from: '2026-09-14T00:00:00.000Z', until: '2026-09-15T00:00:00.000Z'
  });
  assert.deepEqual(posts.map((item) => item.id), ['a']);
});

test('edit caption and reschedule update post, publications and jobs atomically', async () => {
  const repository = fixture();
  const result = await updatePostLifecycle({
    repository, postId: 'post-1', input: { caption: ' Revised ', scheduledAt: LATER }, now: NOW
  });
  assert.equal(repository.mutationCalls, 1);
  assert.equal(result.caption, 'Revised');
  assert.equal(result.scheduledAt, LATER);
  assert.equal(result.publications[0].scheduledAt, LATER);
  assert.equal(result.publications[0].jobs[0].scheduledAt, LATER);
});

test('edit/reschedule fail closed once a social job is running', async () => {
  const repository = fixture();
  repository.records[0].publications[0].jobs[0].state = 'RUNNING';
  await assert.rejects(() => updatePostLifecycle({ repository, postId: 'post-1', input: { caption: 'Unsafe' }, now: NOW }), (error) => {
    assert.equal(error.code, 'LIFECYCLE_CONFLICT');
    assert.equal(error.reason, 'job_running');
    return true;
  });
  assert.equal(repository.mutationCalls, 0);
});

test('cancel moves scheduled publications and publication jobs to CANCELLED', async () => {
  const repository = fixture();
  const result = await cancelPostLifecycle({ repository, postId: 'post-1', now: NOW });
  assert.equal(result.publications[0].state, 'CANCELLED');
  assert.equal(result.publications[0].jobs[0].state, 'CANCELLED');
  assert.equal(repository.mutationCalls, 1);
});

test('cancel rejects provider external IDs because external side effects may exist', async () => {
  const repository = fixture();
  repository.records[0].publications[0].externalId = 'provider-123';
  await assert.rejects(() => cancelPostLifecycle({ repository, postId: 'post-1', now: NOW }), (error) => {
    assert.equal(error.code, 'LIFECYCLE_CONFLICT');
    assert.equal(error.reason, 'unsafe_external_id');
    return true;
  });
  assert.equal(repository.mutationCalls, 0);
});

test('retry safely resets a failed publication and existing job', async () => {
  const repository = fixture({ posts: failedPost() });
  const result = await retryPublicationLifecycle({ repository, publicationId: 'pub-1', input: { scheduledAt: LATER }, now: NOW });
  assert.equal(result.publication.state, 'SCHEDULED');
  assert.equal(result.publication.errorCode, null);
  assert.equal(result.publication.jobs[0].state, 'SCHEDULED');
  assert.equal(result.publication.jobs[0].attempts, 0);
  assert.equal(result.publication.jobs[0].scheduledAt, LATER);
});

test('retry rejects failed publications that already have an external provider id', async () => {
  const repository = fixture({ posts: failedPost({ externalId: 'external-1' }) });
  await assert.rejects(() => retryPublicationLifecycle({ repository, publicationId: 'pub-1', input: {}, now: NOW }), (error) => {
    assert.equal(error.code, 'LIFECYCLE_CONFLICT');
    assert.equal(error.reason, 'unsafe_external_id');
    return true;
  });
  assert.equal(repository.mutationCalls, 0);
});

test('duplicate reuses normal scheduling validation and rechecks connected account', async () => {
  const repository = fixture({ accounts: [{ id: 'acc-1', provider: 'instagram', state: 'DISCONNECTED' }] });
  await assert.rejects(() => duplicatePostLifecycle({ repository, postId: 'post-1', input: { scheduledAt: LATER }, now: NOW }), (error) => error.code === 'VALIDATION_ERROR');
  assert.equal(repository.duplicateGraphs, 0);
});

test('bulk cancel validates the complete set before making one atomic mutation call', async () => {
  const repository = fixture({ posts: [
    { id: 'safe', caption: 'Safe', scheduledAt: FUTURE, media: [], publications: [{ id: 'safe-p', platform: 'facebook', state: 'SCHEDULED', externalId: null, jobs: [{ id: 'safe-j', type: 'SOCIAL_PUBLICATION', state: 'SCHEDULED' }] }] },
    { id: 'unsafe', caption: 'Unsafe', scheduledAt: FUTURE, media: [], publications: [{ id: 'unsafe-p', platform: 'facebook', state: 'PUBLISHED', externalId: 'external', jobs: [{ id: 'unsafe-j', type: 'SOCIAL_PUBLICATION', state: 'COMPLETED' }] }] }
  ] });
  await assert.rejects(() => bulkCancelPostLifecycle({ repository, postIds: ['safe', 'unsafe'], now: NOW }), (error) => error.code === 'LIFECYCLE_CONFLICT');
  assert.equal(repository.mutationCalls, 0);
  assert.equal(repository.records[0].publications[0].state, 'SCHEDULED');
});

test('bulk reschedule moves all selected safe posts in one atomic mutation call', async () => {
  const base = (id) => ({ id, caption: id, scheduledAt: FUTURE, media: [], publications: [{ id: `${id}-p`, platform: 'facebook', state: 'SCHEDULED', externalId: null, jobs: [{ id: `${id}-j`, type: 'SOCIAL_PUBLICATION', state: 'SCHEDULED', scheduledAt: FUTURE }] }] });
  const repository = fixture({ posts: [base('one'), base('two')] });
  const result = await bulkReschedulePostLifecycle({ repository, postIds: ['one', 'two'], scheduledAt: LATER, now: NOW });
  assert.equal(repository.mutationCalls, 1);
  assert.equal(result.length, 2);
  assert.ok(result.every((post) => post.scheduledAt === LATER));
});
