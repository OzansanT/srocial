import test from 'node:test';
import assert from 'node:assert/strict';
import { issueOAuthState, consumeOAuthState } from '../server/auth/oauth-state-service.js';

function createRepository() {
  const rows = [];
  return {
    rows,
    async createOAuthState(record) { rows.push({ ...record }); return { ...record }; },
    async getOAuthState(hash) { const item = rows.find((row) => row.stateHash === hash); return item ? { ...item } : null; },
    async consumeOAuthState(hash, { now }) {
      const item = rows.find((row) => row.stateHash === hash && !row.consumedAt && Date.parse(row.expiresAt) > now.getTime());
      if (!item) return null;
      item.consumedAt = now.toISOString();
      return { ...item };
    }
  };
}

const now = new Date('2026-09-10T12:00:00.000Z');

test('issues unpredictable state and stores only its hash', async () => {
  const repository = createRepository();
  const first = await issueOAuthState(repository, { provider: 'Instagram', redirectUri: 'http://localhost/cb', now });
  const second = await issueOAuthState(repository, { provider: 'instagram', redirectUri: 'http://localhost/cb', now });
  assert.notEqual(first.state, second.state);
  assert.notEqual(repository.rows[0].stateHash, first.state);
  assert.equal(repository.rows[0].provider, 'instagram');
});

test('consumes state once and enforces provider match', async () => {
  const repository = createRepository();
  const issued = await issueOAuthState(repository, { provider: 'instagram', redirectUri: 'http://localhost/cb', now });
  await assert.rejects(() => consumeOAuthState(repository, { provider: 'threads', state: issued.state, now }), /OAUTH_STATE_PROVIDER_MISMATCH/);
  const consumed = await consumeOAuthState(repository, { provider: 'instagram', state: issued.state, now });
  assert.equal(consumed.redirectUri, 'http://localhost/cb');
  await assert.rejects(() => consumeOAuthState(repository, { provider: 'instagram', state: issued.state, now }), /OAUTH_STATE_INVALID/);
});
