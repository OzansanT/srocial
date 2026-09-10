import { JOB_TYPES } from '../job-types.js';
import { JOB_STATES } from '../job-states.js';
import { PUBLICATION_STATES, TERMINAL_PUBLICATION_STATES } from '../states.js';
import { classifyExecutionError, getRetryDelayMs } from '../retry-policy.js';

function completedJobPatch(now) {
  return {
    state: JOB_STATES.COMPLETED,
    lockedAt: null,
    lockedBy: null,
    errorCode: null,
    updatedAt: now.toISOString()
  };
}

function permanentPublicationState(code) {
  if (code === 'AUTH_ERROR' || code === 'PERMISSION_DENIED') return PUBLICATION_STATES.AUTH_ERROR;
  if (code === 'MEDIA_ERROR' || code === 'INVALID_MEDIA') return PUBLICATION_STATES.MEDIA_ERROR;
  return PUBLICATION_STATES.API_ERROR;
}

function executionError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.retryable = false;
  return error;
}

export async function executeStatusCheckJob({
  job,
  repository,
  registry,
  now = new Date(),
  retryPolicy = { classifyExecutionError, getRetryDelayMs }
}) {
  let publication = null;

  try {
    if (job.type !== JOB_TYPES.STATUS_CHECK) {
      throw executionError('INVALID_JOB_TYPE', `Expected ${JOB_TYPES.STATUS_CHECK}`);
    }

    publication = await repository.getPublication(job.publicationId);
    if (!publication) throw executionError('PUBLICATION_NOT_FOUND', 'Publication not found');

    if (TERMINAL_PUBLICATION_STATES.has(publication.state)) {
      await repository.updateJob(job.id, completedJobPatch(now));
      return { status: JOB_STATES.COMPLETED, skipped: true };
    }

    const adapter = registry?.get?.(String(publication.platform ?? '').toLowerCase());
    if (!adapter || typeof adapter.getStatus !== 'function') {
      throw executionError('ADAPTER_UNAVAILABLE', `No status adapter registered for ${publication.platform}`);
    }

    const result = await adapter.getStatus({ publication });
    const status = String(result?.status ?? '').toUpperCase();

    if (status === PUBLICATION_STATES.PROCESSING) {
      await repository.updatePublication(publication.id, {
        state: PUBLICATION_STATES.PROCESSING,
        externalId: result?.externalId ?? publication.externalId ?? null,
        externalUrl: result?.externalUrl ?? publication.externalUrl ?? null,
        errorCode: null,
        updatedAt: now.toISOString()
      });
      await repository.updateJob(job.id, {
        state: JOB_STATES.SCHEDULED,
        scheduledAt: new Date(now.getTime() + 60_000).toISOString(),
        attempts: 0,
        lockedAt: null,
        lockedBy: null,
        errorCode: null,
        updatedAt: now.toISOString()
      });
      return { status: JOB_STATES.SCHEDULED, publicationState: PUBLICATION_STATES.PROCESSING };
    }

    if (status === PUBLICATION_STATES.PUBLISHED) {
      await repository.updatePublication(publication.id, {
        state: PUBLICATION_STATES.PUBLISHED,
        externalId: result?.externalId ?? publication.externalId ?? null,
        externalUrl: result?.externalUrl ?? publication.externalUrl ?? null,
        errorCode: null,
        updatedAt: now.toISOString()
      });
      await repository.updateJob(job.id, completedJobPatch(now));
      return { status: JOB_STATES.COMPLETED, publicationState: PUBLICATION_STATES.PUBLISHED };
    }

    if (status === PUBLICATION_STATES.FAILED) {
      await repository.updatePublication(publication.id, {
        state: PUBLICATION_STATES.FAILED,
        errorCode: result?.errorCode ?? 'PROVIDER_REPORTED_FAILURE',
        updatedAt: now.toISOString()
      });
      await repository.updateJob(job.id, completedJobPatch(now));
      return { status: JOB_STATES.COMPLETED, publicationState: PUBLICATION_STATES.FAILED };
    }

    throw executionError('INVALID_PROVIDER_RESULT', `Unsupported provider status: ${status || 'empty'}`);
  } catch (error) {
    const classification = retryPolicy.classifyExecutionError(error);

    if (classification.retryable) {
      await repository.updateJob(job.id, {
        state: JOB_STATES.RETRYING,
        scheduledAt: new Date(now.getTime() + retryPolicy.getRetryDelayMs(job.attempts)).toISOString(),
        lockedAt: null,
        lockedBy: null,
        errorCode: classification.code,
        updatedAt: now.toISOString()
      });
      if (publication) {
        await repository.updatePublication(publication.id, {
          errorCode: classification.code,
          updatedAt: now.toISOString()
        });
      }
      return { status: JOB_STATES.RETRYING, errorCode: classification.code };
    }

    if (publication) {
      await repository.updatePublication(publication.id, {
        state: permanentPublicationState(classification.code),
        errorCode: classification.code,
        updatedAt: now.toISOString()
      });
    }
    await repository.updateJob(job.id, {
      state: JOB_STATES.FAILED,
      lockedAt: null,
      lockedBy: null,
      errorCode: classification.code,
      updatedAt: now.toISOString()
    });
    return { status: JOB_STATES.FAILED, errorCode: classification.code };
  }
}
