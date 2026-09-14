import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

async function read(path) { return readFile(new URL(path, root), 'utf8'); }

test('dashboard exposes Analytics navigation, filters, KPI targets, series, table and stylesheet', async () => {
  const html = await read('client/index.html');
  for (const token of [
    'data-page="analytics"', 'id="analyticsPanel"', 'id="analyticsPlatform"', 'id="analyticsAccount"',
    'id="analyticsFrom"', 'id="analyticsUntil"', 'id="analyticsRefresh"', 'id="analyticsKpis"',
    'id="analyticsSeries"', 'id="analyticsPosts"', '/css/pages/analytics.css'
  ]) assert.ok(html.includes(token), token);
});

test('analytics page uses dedicated API module and safe DOM rendering without innerHTML', async () => {
  const [page, api, app] = await Promise.all([
    read('client/js/pages/analytics.js'), read('client/js/api/analytics-api.js'), read('client/js/app.js')
  ]);
  assert.match(api, /\/api\/analytics/);
  assert.match(page, /createElement/);
  assert.doesNotMatch(page, /innerHTML/);
  assert.match(app, /initAnalyticsPage/);
});