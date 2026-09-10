import test from 'node:test';
import assert from 'node:assert/strict';
import { upsertConnectedAccount, listSafeAccounts, disconnectAccount } from '../server/services/account-service.js';
import { createTokenCipher } from '../server/auth/token-crypto.js';

function createRepository() {
  const rows = [];
  let id = 0;
  return {
    rows,
    async createAccount(record) { const item = { id: String(++id), ...structuredClone(record) }; rows.push(item); return structuredClone(item); },
    async updateAccount(accountId, patch) { const item = rows.find((row) => row.id === accountId); if (!item) return null; Object.assign(item, structuredClone(patch), { id: item.id }); return structuredClone(item); },
    async findAccountByProviderIdentity(provider, providerAccountId) { const item = rows.find((row) => row.provider === provider && row.providerAccountId === providerAccountId); return item ? structuredClone(item) : null; },
    async listAccounts() { return structuredClone(rows); },
    async getAccount(accountId) { const item = rows.find((row) => row.id === accountId); return item ? structuredClone(item) : null; }
  };
}

const cipher = createTokenCipher('service test secret');
const now = new Date('2026-09-10T12:00:00.000Z');

test('encrypts tokens and exposes only safe account metadata', async () => {
  const repository = createRepository();
  const safe = await upsertConnectedAccount(repository, cipher, { provider: 'instagram', providerAccountId: 'ig-1', displayName: 'Demo', username: 'demo', accessToken: 'access', refreshToken: 'refresh', expiresAt: '2026-10-10T12:00:00.000Z', scopes: ['publish'] }, { now });
  assert.equal(safe.state, 'CONNECTED');
  assert.notEqual(repository.rows[0].accessTokenEncrypted, 'access');
  const listed = await listSafeAccounts(repository);
  assert.equal(listed[0].displayName, 'Demo');
  assert.equal('accessTokenEncrypted' in listed[0], false);
  assert.equal('refreshTokenEncrypted' in listed[0], false);
});

test('reconnect updates the existing provider identity', async () => {
  const repository = createRepository();
  const first = await upsertConnectedAccount(repository, cipher, { provider: 'instagram', providerAccountId: 'ig-1', displayName: 'Old', accessToken: 'one' }, { now });
  const second = await upsertConnectedAccount(repository, cipher, { provider: 'instagram', providerAccountId: 'ig-1', displayName: 'New', accessToken: 'two' }, { now: new Date('2026-09-10T13:00:00.000Z') });
  assert.equal(first.id, second.id);
  assert.equal(repository.rows.length, 1);
  assert.equal(second.displayName, 'New');
});

test('disconnect clears credential material and marks account disconnected', async () => {
  const repository = createRepository();
  const account = await upsertConnectedAccount(repository, cipher, { provider: 'threads', providerAccountId: 'th-1', displayName: 'Thread', accessToken: 'secret', refreshToken: 'refresh' }, { now });
  const safe = await disconnectAccount(repository, account.id, { now: new Date('2026-09-10T14:00:00.000Z') });
  assert.equal(safe.state, 'DISCONNECTED');
  assert.equal(repository.rows[0].accessTokenEncrypted, null);
  assert.equal(repository.rows[0].refreshTokenEncrypted, null);
  assert.equal(repository.rows[0].disconnectedAt, '2026-09-10T14:00:00.000Z');
});
