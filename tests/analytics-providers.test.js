import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnalyticsRegistry, registerAnalyticsProvider } from '../server/analytics/registry.js';
import { createInstagramAnalyticsAdapter } from '../server/platforms/instagram/analytics.js';
import { createFacebookAnalyticsAdapter } from '../server/platforms/facebook/analytics.js';
import { createThreadsAnalyticsAdapter } from '../server/platforms/threads/analytics.js';
import { createTikTokAnalyticsAdapter } from '../server/platforms/tiktok/analytics.js';
import { INSTAGRAM_SCOPES } from '../server/platforms/instagram/config.js';
import { THREADS_SCOPES } from '../server/platforms/threads/config.js';
import { getTikTokConfig } from '../server/platforms/tiktok/config.js';

test('analytics registry normalizes provider names and rejects duplicates', () => {
  const registry = createAnalyticsRegistry();
  const adapter = { getMetrics() {} };
  registerAnalyticsProvider(registry, 'Instagram', adapter);
  assert.equal(registry.get('instagram'), adapter);
  assert.throws(() => registerAnalyticsProvider(registry, 'instagram', adapter), /already registered/i);
});

test('Instagram analytics normalizes insight values', async () => {
  const calls = [];
  const adapter = createInstagramAnalyticsAdapter({
    client: { getGraph: async (path, options) => { calls.push({ path, options }); return { data: [
      { name: 'views', values: [{ value: 120 }] }, { name: 'reach', values: [{ value: 90 }] },
      { name: 'likes', values: [{ value: 12 }] }, { name: 'comments', values: [{ value: 4 }] },
      { name: 'shares', values: [{ value: 2 }] }, { name: 'saved', values: [{ value: 5 }] }
    ] }; } },
    resolveCredentials: async () => ({ accessToken: 'secret' })
  });
  const metrics = await adapter.getMetrics({ publication: { accountId: 'a1', externalId: 'm1' } });
  assert.deepEqual(metrics, { views: 120, reach: 90, likes: 12, comments: 4, shares: 2, saves: 5, extraMetrics: {} });
  assert.equal(calls[0].path, 'm1/insights');
  assert.ok(INSTAGRAM_SCOPES.includes('instagram_business_manage_insights'));
});

test('Threads analytics maps replies to comments and preserves reposts/quotes as extras', async () => {
  const adapter = createThreadsAnalyticsAdapter({
    client: { getGraph: async () => ({ data: [
      { name: 'views', values: [{ value: 70 }] }, { name: 'likes', values: [{ value: 9 }] },
      { name: 'replies', values: [{ value: 3 }] }, { name: 'shares', values: [{ value: 2 }] },
      { name: 'reposts', values: [{ value: 4 }] }, { name: 'quotes', values: [{ value: 1 }] }
    ] }) },
    resolveCredentials: async () => ({ accessToken: 'secret' })
  });
  assert.deepEqual(await adapter.getMetrics({ publication: { accountId: 'a1', externalId: 't1' } }), {
    views: 70, reach: null, likes: 9, comments: 3, shares: 2, saves: null, extraMetrics: { reposts: 4, quotes: 1 }
  });
  assert.ok(THREADS_SCOPES.includes('threads_manage_insights'));
});

test('TikTok analytics queries one authorized video and maps public counters', async () => {
  let request;
  const adapter = createTikTokAnalyticsAdapter({
    client: { postApi: async (path, options) => { request = { path, options }; return { data: { videos: [{ id: 'v1', view_count: 400, like_count: 30, comment_count: 5, share_count: 6 }] }, error: { code: 'ok' } }; } },
    resolveCredentials: async () => ({ accessToken: 'secret' })
  });
  assert.deepEqual(await adapter.getMetrics({ publication: { accountId: 'a1', externalId: 'v1' } }), {
    views: 400, reach: null, likes: 30, comments: 5, shares: 6, saves: null, extraMetrics: {}
  });
  assert.equal(request.path, '/v2/video/query/');
  assert.ok(getTikTokConfig({ TIKTOK_CLIENT_KEY: 'key', TIKTOK_CLIENT_SECRET: 'secret' }).scopes.includes('video.list'));
});

test('Facebook analytics normalizes post insights and count summaries without inventing unsupported values', async () => {
  const adapter = createFacebookAnalyticsAdapter({
    client: { getGraph: async () => ({
      insights: { data: [
        { name: 'post_media_view', values: [{ value: 210 }] },
        { name: 'post_total_media_view_unique', values: [{ value: 160 }] }
      ] },
      likes: { summary: { total_count: 18 } }, comments: { summary: { total_count: 4 } }, shares: { count: 3 }
    }) },
    resolveCredentials: async () => ({ accessToken: 'secret' })
  });
  assert.deepEqual(await adapter.getMetrics({ publication: { accountId: 'a1', externalId: 'p1' } }), {
    views: 210, reach: 160, likes: 18, comments: 4, shares: 3, saves: null, extraMetrics: {}
  });
});