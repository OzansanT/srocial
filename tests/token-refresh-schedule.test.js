import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureTokenRefreshJob, getNextTokenRefreshAt } from '../server/scheduler/token-refresh-schedule.js';
import { JOB_STATES } from '../server/scheduler/job-states.js';
import { JOB_TYPES } from '../server/scheduler/job-types.js';

function account(overrides = {}) {
  return {
    id:'account-1',
    provider:'instagram',
    state:'CONNECTED',
    connectedAt:'2026-09-11T12:00:00.000Z',
    tokenExpiresAt:'2026-11-10T12:00:00.000Z',
    ...overrides
  };
}

function repositoryWithJobs(initial = []) {
  const jobs = initial.map((job) => ({ ...job }));
  return {
    jobs,
    async listJobs() { return structuredClone(jobs); },
    async createJob(record) { const item = { id:`job-${jobs.length + 1}`, ...record }; jobs.push(item); return structuredClone(item); },
    async updateJob(id, patch) { const item = jobs.find((job) => job.id === id); if (!item) return null; Object.assign(item, patch); return structuredClone(item); }
  };
}

const now = new Date('2026-09-11T12:00:00.000Z');

test('targets refresh 30 days before expiry while respecting Instagram minimum token age', () => {
  assert.equal(getNextTokenRefreshAt(account(), { now }).toISOString(), '2026-10-11T12:00:00.000Z');
  const shortWindow = account({ tokenExpiresAt:'2026-09-12T18:00:00.000Z' });
  assert.equal(getNextTokenRefreshAt(shortWindow, { now }).toISOString(), '2026-09-12T12:00:00.000Z');
});

test('returns null for disconnected, missing-expiry, or already-expired accounts', () => {
  assert.equal(getNextTokenRefreshAt(account({ state:'DISCONNECTED' }), { now }), null);
  assert.equal(getNextTokenRefreshAt(account({ tokenExpiresAt:null }), { now }), null);
  assert.equal(getNextTokenRefreshAt(account({ tokenExpiresAt:'2026-09-10T12:00:00.000Z' }), { now }), null);
});

test('creates one account-bound TOKEN_REFRESH job', async () => {
  const repository = repositoryWithJobs();
  const job = await ensureTokenRefreshJob(repository, account(), { now });
  assert.equal(job.type, JOB_TYPES.TOKEN_REFRESH);
  assert.equal(job.accountId, 'account-1');
  assert.equal(job.state, JOB_STATES.SCHEDULED);
  assert.equal(job.scheduledAt, '2026-10-11T12:00:00.000Z');
  assert.equal(job.publicationId, null);
  assert.equal(job.campaignId, null);
  assert.equal(repository.jobs.length, 1);
});

test('reuses an existing scheduled or retrying refresh job instead of duplicating it', async () => {
  const repository = repositoryWithJobs([{
    id:'refresh-1', type:JOB_TYPES.TOKEN_REFRESH, accountId:'account-1', state:JOB_STATES.RETRYING,
    scheduledAt:'2026-09-20T12:00:00.000Z', attempts:3, lockedAt:null, lockedBy:null, errorCode:'RATE_LIMIT',
    createdAt:'2026-09-11T12:00:00.000Z', updatedAt:'2026-09-11T12:00:00.000Z'
  }]);
  const job = await ensureTokenRefreshJob(repository, account(), { now });
  assert.equal(job.id, 'refresh-1');
  assert.equal(job.state, JOB_STATES.SCHEDULED);
  assert.equal(job.scheduledAt, '2026-10-11T12:00:00.000Z');
  assert.equal(job.attempts, 0);
  assert.equal(job.errorCode, null);
  assert.equal(repository.jobs.length, 1);
});

test('does not reuse an in-flight refresh job during reconnect', async () => {
  const repository = repositoryWithJobs([{
    id:'refresh-running', type:JOB_TYPES.TOKEN_REFRESH, accountId:'account-1', state:JOB_STATES.RUNNING,
    scheduledAt:'2026-09-11T12:00:00.000Z', attempts:1, lockedAt:'2026-09-11T12:00:00.000Z', lockedBy:'worker-1', errorCode:null,
    createdAt:'2026-09-01T12:00:00.000Z', updatedAt:'2026-09-11T12:00:00.000Z'
  }]);
  const job = await ensureTokenRefreshJob(repository, account(), { now });
  assert.notEqual(job.id, 'refresh-running');
  assert.equal(repository.jobs.length, 2);
  assert.equal(job.state, JOB_STATES.SCHEDULED);
});
