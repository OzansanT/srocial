import { recordProviderFailure, recordProviderSuccess } from '../../operations/provider-telemetry.js';
import { JOB_TYPES } from '../job-types.js';
import { JOB_STATES } from '../job-states.js';
import { PUBLICATION_STATES } from '../states.js';
import { classifyExecutionError, getRetryDelayMs } from '../retry-policy.js';

const SKIP_PUBLISH_STATES = new Set([
  PUBLICATION_STATES.PUBLISHED,
  PUBLICATION_STATES.PROCESSING,
  PUBLICATION_STATES.FAILED,
  PUBLICATION_STATES.CANCELLED
]);

function failurePublicationState(code, retryable) {
  if (code === 'RATE_LIMIT') return PUBLICATION_STATES.RATE_LIMITED;
  if (code === 'AUTH_ERROR' || code === 'PERMISSION_DENIED') return PUBLICATION_STATES.AUTH_ERROR;
  if (code === 'MEDIA_ERROR' || code === 'INVALID_MEDIA') return PUBLICATION_STATES.MEDIA_ERROR;
  if (retryable) return PUBLICATION_STATES.RETRYING;
  return PUBLICATION_STATES.API_ERROR;
}

function executionError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.retryable = false;
  return error;
}

function completedJobPatch(now) {
  return {
    state: JOB_STATES.COMPLETED,
    lockedAt: null,
    lockedBy: null,
    errorCode: null,
    updatedAt: now.toISOString()
  };
}

async function startAttempt(repository, publication, job, now) {
  if (typeof repository?.createPublicationAttempt !== 'function') return null;
  return repository.createPublicationAttempt({
    publicationId: publication.id,
    attempt: Math.max(1, Number(job.attempts) || 1),
    state: PUBLICATION_STATES.PUBLISHING,
    providerErrorCode: null,
    errorMessage: null,
    startedAt: now.toISOString(),
    finishedAt: null
  });
}

async function finishAttempt(repository, attempt, patch) {
  if (!attempt || typeof repository?.updatePublicationAttempt !== 'function') return null;
  return repository.updatePublicationAttempt(attempt.id, patch);
}

async function handleFailure({ error, job, publication, attempt, repository, now, retryPolicy }) {
  const classification = retryPolicy.classifyExecutionError(error);
  const publicationState = failurePublicationState(classification.code, classification.retryable);

  if (publication) {
    await repository.updatePublication(publication.id, {
      state: publicationState,
      errorCode: classification.code,
      updatedAt: now.toISOString()
    });
  }

  let retryAt = null;
  if (classification.retryable) {
    const delayMs = retryPolicy.getRetryDelayMs(job.attempts);
    retryAt = new Date(now.getTime() + delayMs);
    await repository.updateJob(job.id, {
      state: JOB_STATES.RETRYING,
      scheduledAt: retryAt.toISOString(),
      lockedAt: null,
      lockedBy: null,
      errorCode: classification.code,
      updatedAt: now.toISOString()
    });
  } else {
    await repository.updateJob(job.id, {
      state: JOB_STATES.FAILED,
      lockedAt: null,
      lockedBy: null,
      errorCode: classification.code,
      updatedAt: now.toISOString()
    });
  }

  await finishAttempt(repository, attempt, {
    state: classification.retryable ? JOB_STATES.RETRYING : JOB_STATES.FAILED,
    providerErrorCode: classification.code,
    errorMessage: null,
    finishedAt: now.toISOString()
  });
  if (publication) {
    await recordProviderFailure(repository, publication.platform, classification.code, {
      now,
      limitedUntil: classification.code === 'RATE_LIMIT' ? retryAt : null
    });
  }

  return {
    status: classification.retryable ? JOB_STATES.RETRYING : JOB_STATES.FAILED,
    errorCode: classification.code
  };
}

export async function executeSocialPublicationJob({
  job,
  repository,
  registry,
  now = new Date(),
  retryPolicy = { classifyExecutionError, getRetryDelayMs }
}) {
  let publication = null;
  let attempt = null;

  try {
    if (job.type !== JOB_TYPES.SOCIAL_PUBLICATION) {
      throw executionError('INVALID_JOB_TYPE', `Expected ${JOB_TYPES.SOCIAL_PUBLICATION}`);
    }

    publication = await repository.getPublication(job.publicationId);
    if (!publication) throw executionError('PUBLICATION_NOT_FOUND', 'Publication not found');

    if (SKIP_PUBLISH_STATES.has(publication.state)) {
      await repository.updateJob(job.id, completedJobPatch(now));
      return { status: JOB_STATES.COMPLETED, skipped: true };
    }

    const post = await repository.getPost(publication.postId);
    if (!post) throw executionError('POST_NOT_FOUND', 'Post not found');

    const adapter = registry?.get?.(String(publication.platform ?? '').toLowerCase());
    if (!adapter || typeof adapter.publish !== 'function') {
      throw executionError('ADAPTER_UNAVAILABLE', `No publish adapter registered for ${publication.platform}`);
    }

    attempt = await startAttempt(repository, publication, job, now);
    const result = await adapter.publish(
      { post, publication },
      { idempotencyKey: publication.id }
    );
    const status = String(result?.status ?? '').toUpperCase();

    if (status !== PUBLICATION_STATES.PUBLISHED && status !== PUBLICATION_STATES.PROCESSING) {
      throw executionError('INVALID_PROVIDER_RESULT', `Unsupported provider publish status: ${status || 'empty'}`);
    }

    await repository.updatePublication(publication.id, {
      state: status,
      externalId: result?.externalId ?? publication.externalId ?? null,
      externalUrl: result?.externalUrl ?? publication.externalUrl ?? null,
      errorCode: null,
      updatedAt: now.toISOString()
    });

    await repository.updateJob(job.id, completedJobPatch(now));
    await finishAttempt(repository, attempt, {
      state: status,
      providerErrorCode: null,
      errorMessage: null,
      finishedAt: now.toISOString()
    });
    await recordProviderSuccess(repository, publication.platform, { now });

    if (status === PUBLICATION_STATES.PROCESSING) {
      await repository.createJob({
        type: JOB_TYPES.STATUS_CHECK,
        publicationId: publication.id,
        campaignId: null,
        accountId: null,
        state: JOB_STATES.SCHEDULED,
        scheduledAt: new Date(now.getTime() + 60_000).toISOString(),
        attempts: 0,
        lockedAt: null,
        lockedBy: null,
        errorCode: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      });
    }

    return { status: JOB_STATES.COMPLETED, publicationState: status };
  } catch (error) {
    return handleFailure({ error, job, publication, attempt, repository, now, retryPolicy });
  }
}
