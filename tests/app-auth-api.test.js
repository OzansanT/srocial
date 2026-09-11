import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import { createRequestHandler } from '../server/app.js';
import { createAppAuth } from '../server/auth/create-app-auth.js';

const AUTH_ENV = Object.freeze({
  APP_AUTH_ENABLED: 'true',
  ADMIN_USERNAME: 'operator',
  ADMIN_PASSWORD: 'correct-horse-battery',
  SESSION_SECRET: 's'.repeat(40),
  SESSION_TTL_SECONDS: '3600',
  PUBLIC_BASE_URL: 'http://srocial.test',
  API_RATE_LIMIT_WINDOW_MS: '60000',
  API_RATE_LIMIT_MAX: '20',
  LOGIN_RATE_LIMIT_WINDOW_MS: '60000',
  LOGIN_RATE_LIMIT_MAX: '5'
});

async function withServer(run, { env = AUTH_ENV, repository = null, mediaStore = null, tokenCipher = null } = {}) {
  const now = () => new Date('2026-09-11T10:00:00.000Z');
  const appAuth = createAppAuth({ env, now });
  const server = createServer(createRequestHandler({
    repository,
    mediaStore,
    tokenCipher,
    appAuth,
    publicBaseUrl: env.PUBLIC_BASE_URL,
    now
  }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

function cookiePair(response) {
  const setCookie = response.headers.get('set-cookie');
  assert.ok(setCookie);
  return setCookie.split(';', 1)[0];
}

async function login(base, { username = 'operator', password = 'correct-horse-battery', origin = 'http://srocial.test' } = {}) {
  return fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', origin },
    body: JSON.stringify({ username, password })
  });
}

test('health, OAuth callback, login assets, and provider media remain public', async () => {
  const repository = { async healthCheck() { return { ok: true, backend: 'json' }; } };
  const mediaStore = {
    async open() {
      return { contentType: 'image/png', size: 3, stream: Readable.from(Buffer.from('png')) };
    }
  };
  await withServer(async (base) => {
    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);

    const loginPage = await fetch(`${base}/login.html`, { redirect: 'manual' });
    assert.equal(loginPage.status, 200);

    const callback = await fetch(`${base}/api/oauth/instagram/callback?code=x&state=y`, {
      headers: { accept: 'text/html' },
      redirect: 'manual'
    });
    assert.equal(callback.status, 303);
    assert.equal(callback.headers.get('location'), '/?oauth=instagram&status=error&code=oauth_not_configured#accounts');

    const media = await fetch(`${base}/media/asset.png`);
    assert.equal(media.status, 200);
    assert.equal(await media.text(), 'png');
  }, { repository, mediaStore });
});

test('protected browser navigation redirects while protected APIs return JSON 401', async () => {
  await withServer(async (base) => {
    const dashboard = await fetch(`${base}/`, { redirect: 'manual' });
    assert.equal(dashboard.status, 303);
    assert.equal(dashboard.headers.get('location'), '/login.html');

    const api = await fetch(`${base}/api/dashboard`, { headers: { accept: 'application/json' } });
    assert.equal(api.status, 401);
    assert.deepEqual(await api.json(), { error: 'unauthorized' });
  });
});

test('login issues a signed session used by session and protected APIs', async () => {
  await withServer(async (base) => {
    const bad = await login(base, { password: 'definitely-wrong-password' });
    assert.equal(bad.status, 401);
    assert.deepEqual(await bad.json(), { error: 'invalid_credentials' });

    const authenticated = await login(base);
    assert.equal(authenticated.status, 200);
    assert.deepEqual(await authenticated.json(), { authenticated: true });
    const cookie = cookiePair(authenticated);
    assert.match(authenticated.headers.get('set-cookie'), /HttpOnly/);
    assert.match(authenticated.headers.get('set-cookie'), /SameSite=Strict/);

    const session = await fetch(`${base}/api/auth/session`, { headers: { cookie, accept: 'application/json' } });
    assert.equal(session.status, 200);
    assert.deepEqual(await session.json(), { authenticated: true, user: { username: 'operator' } });

    const dashboard = await fetch(`${base}/api/dashboard`, { headers: { cookie, accept: 'application/json' } });
    assert.equal(dashboard.status, 200);
  });
});

test('authenticated cross-site mutations are rejected before downstream work', async () => {
  let saved = 0;
  const mediaStore = {
    async save() { saved += 1; return { key: 'should-not-run' }; }
  };
  await withServer(async (base) => {
    const authenticated = await login(base);
    const cookie = cookiePair(authenticated);
    const response = await fetch(`${base}/api/media/uploads`, {
      method: 'POST',
      headers: { cookie, origin: 'https://evil.example', 'content-type': 'image/png', accept: 'application/json' },
      body: Buffer.from('payload')
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'cross_site_request' });
    assert.equal(saved, 0);
  }, { mediaStore });
});

test('logout expires the session cookie', async () => {
  await withServer(async (base) => {
    const authenticated = await login(base);
    const cookie = cookiePair(authenticated);
    const response = await fetch(`${base}/api/auth/logout`, {
      method: 'POST',
      headers: { cookie, origin: 'http://srocial.test', accept: 'application/json' }
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { authenticated: false });
    assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
  });
});

test('login attempts are rate limited per remote address', async () => {
  const env = { ...AUTH_ENV, LOGIN_RATE_LIMIT_MAX: '2' };
  await withServer(async (base) => {
    assert.equal((await login(base, { password: 'wrong-password-one' })).status, 401);
    assert.equal((await login(base, { password: 'wrong-password-two' })).status, 401);
    const blocked = await login(base, { password: 'correct-horse-battery' });
    assert.equal(blocked.status, 429);
    assert.deepEqual(await blocked.json(), { error: 'rate_limited' });
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  }, { env });
});

test('authenticated protected API requests are rate limited', async () => {
  const env = { ...AUTH_ENV, API_RATE_LIMIT_MAX: '1' };
  await withServer(async (base) => {
    const authenticated = await login(base);
    const cookie = cookiePair(authenticated);
    const first = await fetch(`${base}/api/auth/session`, { headers: { cookie, accept: 'application/json' } });
    assert.equal(first.status, 200);
    const blocked = await fetch(`${base}/api/auth/session`, { headers: { cookie, accept: 'application/json' } });
    assert.equal(blocked.status, 429);
    assert.deepEqual(await blocked.json(), { error: 'rate_limited' });
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  }, { env });
});

test('disabled application auth preserves V10 routing behavior', async () => {
  const env = { APP_AUTH_ENABLED: 'false', PUBLIC_BASE_URL: 'http://127.0.0.1:3000' };
  await withServer(async (base) => {
    const dashboard = await fetch(`${base}/`);
    assert.equal(dashboard.status, 200);
    assert.match(await dashboard.text(), /Srocial Dashboard/);
    const api = await fetch(`${base}/api/dashboard`);
    assert.equal(api.status, 200);
  }, { env });
});
