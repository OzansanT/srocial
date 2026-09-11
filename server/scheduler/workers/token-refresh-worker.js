import { getOAuthProvider } from '../../auth/oauth-provider-registry.js';
import { ACCOUNT_STATES } from '../../services/account-service.js';
import { JOB_STATES } from '../job-states.js';
import { JOB_TYPES } from '../job-types.js';
import { classifyExecutionError, getRetryDelayMs } from '../retry-policy.js';
import { getNextTokenRefreshAt } from '../token-refresh-schedule.js';

function workerError(code, retryable = false) {
  const error = new Error(code);
  error.code = code;
  error.retryable = retryable;
  return error;
}

function unlockedPatch(now) {
  return { lockedAt: null, lockedBy: null, updatedAt: now.toISOString() };
}

async function failJob(repository, job, now, code) {
  await repository.updateJob(job.id, {
    state: JOB_STATES.FAILED,
    errorCode: code,
    ...unlockedPatch(now)
  });
  return { status: JOB_STATES.FAILED, errorCode: code };
}

async function cancelJob(repository, job, now, code = null, extra = {}) {
  await repository.updateJob(job.id, {
    state: JOB_STATES.CANCELLED,
    errorCode: code,
    ...unlockedPatch(now)
  });
  return { status: JOB_STATES.CANCELLED, ...(code ? { errorCode: code } : {}), ...extra };
}

async function markAccountFailure(repository, account, now, code) {
  const state = code === 'AUTH_ERROR' ? ACCOUNT_STATES.EXPIRED : ACCOUNT_STATES.ERROR;
  await repository.updateAccount(account.id, {
    state,
    lastErrorCode: code,
    updatedAt: now.toISOString()
  });
}

async function handleFailure({ error, job, account, repository, now, retryPolicy }) {
  const classification = retryPolicy.classifyExecutionError(error);
  if (classification.retryable) {
    const delayMs = retryPolicy.getRetryDelayMs(job.attempts);
    await repository.updateJob(job.id, {
      state: JOB_STATES.RETRYING,
      scheduledAt: new Date(now.getTime() + delayMs).toISOString(),
      errorCode: classification.code,
      ...unlockedPatch(now)
    });
    return { status: JOB_STATES.RETRYING, errorCode: classification.code };
  }

  if (account) await markAccountFailure(repository, account, now, classification.code);
  return failJob(repository, job, now, classification.code);
}

function requireTokenCipher(tokenCipher) {
  if (!tokenCipher || typeof tokenCipher.decrypt !== 'function' || typeof tokenCipher.encrypt !== 'function') {
    throw workerError('AUTH_ERROR');
  }
  return tokenCipher;
}

function requireFutureExpiry(value, now) {
  const milliseconds = Date.parse(value ?? '');
  if (!Number.isFinite(milliseconds) || milliseconds <= now.getTime()) throw workerError('INVALID_TOKEN_REFRESH_RESULT');
  return new Date(milliseconds).toISOString();
}

export async function executeTokenRefreshJob({
  job,
  repository,
  oauthRegistry,
  tokenCipher,
  now = new Date(),
  retryPolicy = { classifyExecutionError, getRetryDelayMs }
} = {}) {
  let account = null;

  try {
    if (job?.type !== JOB_TYPES.TOKEN_REFRESH) throw workerError('INVALID_JOB_TYPE');
    const accountId = String(job?.accountId ?? '').trim();
    if (!accountId) throw workerError('ACCOUNT_NOT_FOUND');
    account = await repository.getAccount(accountId);
    if (!account) throw workerError('ACCOUNT_NOT_FOUND');

    if (account.state !== ACCOUNT_STATES.CONNECTED) {
      return cancelJob(repository, job, now);
    }

    const expiresMs = Date.parse(account.tokenExpiresAt ?? '');
    if (!Number.isFinite(expiresMs) || expiresMs <= now.getTime()) {
      await markAccountFailure(repository, account, now, 'AUTH_ERROR');
      return failJob(repository, job, now, 'AUTH_ERROR');
    }

    const cipher = requireTokenCipher(tokenCipher);
    const originalCiphertext = account.accessTokenEncrypted;
    if (!originalCiphertext) throw workerError('AUTH_ERROR');

    let accessToken;
    try {
      accessToken = cipher.decrypt(originalCiphertext);
    } catch {
      throw workerError('AUTH_ERROR');
    }
    if (!String(accessToken ?? '').trim()) throw workerError('AUTH_ERROR');

    let adapter;
    try {
      adapter = getOAuthProvider(oauthRegistry, account.provider);
    } catch {
      throw workerError('TOKEN_REFRESH_UNSUPPORTED');
    }
    if (typeof adapter?.refreshAccessToken !== 'function') throw workerError('TOKEN_REFRESH_UNSUPPORTED');

    const refreshed = await adapter.refreshAccessToken({ accessToken });
    const refreshedToken = String(refreshed?.accessToken ?? '').trim();
    if (!refreshedToken) throw workerError('INVALID_TOKEN_REFRESH_RESULT');
    const expiresAt = requireFutureExpiry(refreshed?.expiresAt, now);

    const latest = await repository.getAccount(account.id);
    if (!latest || latest.state !== ACCOUNT_STATES.CONNECTED || latest.accessTokenEncrypted !== originalCiphertext) {
      return cancelJob(repository, job, now, 'STALE_TOKEN_REFRESH', { stale: true });
    }

    const updatedAccount = await repository.updateAccount(account.id, {
      state: ACCOUNT_STATES.CONNECTED,
      accessTokenEncrypted: cipher.encrypt(refreshedToken),
      tokenExpiresAt: expiresAt,
      lastErrorCode: null,
      updatedAt: now.toISOString()
    });

    const nextRefreshAt = getNextTokenRefreshAt(updatedAccount, { now });
    if (!nextRefreshAt) {
      await repository.updateJob(job.id, {
        state: JOB_STATES.COMPLETED,
        attempts: 0,
        errorCode: null,
        ...unlockedPatch(now)
      });
      return { status: JOB_STATES.COMPLETED };
    }

    await repository.updateJob(job.id, {
      state: JOB_STATES.SCHEDULED,
      scheduledAt: nextRefreshAt.toISOString(),
      attempts: 0,
      errorCode: null,
      ...unlockedPatch(now)
    });
    return { status: JOB_STATES.SCHEDULED, scheduledAt: nextRefreshAt.toISOString() };
  } catch (error) {
    return handleFailure({ error, job, account, repository, now, retryPolicy });
  }
}
