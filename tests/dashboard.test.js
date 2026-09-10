import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDashboardSummary } from '../server/services/dashboard-service.js';

test('dashboard summary counts publication states and preserves channel health', () => {
  const publications = [
    { state: 'SCHEDULED' },
    { state: 'PUBLISHED' },
    { state: 'PROCESSING' },
    { state: 'FAILED' },
    { state: 'PUBLISHED' }
  ];
  const channels = [{ name: 'Instagram', connected: false }];

  assert.deepEqual(buildDashboardSummary(publications, channels), {
    counts: { scheduled: 1, published: 2, processing: 1, failed: 1 },
    channels
  });
});
