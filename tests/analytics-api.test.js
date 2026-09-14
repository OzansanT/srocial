import test from 'node:test';
import assert from 'node:assert/strict';
import { getAnalyticsPayload, refreshAnalyticsPayload, refreshPublicationAnalyticsPayload } from '../server/routes/analytics.js';

test('analytics report route forwards filters and returns sanitized report', async () => {
  const calls = [];
  const analyticsService = { report: async (filters) => { calls.push(filters); return { summary: { views: 12 }, posts: [], series: [], freshness: {} }; } };
  const result = await getAnalyticsPayload(analyticsService, { platform: 'instagram', accountId: 'a1', from: '2026-09-01', until: '2026-09-30' });
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.summary.views, 12);
  assert.equal(calls[0].platform, 'instagram');
});

test('publication analytics refresh maps safe service errors', async () => {
  const analyticsService = { refreshPublication: async () => { const error = new Error('secret provider body'); error.code = 'PERMISSION_DENIED'; throw error; } };
  const result = await refreshPublicationAnalyticsPayload(analyticsService, 'pub-1');
  assert.deepEqual(result, { statusCode: 403, payload: { error: 'permission_denied' } });
});

test('bounded analytics refresh returns partial results without background job semantics', async () => {
  const analyticsService = { refreshRecent: async (filters) => ({ filters, attempted: 2, succeeded: 1, failed: 1, results: [{ publicationId: 'a', ok: true }, { publicationId: 'b', ok: false, error: 'rate_limit' }] }) };
  const result = await refreshAnalyticsPayload(analyticsService, { platform: 'tiktok' });
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.attempted, 2);
  assert.equal(result.payload.results[1].error, 'rate_limit');
});