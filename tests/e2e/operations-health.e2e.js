import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launchBrowser } from './browser-driver.js';
import { startSrocialE2EServer } from './srocial-server.js';

let server;
let browser;

before(async () => {
  server = await startSrocialE2EServer();
  browser = await launchBrowser();
  await browser.navigate(`${server.baseUrl}/login.html`);
  await browser.fill('#admin-username', server.admin.username);
  await browser.fill('#admin-password', server.admin.password);
  await browser.submit('#admin-login-form');
  await browser.waitFor(`location.pathname === '/'`);
});

after(async () => {
  await browser?.close();
  await server?.close();
});

test('real browser renders database, storage, scheduler and environment diagnostics', async () => {
  await browser.navigate(`${server.baseUrl}/#operations`);
  await browser.waitFor(`document.querySelector('#runtime-health-list')?.textContent.includes('Database')`);
  await browser.waitFor(`document.querySelector('#runtime-health-list')?.textContent.includes('Storage')`);
  await browser.waitFor(`document.querySelector('#runtime-health-list')?.textContent.includes('Scheduler')`);
  await browser.waitFor(`document.querySelector('#environment-diagnostic-list')?.textContent.length > 0`);

  const rendered = await browser.evaluate(`({
    runtime: document.querySelector('#runtime-health-list')?.textContent ?? '',
    environment: document.querySelector('#environment-diagnostic-list')?.textContent ?? ''
  })`);

  assert.match(rendered.runtime, /Database/);
  assert.match(rendered.runtime, /json/i);
  assert.match(rendered.runtime, /Storage/);
  assert.match(rendered.runtime, /local/i);
  assert.match(rendered.runtime, /Scheduler/);
  assert.match(rendered.runtime, /stopped|disabled/i);
  assert.match(rendered.environment, /No configuration issues detected/i);

  const api = await browser.evaluate(`(async () => {
    const response = await fetch('/api/operations');
    return { status: response.status, body: await response.json() };
  })()`);
  assert.equal(api.status, 200);
  assert.equal(api.body.runtime.database.ok, true);
  assert.equal(api.body.runtime.database.backend, 'json');
  assert.equal(api.body.runtime.storage.ok, true);
  assert.equal(api.body.runtime.storage.backend, 'local');
  assert.equal(api.body.runtime.storage.writable, true);
  assert.equal(api.body.runtime.scheduler.configured, false);
  assert.equal(api.body.environment.ok, true);
  assert.deepEqual(api.body.environment.issues, []);
});
