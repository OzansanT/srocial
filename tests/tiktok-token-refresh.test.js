import test from 'node:test';
import assert from 'node:assert/strict';
import { createTokenCipher } from '../server/auth/token-crypto.js';
import { getNextTokenRefreshAt } from '../server/scheduler/token-refresh-schedule.js';
import { executeTokenRefreshJob } from '../server/scheduler/workers/token-refresh-worker.js';
import { JOB_STATES } from '../server/scheduler/job-states.js';
import { JOB_TYPES } from '../server/scheduler/job-types.js';

const now = new Date('2026-09-14T10:00:00.000Z');

test('short-lived access tokens refresh before expiry without a 24-hour minimum-age dead zone', () => {
  const account = {
    id:'tt-1', provider:'tiktok', state:'CONNECTED',
    connectedAt:'2026-09-14T10:00:00.000Z', tokenExpiresAt:'2026-09-15T10:00:00.000Z'
  };
  assert.equal(getNextTokenRefreshAt(account, { now }).toISOString(), '2026-09-14T22:00:00.000Z');
});

test('token refresh worker supplies refresh token and persists provider rotation atomically', async () => {
  const cipher = createTokenCipher('tiktok-refresh-worker-secret');
  const account = {
    id:'tt-1', provider:'tiktok', providerAccountId:'open-1', state:'CONNECTED',
    accessTokenEncrypted:cipher.encrypt('access-old'), refreshTokenEncrypted:cipher.encrypt('refresh-old'),
    tokenExpiresAt:'2026-09-14T18:00:00.000Z', connectedAt:'2026-09-13T10:00:00.000Z',
    lastErrorCode:null, updatedAt:'2026-09-13T10:00:00.000Z'
  };
  const job = {
    id:'refresh-tt', type:JOB_TYPES.TOKEN_REFRESH, accountId:account.id, publicationId:null, campaignId:null,
    state:JOB_STATES.RUNNING, scheduledAt:now.toISOString(), attempts:1,
    lockedAt:now.toISOString(), lockedBy:'worker-1', errorCode:null,
    createdAt:'2026-09-13T10:00:00.000Z', updatedAt:now.toISOString()
  };
  const repository = {
    async getAccount(id){ return id === account.id ? structuredClone(account) : null; },
    async updateAccount(id, patch){ if (id !== account.id) return null; Object.assign(account, structuredClone(patch)); return structuredClone(account); },
    async updateJob(id, patch){ if (id !== job.id) return null; Object.assign(job, structuredClone(patch)); return structuredClone(job); }
  };
  const registry = new Map([['tiktok', {
    async refreshAccessToken({ accessToken, refreshToken }) {
      assert.equal(accessToken, 'access-old');
      assert.equal(refreshToken, 'refresh-old');
      return { accessToken:'access-new', refreshToken:'refresh-new', expiresAt:'2026-09-15T10:00:00.000Z' };
    }
  }]]);

  const result = await executeTokenRefreshJob({ job:structuredClone(job), repository, oauthRegistry:registry, tokenCipher:cipher, now });
  assert.equal(result.status, JOB_STATES.SCHEDULED);
  assert.equal(cipher.decrypt(account.accessTokenEncrypted), 'access-new');
  assert.equal(cipher.decrypt(account.refreshTokenEncrypted), 'refresh-new');
  assert.equal(account.tokenExpiresAt, '2026-09-15T10:00:00.000Z');
  assert.equal(job.scheduledAt, '2026-09-14T22:00:00.000Z');
});
