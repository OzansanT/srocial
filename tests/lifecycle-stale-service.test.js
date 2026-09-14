import test from 'node:test';
import assert from 'node:assert/strict';
import { cancelPostLifecycle } from '../server/services/post-lifecycle-service.js';

const post = {
  id: 'post-1',
  caption: 'Race',
  scheduledAt: '2026-09-15T12:00:00.000Z',
  media: [],
  publications: [{
    id: 'pub-1',
    postId: 'post-1',
    platform: 'instagram',
    accountId: null,
    state: 'SCHEDULED',
    externalId: null,
    scheduledAt: '2026-09-15T12:00:00.000Z',
    jobs: [{
      id: 'job-1',
      type: 'SOCIAL_PUBLICATION',
      publicationId: 'pub-1',
      state: 'SCHEDULED',
      scheduledAt: '2026-09-15T12:00:00.000Z'
    }]
  }]
};

test('service maps repository-time stale lifecycle state to a safe conflict', async () => {
  const repository = {
    async getPostOperation() { return structuredClone(post); },
    async applyPostLifecycleMutations() {
      const error = new Error('scheduler won race');
      error.code = 'LIFECYCLE_STALE_STATE';
      throw error;
    }
  };

  await assert.rejects(
    () => cancelPostLifecycle({ repository, postId: 'post-1', now: new Date('2026-09-14T12:00:00.000Z') }),
    (error) => error?.code === 'LIFECYCLE_CONFLICT' && error?.reason === 'stale_state'
  );
});
