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

async function withHarness(run) {
  const directory = await mkdtemp(join(tmpdir(), 'srocial-api-'));
  const repository = createJsonRepository({ filePath: join(directory, 'data.json') });
  await repository.initialize();
  const registry = createOAuthProviderRegistry();
  registerOAuthProvider(registry, 'instagram', {
    getAuthorizationUrl: ({ state, redirectUri }) => `https://auth.test/?state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(redirectUri)}`,
    async exchangeCode() { return { accessToken: 'raw-access', refreshToken: 'raw-refresh', scopes: ['publish'] }; },
    async getAccountIdentity() { return { providerAccountId: 'ig-9', displayName: 'Demo IG', username: 'demoig' }; }
  });
  const server = createServer(createRequestHandler({ repository, oauthProviderRegistry: registry, tokenCipher: createTokenCipher('api test key'), publicBaseUrl: 'http://localhost:9999', now: () => new Date('2026-09-10T12:00:00.000Z') }));
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

test('oauth start callback list and disconnect expose safe metadata only', async () => {
  await withHarness(async (base, repository) => {
    const startResponse = await fetch(`${base}/api/oauth/instagram/start`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(startResponse.status, 200);
    const started = await startResponse.json();
    assert.match(started.authorizationUrl, /auth\.test/);
    assert.match(started.authorizationUrl, /localhost%3A9999/);

    const callback = await fetch(`${base}/api/oauth/instagram/callback?code=ok&state=${encodeURIComponent(started.state)}`);
    assert.equal(callback.status, 200);
    const connected = await callback.json();
    assert.equal(connected.account.state, 'CONNECTED');
    assert.equal(JSON.stringify(connected).includes('raw-access'), false);

    const listed = await (await fetch(`${base}/api/accounts`)).json();
    assert.equal(listed.accounts.length, 1);
    assert.equal(JSON.stringify(listed).includes('TokenEncrypted'), false);
    const stored = (await repository.listAccounts())[0];
    assert.notEqual(stored.accessTokenEncrypted, 'raw-access');

    const disconnected = await fetch(`${base}/api/accounts/${connected.account.id}/disconnect`, { method: 'POST' });
    assert.equal(disconnected.status, 200);
    assert.equal((await disconnected.json()).account.state, 'DISCONNECTED');
  });
});

test('rejects replayed state and unsupported providers safely', async () => {
  await withHarness(async (base) => {
    const unsupported = await fetch(`${base}/api/oauth/unknown/start`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(unsupported.status, 400);
    assert.deepEqual(await unsupported.json(), { error: 'unsupported_provider' });

    const started = await (await fetch(`${base}/api/oauth/instagram/start`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json();
    await fetch(`${base}/api/oauth/instagram/callback?code=ok&state=${encodeURIComponent(started.state)}`);
    const replay = await fetch(`${base}/api/oauth/instagram/callback?code=ok&state=${encodeURIComponent(started.state)}`);
    assert.equal(replay.status, 400);
    assert.deepEqual(await replay.json(), { error: 'oauth_state_invalid' });
  });
});
