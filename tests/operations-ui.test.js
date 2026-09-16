import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('dashboard exposes Operations navigation, runtime diagnostics targets, stylesheet, and module bootstrap', async () => {
  const [html, app, api, page, css] = await Promise.all([
    source('client/index.html'),
    source('client/js/app.js'),
    source('client/js/api/operations-api.js'),
    source('client/js/pages/operations.js'),
    source('client/css/pages/operations.css')
  ]);
  assert.match(html, /href="#operations"/);
  assert.match(html, /id="operations"/);
  assert.match(html, /id="provider-health-list"/);
  assert.match(html, /id="runtime-health-list"/);
  assert.match(html, /id="environment-diagnostic-list"/);
  assert.match(html, /id="failed-job-list"/);
  assert.match(html, /id="publication-attempt-list"/);
  assert.match(html, /id="webhook-event-list"/);
  assert.match(html, /\/css\/pages\/operations\.css/);
  assert.match(api, /\/api\/operations/);
  assert.match(page, /export async function initializeOperations/);
  assert.match(page, /runtime-health-list/);
  assert.match(page, /environment-diagnostic-list/);
  assert.doesNotMatch(page, /\.innerHTML\s*=/);
  assert.match(app, /initializeOperations/);
  assert.ok(css.trim().length > 0);
});