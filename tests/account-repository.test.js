import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createJsonRepository } from '../server/db/json-repository.js';

async function withRepo(run) {
  const directory = await mkdtemp(join(tmpdir(), 'srocial-oauth-'));
  try {
    const repository = createJsonRepository({ filePath: join(directory, 'data.json') });
    await repository.initialize();
    await run(repository);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('persists and retrieves accounts by provider identity', async () => {
  await withRepo(async (repository) => {
    const account = await repository.createAccount({ provider: 'instagram', providerAccountId: 'ig-1', displayName: 'Demo' });
    assert.equal((await repository.findAccountByProviderIdentity('instagram', 'ig-1')).id, account.id);
    assert.equal((await repository.listAccounts()).length, 1);
  });
});

test('updates accounts without allowing id replacement', async () => {
  await withRepo(async (repository) => {
    const account = await repository.createAccount({ provider: 'instagram', providerAccountId: 'ig-1' });
    const updated = await repository.updateAccount(account.id, { id: 'evil', displayName: 'Changed' });
    assert.equal(updated.id, account.id);
    assert.equal(updated.displayName, 'Changed');
  });
});

test('oauth state is consumed once and expired state is rejected', async () => {
  await withRepo(async (repository) => {
    await repository.createOAuthState({ stateHash: 'abc', provider: 'instagram', expiresAt: '2026-09-10T13:00:00.000Z', consumedAt: null });
    const first = await repository.consumeOAuthState('abc', { now: new Date('2026-09-10T12:00:00.000Z') });
    assert.equal(first.provider, 'instagram');
    assert.equal(await repository.consumeOAuthState('abc', { now: new Date('2026-09-10T12:01:00.000Z') }), null);
    await repository.createOAuthState({ stateHash: 'expired', provider: 'instagram', expiresAt: '2026-09-10T11:00:00.000Z', consumedAt: null });
    assert.equal(await repository.consumeOAuthState('expired', { now: new Date('2026-09-10T12:00:00.000Z') }), null);
  });
});
