import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launchBrowser } from './browser-driver.js';
import { startSrocialE2EServer } from './srocial-server.js';

const NOW = '2026-09-16T09:00:00.000Z';
const ACCOUNT = Object.freeze({
  id:'v30-revoked-threads',
  provider:'threads',
  providerAccountId:'v30-threads-user',
  displayName:'V30 Revoked Threads',
  username:'v30_threads',
  state:'DISCONNECTED',
  lastErrorCode:'PERMISSION_REVOKED',
  disconnectedAt:NOW,
  createdAt:NOW,
  updatedAt:NOW
});

let server;
let browser;

before(async () => {
  server = await startSrocialE2EServer({ seedData:{ accounts:[ACCOUNT] } });
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

test('real browser shows permission-revoked reconnect health on Accounts', async () => {
  await browser.navigate(`${server.baseUrl}/#accounts`);
  await browser.waitFor(`document.querySelector('#account-list .account-row')?.textContent.includes('V30 Revoked Threads')`);

  const rendered = await browser.evaluate(`(() => {
    const row = document.querySelector('#account-list .account-row');
    const reconnect = row?.querySelector('button[data-action="reconnect"]');
    return { text:row?.textContent ?? '', reconnectText:reconnect?.textContent ?? '' };
  })()`);

  assert.match(rendered.text, /Reconnect needed: provider permission was revoked\./);
  assert.equal(rendered.reconnectText, 'Reconnect');
});
