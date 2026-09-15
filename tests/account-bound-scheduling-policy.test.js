import test from 'node:test';
import assert from 'node:assert/strict';
import { createScheduledPost } from '../server/services/post-service.js';

const now = new Date('2026-09-15T12:00:00.000Z');
const scheduledAt = '2026-09-16T12:00:00.000Z';

function createRepository() {
  const calls = [];
  return {
    calls,
    async createSocialScheduleGraph(graph) {
      calls.push(structuredClone(graph));
      return {
        post: { id: 'post-1', ...structuredClone(graph.post) },
        media: [],
        publications: graph.publicationPlans.map((plan, index) => ({
          id: `publication-${index + 1}`,
          ...structuredClone(plan.publication)
        })),
        jobs: graph.publicationPlans.map((plan, index) => ({
          id: `job-${index + 1}`,
          ...structuredClone(plan.job)
        }))
      };
    },
    async getAccount() {
      return null;
    }
  };
}

test('rejects legacy platforms-only scheduling by default before persistence', async () => {
  const repository = createRepository();

  await assert.rejects(
    () => createScheduledPost(repository, {
      caption: 'Legacy request',
      platforms: ['facebook'],
      scheduledAt
    }, { now }),
    (error) => {
      assert.equal(error.code, 'VALIDATION_ERROR');
      assert.ok(error.details.some((item) => item.field === 'destinations' && /account-bound destinations/i.test(item.message)));
      return true;
    }
  );

  assert.equal(repository.calls.length, 0);
});

test('explicit compatibility opt-in keeps legacy platforms-only scheduling isolated', async () => {
  const repository = createRepository();

  const result = await createScheduledPost(repository, {
    caption: 'Legacy compatibility request',
    platforms: ['facebook'],
    scheduledAt
  }, { now, allowLegacyPlatforms: true });

  assert.equal(repository.calls.length, 1);
  assert.equal(result.publications.length, 1);
  assert.equal(result.publications[0].platform, 'facebook');
  assert.equal(result.publications[0].accountId, null);
  assert.equal(result.jobs[0].accountId, null);
});
