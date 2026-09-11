import test from 'node:test';
import assert from 'node:assert/strict';
import { createTokenCipher } from '../server/auth/token-crypto.js';
import { executeTokenRefreshJob } from '../server/scheduler/workers/token-refresh-worker.js';
import { JOB_STATES } from '../server/scheduler/job-states.js';
import { JOB_TYPES } from '../server/scheduler/job-types.js';

function createRepository(initialAccount) {
  const account = structuredClone(initialAccount);
  const job = {
    id:'refresh-1', type:JOB_TYPES.TOKEN_REFRESH, accountId:account.id,
    publicationId:null, campaignId:null, state:JOB_STATES.RUNNING,
    scheduledAt:'2026-09-11T12:00:00.000Z', attempts:1,
    lockedAt:'2026-09-11T12:00:00.000Z', lockedBy:'worker-1', errorCode:null,
    createdAt:'2026-09-01T12:00:00.000Z', updatedAt:'2026-09-11T12:00:00.000Z'
  };
  return {
    account,
    job,
    async getAccount(id) { return id === account.id ? structuredClone(account) : null; },
    async updateAccount(id, patch) { if (id !== account.id) return null; Object.assign(account, structuredClone(patch)); return structuredClone(account); },
    async updateJob(id, patch) { if (id !== job.id) return null; Object.assign(job, structuredClone(patch)); return structuredClone(job); }
  };
}

function connectedAccount(cipher, overrides = {}) {
  return {
    id:'account-1', provider:'instagram', providerAccountId:'ig-1', state:'CONNECTED',
    accessTokenEncrypted:cipher.encrypt('old-long-token'), refreshTokenEncrypted:null,
    tokenExpiresAt:'2026-09-20T12:00:00.000Z', connectedAt:'2026-08-01T12:00:00.000Z',
    lastErrorCode:null, updatedAt:'2026-09-01T12:00:00.000Z',
    ...overrides
  };
}

function oauthRegistry(adapter) { return new Map([['instagram', adapter]]); }
const now = new Date('2026-09-11T12:00:00.000Z');

test('refreshes, re-encrypts and reschedules the same TOKEN_REFRESH job', async () => {
  const cipher = createTokenCipher('worker test secret');
  const repository = createRepository(connectedAccount(cipher));
  const result = await executeTokenRefreshJob({
    job:structuredClone(repository.job), repository, oauthRegistry:oauthRegistry({
      async refreshAccessToken({ accessToken }) {
        assert.equal(accessToken, 'old-long-token');
        return { accessToken:'fresh-long-token', expiresAt:'2026-11-10T12:00:00.000Z' };
      }
    }), tokenCipher:cipher, now
  });
  assert.equal(result.status, JOB_STATES.SCHEDULED);
  assert.equal(cipher.decrypt(repository.account.accessTokenEncrypted), 'fresh-long-token');
  assert.equal(repository.account.tokenExpiresAt, '2026-11-10T12:00:00.000Z');
  assert.equal(repository.account.state, 'CONNECTED');
  assert.equal(repository.account.lastErrorCode, null);
  assert.equal(repository.job.state, JOB_STATES.SCHEDULED);
  assert.equal(repository.job.scheduledAt, '2026-10-11T12:00:00.000Z');
  assert.equal(repository.job.attempts, 0);
  assert.equal(repository.job.lockedAt, null);
  assert.equal(repository.job.lockedBy, null);
});

test('retries rate limit and network failures without replacing the stored token', async () => {
  for (const code of ['RATE_LIMIT', 'NETWORK_ERROR']) {
    const cipher = createTokenCipher(`retry-${code}`);
    const repository = createRepository(connectedAccount(cipher));
    const originalCiphertext = repository.account.accessTokenEncrypted;
    const error = new Error(code); error.code = code; error.retryable = true;
    const result = await executeTokenRefreshJob({
      job:structuredClone(repository.job), repository,
      oauthRegistry:oauthRegistry({ async refreshAccessToken(){ throw error; } }),
      tokenCipher:cipher, now
    });
    assert.equal(result.status, JOB_STATES.RETRYING);
    assert.equal(repository.job.state, JOB_STATES.RETRYING);
    assert.equal(repository.job.errorCode, code);
    assert.equal(repository.job.scheduledAt, '2026-09-11T12:01:00.000Z');
    assert.equal(repository.account.accessTokenEncrypted, originalCiphertext);
    assert.equal(repository.account.state, 'CONNECTED');
  }
});

test('marks invalid credentials expired and fails permanently', async () => {
  const cipher = createTokenCipher('expired-error-secret');
  const repository = createRepository(connectedAccount(cipher));
  const error = new Error('AUTH_ERROR'); error.code = 'AUTH_ERROR'; error.retryable = false;
  const result = await executeTokenRefreshJob({
    job:structuredClone(repository.job), repository,
    oauthRegistry:oauthRegistry({ async refreshAccessToken(){ throw error; } }),
    tokenCipher:cipher, now
  });
  assert.equal(result.status, JOB_STATES.FAILED);
  assert.equal(repository.job.errorCode, 'AUTH_ERROR');
  assert.equal(repository.account.state, 'EXPIRED');
  assert.equal(repository.account.lastErrorCode, 'AUTH_ERROR');
});

test('does not call the provider for a disconnected or already expired account', async () => {
  for (const overrides of [
    { state:'DISCONNECTED' },
    { tokenExpiresAt:'2026-09-10T12:00:00.000Z' }
  ]) {
    const cipher = createTokenCipher(`skip-${overrides.state ?? 'expired'}`);
    const repository = createRepository(connectedAccount(cipher, overrides));
    let calls = 0;
    const result = await executeTokenRefreshJob({
      job:structuredClone(repository.job), repository,
      oauthRegistry:oauthRegistry({ async refreshAccessToken(){ calls += 1; throw new Error('must not run'); } }),
      tokenCipher:cipher, now
    });
    assert.equal(calls, 0);
    if (overrides.state === 'DISCONNECTED') {
      assert.equal(result.status, JOB_STATES.CANCELLED);
      assert.equal(repository.job.state, JOB_STATES.CANCELLED);
    } else {
      assert.equal(result.status, JOB_STATES.FAILED);
      assert.equal(repository.account.state, 'EXPIRED');
      assert.equal(repository.job.errorCode, 'AUTH_ERROR');
    }
  }
});

test('does not overwrite a token changed by reconnect while refresh was in flight', async () => {
  const cipher = createTokenCipher('stale-refresh-secret');
  const repository = createRepository(connectedAccount(cipher));
  const adapter = {
    async refreshAccessToken({ accessToken }) {
      assert.equal(accessToken, 'old-long-token');
      await repository.updateAccount('account-1', {
        accessTokenEncrypted:cipher.encrypt('reconnected-token'),
        tokenExpiresAt:'2026-12-01T12:00:00.000Z',
        connectedAt:'2026-09-11T12:00:30.000Z',
        updatedAt:'2026-09-11T12:00:30.000Z'
      });
      return { accessToken:'stale-refresh-result', expiresAt:'2026-11-10T12:00:00.000Z' };
    }
  };
  const result = await executeTokenRefreshJob({
    job:structuredClone(repository.job), repository,
    oauthRegistry:oauthRegistry(adapter), tokenCipher:cipher, now
  });
  assert.equal(result.status, JOB_STATES.CANCELLED);
  assert.equal(result.stale, true);
  assert.equal(cipher.decrypt(repository.account.accessTokenEncrypted), 'reconnected-token');
  assert.equal(repository.account.tokenExpiresAt, '2026-12-01T12:00:00.000Z');
  assert.equal(repository.job.state, JOB_STATES.CANCELLED);
  assert.equal(repository.job.errorCode, 'STALE_TOKEN_REFRESH');
});
