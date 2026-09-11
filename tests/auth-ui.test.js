import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { login, getSession, logout } from '../client/js/api/auth-api.js';

async function text(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

test('login document exposes accessible credentials form without inline code', async () => {
  const html = await text('../client/login.html');
  assert.match(html, /id="admin-login-form"/);
  assert.match(html, /for="admin-username"/);
  assert.match(html, /id="admin-username"[^>]*autocomplete="username"/);
  assert.match(html, /for="admin-password"/);
  assert.match(html, /id="admin-password"[^>]*autocomplete="current-password"/);
  assert.match(html, /id="login-feedback"/);
  assert.match(html, /\/css\/pages\/login\.css/);
  assert.match(html, /type="module"[^>]*\/js\/pages\/login\.js/);
  assert.doesNotMatch(html, /<style[\s>]/i);
  assert.doesNotMatch(html, /on(?:click|submit)=/i);
});

test('auth API uses shared JSON client and correct endpoints', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ authenticated: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };
  try {
    await login('operator', 'secret-value');
    await getSession();
    await logout();
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls[0].url, '/api/auth/login');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(new Headers(calls[0].options.headers).get('content-type'), 'application/json');
  assert.deepEqual(JSON.parse(calls[0].options.body), { username: 'operator', password: 'secret-value' });
  assert.equal(calls[1].url, '/api/auth/session');
  assert.equal(calls[2].url, '/api/auth/logout');
  assert.equal(calls[2].options.method, 'POST');
});

test('login client does not persist administrator credentials in browser storage', async () => {
  const api = await text('../client/js/api/auth-api.js');
  const page = await text('../client/js/pages/login.js');
  assert.doesNotMatch(api, /localStorage|sessionStorage/);
  assert.doesNotMatch(page, /localStorage|sessionStorage/);
  assert.match(page, /window\.location\.replace\(['"]\/['"]\)/);
});

test('dashboard includes a logout control wired through the auth API', async () => {
  const html = await text('../client/index.html');
  const app = await text('../client/js/app.js');
  assert.match(html, /id="logout-session"/);
  assert.match(app, /api\/auth-api\.js/);
  assert.match(app, /logout/);
  assert.match(app, /logout-session/);
  assert.match(app, /window\.location\.replace\(['"]\/login\.html['"]\)/);
});
