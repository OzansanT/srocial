import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequestHandler } from '../server/app.js';
import { createJsonRepository } from '../server/db/json-repository.js';
import { createTokenCipher } from '../server/auth/token-crypto.js';
import { createOAuthProviderRegistry, registerOAuthProvider } from '../server/auth/oauth-provider-registry.js';

async function withHarness(run, { tokenCipher = createTokenCipher('api test key') } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'srocial-api-'));
  const repository = createJsonRepository({ filePath: join(directory, 'data.json') });
  await repository.initialize();
  const registry = createOAuthProviderRegistry();
  registerOAuthProvider(registry, 'instagram', {
    getAuthorizationUrl: ({ state, redirectUri }) => `https://auth.test/?state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(redirectUri)}`,
    async exchangeCode() { return { accessToken: 'raw-access', refreshToken: 'raw-refresh', scopes: ['publish'] }; },
    async getAccountIdentity() { return { providerAccountId: 'ig-9', displayName: 'Demo IG', username: 'demoig' }; }
  });
  const server = createServer(createRequestHandler({ repository, oauthProviderRegistry: registry, tokenCipher, publicBaseUrl: 'http://localhost:9999', now: () => new Date('2026-09-10T12:00:00.000Z') }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await run(`http://127.0.0.1:${server.address().port}`, repository);
  } finally {
    server.close();
    await once(server, 'close');
    await rm(directory, { recursive: true, force: true });
  }
}

async function startInstagram(base) {
  const response = await fetch(`${base}/api/oauth/instagram/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: '{}'
  });
  assert.equal(response.status, 200);
  return response.json();
}

test('oauth start callback list and disconnect expose safe metadata only for JSON clients', async () => {
  await withHarness(async (base, repository) => {
    const started = await startInstagram(base);
    assert.match(started.authorizationUrl, /auth\.test/);
    assert.match(started.authorizationUrl, /localhost%3A9999/);

    const callback = await fetch(`${base}/api/oauth/instagram/callback?code=ok&state=${encodeURIComponent(started.state)}`, {
      headers: { accept: 'application/json' }
    });
    assert.equal(callback.status, 200);
    const connected = await callback.json();
    assert.equal(connected.account.state, 'CONNECTED');
    assert.equal(JSON.stringify(connected).includes('raw-access'), false);

    const listed = await (await fetch(`${base}/api/accounts`, { headers: { accept: 'application/json' } })).json();
    assert.equal(listed.accounts.length, 1);
    assert.equal(JSON.stringify(listed).includes('TokenEncrypted'), false);
    const stored = (await repository.listAccounts())[0];
    assert.notEqual(stored.accessTokenEncrypted, 'raw-access');

    const disconnected = await fetch(`${base}/api/accounts/${connected.account.id}/disconnect`, { method: 'POST', headers: { accept: 'application/json' } });
    assert.equal(disconnected.status, 200);
    assert.equal((await disconnected.json()).account.state, 'DISCONNECTED');
  });
});

test('browser OAuth callback redirects safely to Accounts after successful connection', async () => {
  await withHarness(async (base) => {
    const started = await startInstagram(base);
    const callback = await fetch(`${base}/api/oauth/instagram/callback?code=browser-code&state=${encodeURIComponent(started.state)}`, {
      headers: { accept: 'text/html' },
      redirect: 'manual'
    });
    assert.equal(callback.status, 303);
    assert.equal(callback.headers.get('location'), '/?oauth=instagram&status=connected#accounts');
  });
});

test('browser OAuth callback redirects sanitized failures without reflecting code or state', async () => {
  await withHarness(async (base) => {
    const callback = await fetch(`${base}/api/oauth/instagram/callback?code=secret-code&state=secret-state`, {
      headers: { accept: 'text/html' },
      redirect: 'manual'
    });
    assert.equal(callback.status, 303);
    const location = callback.headers.get('location');
    assert.equal(location, '/?oauth=instagram&status=error&code=oauth_state_invalid#accounts');
    assert.equal(location.includes('secret-code'), false);
    assert.equal(location.includes('secret-state'), false);
  });
});

test('browser OAuth callback redirects safely when token encryption is not configured', async () => {
  await withHarness(async (base) => {
    const callback = await fetch(`${base}/api/oauth/instagram/callback?code=secret-code&state=secret-state`, {
      headers: { accept: 'text/html' },
      redirect: 'manual'
    });
    assert.equal(callback.status, 303);
    assert.equal(callback.headers.get('location'), '/?oauth=instagram&status=error&code=oauth_not_configured#accounts');
  }, { tokenCipher: null });
});

test('rejects replayed state and unsupported providers safely for JSON clients', async () => {
  await withHarness(async (base) => {
    const unsupported = await fetch(`${base}/api/oauth/unknown/start`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: '{}' });
    assert.equal(unsupported.status, 400);
    assert.deepEqual(await unsupported.json(), { error: 'unsupported_provider' });

    const started = await startInstagram(base);
    await fetch(`${base}/api/oauth/instagram/callback?code=ok&state=${encodeURIComponent(started.state)}`, { headers: { accept: 'application/json' } });
    const replay = await fetch(`${base}/api/oauth/instagram/callback?code=ok&state=${encodeURIComponent(started.state)}`, { headers: { accept: 'application/json' } });
    assert.equal(replay.status, 400);
    assert.deepEqual(await replay.json(), { error: 'oauth_state_invalid' });
  });
});
