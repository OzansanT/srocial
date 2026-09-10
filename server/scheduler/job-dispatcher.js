import { JOB_TYPES } from './job-types.js';
import { JOB_STATES } from './job-states.js';
import { executeSocialPublicationJob } from './workers/social-publication-worker.js';
import { executeStatusCheckJob } from './workers/status-check-worker.js';

export async function executeJob({ job, repository, registry, now = new Date(), retryPolicy }) {
  if (job.type === JOB_TYPES.SOCIAL_PUBLICATION) {
    return executeSocialPublicationJob({ job, repository, registry, now, retryPolicy });
  }

  if (job.type === JOB_TYPES.STATUS_CHECK) {
    return executeStatusCheckJob({ job, repository, registry, now, retryPolicy });
  }

  await repository.updateJob(job.id, {
    state: JOB_STATES.FAILED,
    lockedAt: null,
    lockedBy: null,
    errorCode: 'UNSUPPORTED_JOB_TYPE',
    updatedAt: now.toISOString()
  });
  return { status: JOB_STATES.FAILED, errorCode: 'UNSUPPORTED_JOB_TYPE' };
}
