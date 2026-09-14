import test from 'node:test';
import assert from 'node:assert/strict';
import { createScheduledPost } from '../server/services/post-service.js';

const NOW = new Date('2026-09-14T13:00:00.000Z');

function repositoryFixture() {
  let captured = null;
  const accounts = new Map([
    ['fb-1', { id: 'fb-1', provider: 'facebook', state: 'CONNECTED' }],
    ['ig-1', { id: 'ig-1', provider: 'instagram', state: 'CONNECTED' }]
  ]);
  return {
    repository: {
      getAccount: async (id) => accounts.get(id) ?? null,
      createSocialScheduleGraph: async (graph) => { captured = structuredClone(graph); return graph; }
    },
    captured: () => captured
  };
}

test('scheduling persists caption and explicit empty-media overrides on the matching publication', async () => {
  const fixture = repositoryFixture();
  await createScheduledPost(fixture.repository, {
    caption: 'Base caption',
    scheduledAt: '2026-09-15T10:00:00.000Z',
    media: [{ type: 'image', url: 'https://cdn.example.com/base.jpg' }],
    destinations: [
      { platform: 'instagram', accountId: 'ig-1' },
      { platform: 'facebook', accountId: 'fb-1', captionOverride: 'Facebook text only', mediaOverride: [] }
    ]
  }, { now: NOW });

  const graph = fixture.captured();
  const instagram = graph.publicationPlans.find((item) => item.publication.platform === 'instagram').publication;
  const facebook = graph.publicationPlans.find((item) => item.publication.platform === 'facebook').publication;
  assert.equal(instagram.captionOverride, null);
  assert.equal(instagram.mediaOverride, null);
  assert.equal(facebook.captionOverride, 'Facebook text only');
  assert.deepEqual(facebook.mediaOverride, []);
});

test('effective destination media is validated independently of base media', async () => {
  const fixture = repositoryFixture();
  await assert.rejects(() => createScheduledPost(fixture.repository, {
    caption: 'Base',
    scheduledAt: '2026-09-15T10:00:00.000Z',
    media: [{ type: 'image', url: 'https://cdn.example.com/base.jpg' }],
    destinations: [
      { platform: 'instagram', accountId: 'ig-1', mediaOverride: [] }
    ]
  }, { now: NOW }), (error) => error?.code === 'VALIDATION_ERROR');
});