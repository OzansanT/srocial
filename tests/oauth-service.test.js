import test from 'node:test';
import assert from 'node:assert/strict';
import { startOAuthConnection, completeOAuthConnection } from '../server/services/oauth-service.js';
import { createOAuthProviderRegistry, registerOAuthProvider } from '../server/auth/oauth-provider-registry.js';
import { createTokenCipher } from '../server/auth/token-crypto.js';
import { JOB_STATES } from '../server/scheduler/job-states.js';
import { JOB_TYPES } from '../server/scheduler/job-types.js';

function createRepository() {
  const states = [];
  const accounts = [];
  const jobs = [];
  return {
    states,
    accounts,
    jobs,
    async createOAuthState(record) { states.push({ ...record }); return { ...record }; },
    async getOAuthState(hash) { const item = states.find((row) => row.stateHash === hash); return item ? { ...item } : null; },
    async consumeOAuthState(hash, { now }) { const item = states.find((row) => row.stateHash === hash && !row.consumedAt && Date.parse(row.expiresAt) > now.getTime()); if (!item) return null; item.consumedAt = now.toISOString(); return { ...item }; },
    async findAccountByProviderIdentity(provider, providerAccountId) { return accounts.find((row) => row.provider === provider && row.providerAccountId === providerAccountId) ?? null; },
    async createAccount(record) { const item = { id: 'a1', ...record }; accounts.push(item); return structuredClone(item); },
    async updateAccount(id, patch) { const item = accounts.find((row) => row.id === id); Object.assign(item, patch); return structuredClone(item); },
    async listAccounts() { return structuredClone(accounts); },
    async getAccount(id) { return structuredClone(accounts.find((row) => row.id === id) ?? null); },
    async listJobs() { return structuredClone(jobs); },
    async createJob(record) { const item = { id:`j${jobs.length + 1}`, ...record }; jobs.push(item); return structuredClone(item); },
    async updateJob(id, patch) { const item = jobs.find((row) => row.id === id); if (!item) return null; Object.assign(item, patch); return structuredClone(item); }
  };
}

function createRegistry({ supportsRefresh = true } = {}) {
  const registry = createOAuthProviderRegistry();
  const adapter = {
    getAuthorizationUrl: ({ state, redirectUri }) => `https://auth.test/?state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(redirectUri)}`,
    async exchangeCode({ code }) { assert.equal(code, 'code-1'); return { accessToken: 'secret-access', refreshToken: 'secret-refresh', expiresAt: '2026-10-10T12:00:00.000Z', scopes: ['publish'] }; },
    async getAccountIdentity({ accessToken }) { assert.equal(accessToken, 'secret-access'); return { providerAccountId: 'ig-1', displayName: 'Demo', username: 'demo' }; }
  };
  if (supportsRefresh) adapter.refreshAccessToken = async () => ({ accessToken:'fresh', expiresAt:'2026-11-10T12:00:00.000Z' });
  registerOAuthProvider(registry, 'instagram', adapter);
  return registry;
}

const now = new Date('2026-09-10T12:00:00.000Z');

test('starts and completes a provider-neutral OAuth flow and schedules token refresh', async () => {
  const repository = createRepository();
  const providerRegistry = createRegistry();
  const start = await startOAuthConnection({ provider: 'instagram', redirectUri: 'http://localhost/callback', repository, providerRegistry, now });
  assert.match(start.authorizationUrl, /state=/);
  const result = await completeOAuthConnection({ provider: 'instagram', code: 'code-1', state: start.state, repository, providerRegistry, cipher: createTokenCipher('oauth service key'), now });
  assert.equal(result.account.providerAccountId, 'ig-1');
  assert.equal(result.account.state, 'CONNECTED');
  assert.equal('accessTokenEncrypted' in result.account, false);
  assert.notEqual(repository.accounts[0].accessTokenEncrypted, 'secret-access');
  assert.equal(repository.jobs.length, 1);
  assert.equal(repository.jobs[0].type, JOB_TYPES.TOKEN_REFRESH);
  assert.equal(repository.jobs[0].accountId, 'a1');
  assert.equal(repository.jobs[0].state, JOB_STATES.SCHEDULED);
  assert.equal(repository.jobs[0].scheduledAt, '2026-09-11T12:00:00.000Z');
});

test('does not schedule token refresh for a provider without refresh support', async () => {
  const repository = createRepository();
  const providerRegistry = createRegistry({ supportsRefresh:false });
  const start = await startOAuthConnection({ provider:'instagram', redirectUri:'http://localhost/callback', repository, providerRegistry, now });
  await completeOAuthConnection({ provider:'instagram', code:'code-1', state:start.state, repository, providerRegistry, cipher:createTokenCipher('oauth service no refresh key'), now });
  assert.equal(repository.jobs.length, 0);
});

test('reconnect reuses scheduled token refresh work instead of duplicating it', async () => {
  const repository = createRepository();
  const providerRegistry = createRegistry();
  const cipher = createTokenCipher('oauth reconnect key');
  const first = await startOAuthConnection({ provider:'instagram', redirectUri:'http://localhost/callback', repository, providerRegistry, now });
  await completeOAuthConnection({ provider:'instagram', code:'code-1', state:first.state, repository, providerRegistry, cipher, now });
  const secondNow = new Date('2026-09-10T13:00:00.000Z');
  const second = await startOAuthConnection({ provider:'instagram', redirectUri:'http://localhost/callback', repository, providerRegistry, now:secondNow });
  await completeOAuthConnection({ provider:'instagram', code:'code-1', state:second.state, repository, providerRegistry, cipher, now:secondNow });
  assert.equal(repository.jobs.length, 1);
  assert.equal(repository.jobs[0].state, JOB_STATES.SCHEDULED);
  assert.equal(repository.jobs[0].attempts, 0);
  assert.equal(repository.jobs[0].scheduledAt, '2026-09-11T13:00:00.000Z');
});

test('rejects missing code and replayed state', async () => {
  const repository = createRepository();
  const providerRegistry = createRegistry();
  const start = await startOAuthConnection({ provider: 'instagram', redirectUri: 'http://localhost/callback', repository, providerRegistry, now });
  await assert.rejects(() => completeOAuthConnection({ provider: 'instagram', code: '', state: start.state, repository, providerRegistry, cipher: createTokenCipher('oauth service key'), now }), /OAUTH_CODE_REQUIRED/);
  await completeOAuthConnection({ provider: 'instagram', code: 'code-1', state: start.state, repository, providerRegistry, cipher: createTokenCipher('oauth service key'), now });
  await assert.rejects(() => completeOAuthConnection({ provider: 'instagram', code: 'code-1', state: start.state, repository, providerRegistry, cipher: createTokenCipher('oauth service key'), now }), /OAUTH_STATE_INVALID/);
});
