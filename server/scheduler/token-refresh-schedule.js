import { JOB_STATES } from './job-states.js';
import { JOB_TYPES } from './job-types.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_REFRESH_LEAD_MS = 30 * DAY_MS;
const MIN_TOKEN_AGE_MS = DAY_MS;
const REUSABLE_STATES = new Set([JOB_STATES.SCHEDULED, JOB_STATES.RETRYING]);

function parseTime(value) {
  const milliseconds = Date.parse(value ?? '');
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

export function getNextTokenRefreshAt(account, { now = new Date(), refreshLeadMs = DEFAULT_REFRESH_LEAD_MS } = {}) {
  if (!account || account.state !== 'CONNECTED') return null;
  const nowMs = now.getTime();
  const expiresMs = parseTime(account.tokenExpiresAt);
  if (expiresMs === null || expiresMs <= nowMs) return null;

  const connectedMs = parseTime(account.connectedAt);
  const minimumRefreshMs = connectedMs === null ? nowMs : connectedMs + MIN_TOKEN_AGE_MS;
  const desiredMs = expiresMs - Math.max(0, Number(refreshLeadMs) || DEFAULT_REFRESH_LEAD_MS);
  const targetMs = Math.max(nowMs, minimumRefreshMs, desiredMs);
  if (targetMs >= expiresMs) return null;
  return new Date(targetMs);
}

export async function ensureTokenRefreshJob(repository, account, { now = new Date() } = {}) {
  if (!repository || typeof repository.listJobs !== 'function' || typeof repository.createJob !== 'function' || typeof repository.updateJob !== 'function') {
    throw new Error('TOKEN_REFRESH_REPOSITORY_REQUIRED');
  }

  const accountId = String(account?.id ?? '').trim();
  if (!accountId) throw new Error('TOKEN_REFRESH_ACCOUNT_REQUIRED');
  const nextRefreshAt = getNextTokenRefreshAt(account, { now });
  if (!nextRefreshAt) return null;

  const jobs = await repository.listJobs();
  const existing = jobs.find((job) =>
    job.type === JOB_TYPES.TOKEN_REFRESH &&
    job.accountId === accountId &&
    REUSABLE_STATES.has(job.state)
  );
  const timestamp = now.toISOString();
  const scheduledAt = nextRefreshAt.toISOString();

  if (existing) {
    return repository.updateJob(existing.id, {
      state: JOB_STATES.SCHEDULED,
      scheduledAt,
      attempts: 0,
      lockedAt: null,
      lockedBy: null,
      errorCode: null,
      updatedAt: timestamp
    });
  }

  return repository.createJob({
    type: JOB_TYPES.TOKEN_REFRESH,
    publicationId: null,
    campaignId: null,
    accountId,
    state: JOB_STATES.SCHEDULED,
    scheduledAt,
    attempts: 0,
    lockedAt: null,
    lockedBy: null,
    errorCode: null,
    createdAt: timestamp,
    updatedAt: timestamp
  });
}
