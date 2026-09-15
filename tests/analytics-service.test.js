import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnalyticsService } from '../server/services/analytics-service.js';

function snapshot(overrides = {}) {
  return {
    id: overrides.id ?? crypto.randomUUID(), publicationId: 'pub-1', accountId: 'acc-1', provider: 'instagram', externalId: 'ext-1',
    views: 100, reach: 80, likes: 10, comments: 2, shares: 1, saves: 3, extraMetrics: {},
    capturedAt: '2026-09-14T10:00:00.000Z', ...overrides
  };
}

function reportRepository(snapshots) {
  return {
    listPublicationMetricSnapshots: async () => snapshots,
    listAccounts: async () => [{ id: 'acc-1', provider: 'instagram', displayName: 'IG Main', state: 'CONNECTED' }],
    listPostsWithPublications: async () => [
      { id: 'post-1', caption: 'First post', scheduledAt: '2026-09-10T12:00:00.000Z', publications: [{ id: 'pub-1', accountId: 'acc-1', platform: 'instagram', state: 'PUBLISHED', externalId: 'ext-1', scheduledAt: '2026-09-10T12:00:00.000Z' }] },
      { id: 'post-2', caption: 'Second post', scheduledAt: '2026-09-11T12:00:00.000Z', publications: [{ id: 'pub-2', accountId: 'acc-1', platform: 'instagram', state: 'PUBLISHED', externalId: 'ext-2', scheduledAt: '2026-09-11T12:00:00.000Z' }] }
    ]
  };
}

test('analytics report uses only latest snapshot per publication and returns KPI series/posts', async () => {
  const snapshots = [
    snapshot({ id: 'old', views: 50, capturedAt: '2026-09-13T10:00:00.000Z' }),
    snapshot({ id: 'latest', views: 120, reach: 90, likes: 12, comments: 4, shares: 2, saves: 5, capturedAt: '2026-09-14T10:00:00.000Z' }),
    snapshot({ id: 'pub2', publicationId: 'pub-2', externalId: 'ext-2', views: 80, reach: null, likes: 8, comments: 1, shares: null, saves: null, capturedAt: '2026-09-14T11:00:00.000Z' })
  ];
  const service = createAnalyticsService({ repository: reportRepository(snapshots), analyticsRegistry: new Map() });
  const report = await service.report({ platform: 'instagram', from: '2026-09-01', until: '2026-09-30' });
  assert.deepEqual(report.summary, { views: 200, reach: 90, likes: 20, comments: 5, shares: 2, saves: 5 });
  assert.equal(report.posts.length, 2);
  assert.equal(report.posts[0].metrics.views, 120);
  assert.equal(report.series.length, 2);
  assert.equal(report.freshness.newestCapturedAt, '2026-09-14T11:00:00.000Z');
});

test('refresh validates published account-bound publication and persists normalized adapter metrics once', async () => {
  const written = [];
  const repository = {
    getPublication: async () => ({ id: 'pub-1', postId: 'post-1', accountId: 'acc-1', platform: 'tiktok', state: 'PUBLISHED', externalId: 'video-1', scheduledAt: '2026-09-10T12:00:00.000Z' }),
    getAccount: async () => ({ id: 'acc-1', provider: 'tiktok', state: 'CONNECTED' }),
    createPublicationMetricSnapshot: async (record) => { written.push(record); return { id: 'snap-1', ...record }; }
  };
  const analyticsRegistry = new Map([['tiktok', { getMetrics: async () => ({ views: 40, reach: null, likes: 5, comments: 1, shares: 2, saves: null, extraMetrics: {} }) }]]);
  const service = createAnalyticsService({ repository, analyticsRegistry });
  const result = await service.refreshPublication('pub-1', { now: new Date('2026-09-14T12:00:00.000Z') });
  assert.equal(result.views, 40);
  assert.equal(written.length, 1);
  assert.equal(written[0].provider, 'tiktok');
});

test('provider failure writes no analytics snapshot', async () => {
  let writes = 0;
  const repository = {
    getPublication: async () => ({ id: 'pub-1', accountId: 'acc-1', platform: 'instagram', state: 'PUBLISHED', externalId: 'ig-1' }),
    getAccount: async () => ({ id: 'acc-1', provider: 'instagram', state: 'CONNECTED' }),
    createPublicationMetricSnapshot: async () => { writes += 1; }
  };
  const analyticsRegistry = new Map([['instagram', { getMetrics: async () => { const error = new Error('raw provider secret'); error.code = 'PERMISSION_DENIED'; throw error; } }]]);
  const service = createAnalyticsService({ repository, analyticsRegistry });
  await assert.rejects(service.refreshPublication('pub-1'), (error) => error?.code === 'PERMISSION_DENIED' && !error.message.includes('raw provider secret'));
  assert.equal(writes, 0);
});