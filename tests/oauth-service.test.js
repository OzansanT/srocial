import test from 'node:test';
import assert from 'node:assert/strict';
import { startOAuthConnection, completeOAuthConnection } from '../server/services/oauth-service.js';
import { createOAuthProviderRegistry, registerOAuthProvider } from '../server/auth/oauth-provider-registry.js';
import { createTokenCipher } from '../server/auth/token-crypto.js';

function createRepository() {
  const states = [];
  const accounts = [];
  return {
    states,
    accounts,
    async createOAuthState(record) { states.push({ ...record }); return { ...record }; },
    async getOAuthState(hash) { const item = states.find((row) => row.stateHash === hash); return item ? { ...item } : null; },
    async consumeOAuthState(hash, { now }) { const item = states.find((row) => row.stateHash === hash && !row.consumedAt && Date.parse(row.expiresAt) > now.getTime()); if (!item) return null; item.consumedAt = now.toISOString(); return { ...item }; },
    async findAccountByProviderIdentity(provider, providerAccountId) { return accounts.find((row) => row.provider === provider && row.providerAccountId === providerAccountId) ?? null; },
    async createAccount(record) { const item = { id: 'a1', ...record }; accounts.push(item); return structuredClone(item); },
    async updateAccount(id, patch) { const item = accounts.find((row) => row.id === id); Object.assign(item, patch); return structuredClone(item); },
    async listAccounts() { return structuredClone(accounts); },
    async getAccount(id) { return structuredClone(accounts.find((row) => row.id === id) ?? null); }
  };
}

function createRegistry() {
  const registry = createOAuthProviderRegistry();
  registerOAuthProvider(registry, 'instagram', {
    getAuthorizationUrl: ({ state, redirectUri }) => `https://auth.test/?state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(redirectUri)}`,
    async exchangeCode({ code }) { assert.equal(code, 'code-1'); return { accessToken: 'secret-access', refreshToken: 'secret-refresh', expiresAt: '2026-10-10T12:00:00.000Z', scopes: ['publish'] }; },
    async getAccountIdentity({ accessToken }) { assert.equal(accessToken, 'secret-access'); return { providerAccountId: 'ig-1', displayName: 'Demo', username: 'demo' }; }
  });
  return registry;
}

const now = new Date('2026-09-10T12:00:00.000Z');

test('starts and completes a provider-neutral OAuth flow', async () => {
  const repository = createRepository();
  const providerRegistry = createRegistry();
  const start = await startOAuthConnection({ provider: 'instagram', redirectUri: 'http://localhost/callback', repository, providerRegistry, now });
  assert.match(start.authorizationUrl, /state=/);
  const result = await completeOAuthConnection({ provider: 'instagram', code: 'code-1', state: start.state, repository, providerRegistry, cipher: createTokenCipher('oauth service key'), now });
  assert.equal(result.account.providerAccountId, 'ig-1');
  assert.equal(result.account.state, 'CONNECTED');
  assert.equal('accessTokenEncrypted' in result.account, false);
  assert.notEqual(repository.accounts[0].accessTokenEncrypted, 'secret-access');
});

test('rejects missing code and replayed state', async () => {
  const repository = createRepository();
  const providerRegistry = createRegistry();
  const start = await startOAuthConnection({ provider: 'instagram', redirectUri: 'http://localhost/callback', repository, providerRegistry, now });
  await assert.rejects(() => completeOAuthConnection({ provider: 'instagram', code: '', state: start.state, repository, providerRegistry, cipher: createTokenCipher('oauth service key'), now }), /OAUTH_CODE_REQUIRED/);
  await completeOAuthConnection({ provider: 'instagram', code: 'code-1', state: start.state, repository, providerRegistry, cipher: createTokenCipher('oauth service key'), now });
  await assert.rejects(() => completeOAuthConnection({ provider: 'instagram', code: 'code-1', state: start.state, repository, providerRegistry, cipher: createTokenCipher('oauth service key'), now }), /OAUTH_STATE_INVALID/);
});
