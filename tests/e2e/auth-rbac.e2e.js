import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launchBrowser } from './browser-driver.js';
import { startSrocialE2EServer } from './srocial-server.js';

const USERS = Object.freeze({
  viewer: { username: 'e2e-viewer', password: 'Viewer-Password-123!', role: 'VIEWER' },
  editor: { username: 'e2e-editor', password: 'Editor-Password-123!', role: 'EDITOR' },
  manager: { username: 'e2e-manager', password: 'Manager-Password-123!', role: 'MANAGER' },
  lifecycle: { username: 'e2e-lifecycle', password: 'Lifecycle-Old-Password-123!', role: 'EDITOR' },
  revoke: { username: 'e2e-revoke', password: 'Revoke-Password-123!', role: 'VIEWER' }
});

const LIFECYCLE_NEW_PASSWORD = 'Lifecycle-New-Password-456!';
const HTTP_TIMEOUT_MS = 5_000;
const TEST_TIMEOUT_MS = 30_000;

let server;
let browser;

function js(value) {
  return JSON.stringify(value);
}

async function nodeFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    signal: options.signal ?? AbortSignal.timeout(HTTP_TIMEOUT_MS)
  });
}

async function browserFetch(path, options = {}) {
  return browser.evaluate(`(async () => {
    const response = await fetch(${js(path)}, ${js(options)});
    return { status: response.status, text: await response.text() };
  })()`);
}

async function login(username, password) {
  await browser.navigate(`${server.baseUrl}/login.html`);
  await browser.fill('#admin-username', username);
  await browser.fill('#admin-password', password);
  await browser.submit('#admin-login-form');
  await browser.waitFor(`location.pathname === '/'`);
  await browser.waitFor(`document.querySelector('#logout-session')?.hidden === false`);
}

async function expectLoginFailure(username, password) {
  await browser.navigate(`${server.baseUrl}/login.html`);
  await browser.fill('#admin-username', username);
  await browser.fill('#admin-password', password);
  await browser.submit('#admin-login-form');
  await browser.waitFor(`document.querySelector('#login-feedback')?.textContent === 'Invalid username or password.'`);
  assert.equal(await browser.evaluate(`location.pathname`), '/login.html');
}

async function logout() {
  await browser.click('#logout-session');
  await browser.waitFor(`location.pathname === '/login.html'`);
}

async function createUser({ username, password, role }) {
  await browser.navigate(`${server.baseUrl}/#users`);
  await browser.waitFor(`document.querySelector('#users')?.hidden === false`);
  await browser.fill('#user-create-form [name="username"]', username);
  await browser.fill('#user-create-form [name="displayName"]', `E2E ${role}`);
  await browser.fill('#user-create-form [name="role"]', role);
  await browser.fill('#user-create-form [name="password"]', password);
  await browser.submit('#user-create-form');
  await browser.waitFor(`document.querySelector('#users-feedback')?.textContent === 'User created.'`);
  await browser.waitFor(`[...document.querySelectorAll('.user-card')].some((card) => card.textContent.includes(${js(`@${username}`)}))`);
}

async function userCardAction(username, expression) {
  const cardPresent = `[...document.querySelectorAll('.user-card')].some((node) => node.textContent.includes(${js(`@${username}`)}))`;
  await browser.waitFor(cardPresent);
  return browser.evaluate(`(() => {
    const card = [...document.querySelectorAll('.user-card')].find((node) => node.textContent.includes(${js(`@${username}`)}));
    if (!card) throw new Error('USER_CARD_NOT_FOUND');
    return (${expression})(card);
  })()`);
}

before(async () => {
  server = await startSrocialE2EServer();
  browser = await launchBrowser();
});

after(async () => {
  await browser?.close();
  await server?.close();
});

test('real browser redirects unauthenticated users and completes administrator login/logout', { timeout: TEST_TIMEOUT_MS }, async () => {
  await browser.navigate(`${server.baseUrl}/`);
  await browser.waitFor(`location.pathname === '/login.html'`);

  await login(server.admin.username, server.admin.password);
  assert.equal(await browser.evaluate(`document.querySelector('[data-admin-only][href="#users"]')?.hidden`), false);
  assert.equal(await browser.evaluate(`document.querySelector('#users')?.hidden`), false);

  await logout();
});

test('Admin creates Viewer Editor and Manager and real browser sessions enforce the RBAC matrix', { timeout: TEST_TIMEOUT_MS }, async () => {
  await login(server.admin.username, server.admin.password);
  await createUser(USERS.viewer);
  await createUser(USERS.editor);
  await createUser(USERS.manager);
  await logout();

  await login(USERS.viewer.username, USERS.viewer.password);
  assert.equal(await browser.evaluate(`document.querySelector('[data-admin-only][href="#users"]')?.hidden`), true);
  assert.equal((await browserFetch('/api/posts')).status, 200);
  assert.equal((await browserFetch('/api/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  })).status, 403);
  await logout();

  await login(USERS.editor.username, USERS.editor.password);
  assert.equal(await browser.evaluate(`document.querySelector('[data-admin-only][href="#users"]')?.hidden`), true);
  assert.equal((await browserFetch('/api/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  })).status, 400);
  assert.equal((await browserFetch('/api/oauth/instagram/start', { method: 'POST' })).status, 403);
  await logout();

  await login(USERS.manager.username, USERS.manager.password);
  assert.equal(await browser.evaluate(`document.querySelector('[data-admin-only][href="#users"]')?.hidden`), true);
  assert.notEqual((await browserFetch('/api/oauth/instagram/start', { method: 'POST' })).status, 403);
  assert.equal((await browserFetch('/api/users')).status, 403);
  await logout();

  await login(server.admin.username, server.admin.password);
  assert.equal((await browserFetch('/api/users')).status, 200);
  assert.equal(await browser.evaluate(`document.querySelector('[data-admin-only][href="#users"]')?.hidden`), false);
  await logout();
});

test('Admin user lifecycle changes and explicit session revocation work through the browser UI', { timeout: TEST_TIMEOUT_MS }, async () => {
  await login(server.admin.username, server.admin.password);
  await createUser(USERS.lifecycle);

  await userCardAction(USERS.lifecycle.username, `(card) => {
    const inputs = [...card.querySelectorAll('input[type="text"]')];
    const selects = [...card.querySelectorAll('select')];
    inputs[0].value = 'Lifecycle Manager';
    inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    selects[0].value = 'MANAGER';
    selects[0].dispatchEvent(new Event('change', { bubbles: true }));
    [...card.querySelectorAll('button')].find((button) => button.textContent === 'Save user').click();
    return true;
  }`);
  await browser.waitFor(`document.querySelector('#users-feedback')?.textContent === ${js(`Saved ${USERS.lifecycle.username}.`)}`);
  await browser.waitFor(`[...document.querySelectorAll('.user-card')].some((card) => card.textContent.includes(${js(`@${USERS.lifecycle.username}`)}) && card.querySelector('select')?.value === 'MANAGER')`);

  await userCardAction(USERS.lifecycle.username, `(card) => {
    const password = card.querySelector(${js(`[aria-label="New password for ${USERS.lifecycle.username}"]`)});
    password.value = ${js(LIFECYCLE_NEW_PASSWORD)};
    password.dispatchEvent(new Event('input', { bubbles: true }));
    [...card.querySelectorAll('button')].find((button) => button.textContent === 'Change password').click();
    return true;
  }`);
  await browser.waitFor(`document.querySelector('#users-feedback')?.textContent.includes('Password changed for ${USERS.lifecycle.username}')`);

  await logout();
  await expectLoginFailure(USERS.lifecycle.username, USERS.lifecycle.password);
  await login(USERS.lifecycle.username, LIFECYCLE_NEW_PASSWORD);
  await logout();

  await login(server.admin.username, server.admin.password);
  await userCardAction(USERS.lifecycle.username, `(card) => {
    const selects = [...card.querySelectorAll('select')];
    selects[1].value = 'DISABLED';
    selects[1].dispatchEvent(new Event('change', { bubbles: true }));
    [...card.querySelectorAll('button')].find((button) => button.textContent === 'Save user').click();
    return true;
  }`);
  await browser.waitFor(`document.querySelector('#users-feedback')?.textContent === ${js(`Saved ${USERS.lifecycle.username}.`)}`);
  await logout();
  await expectLoginFailure(USERS.lifecycle.username, LIFECYCLE_NEW_PASSWORD);

  await login(server.admin.username, server.admin.password);
  await createUser(USERS.revoke);

  const loginResponse = await nodeFetch(`${server.baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERS.revoke.username, password: USERS.revoke.password })
  });
  assert.equal(loginResponse.status, 200);
  const sessionCookie = loginResponse.headers.get('set-cookie')?.split(';')[0];
  assert.ok(sessionCookie);

  const activeResponse = await nodeFetch(`${server.baseUrl}/api/auth/session`, { headers: { Cookie: sessionCookie } });
  assert.equal(activeResponse.status, 200);

  await userCardAction(USERS.revoke.username, `(card) => {
    [...card.querySelectorAll('button')].find((button) => button.textContent === 'Revoke sessions').click();
    return true;
  }`);
  await browser.waitFor(`document.querySelector('#users-feedback')?.textContent === ${js(`Sessions revoked for ${USERS.revoke.username}.`)}`);

  const revokedResponse = await nodeFetch(`${server.baseUrl}/api/auth/session`, { headers: { Cookie: sessionCookie } });
  assert.equal(revokedResponse.status, 401);

  await logout();
});