import { JOB_STATES } from './job-states.js';
import { executeJob } from './job-dispatcher.js';

export async function runSchedulerTick({
  repository,
  registry,
  oauthRegistry,
  tokenCipher,
  now = new Date(),
  workerId,
  limit = 10,
  lockTimeoutMs = 120_000,
  retryPolicy
}) {
  const claimedJobs = await repository.claimDueJobs({ now, workerId, limit, lockTimeoutMs });
  const results = [];

  for (const job of claimedJobs) {
    try {
      results.push(await executeJob({ job, repository, registry, oauthRegistry, tokenCipher, now, retryPolicy }));
    } catch (error) {
      await repository.updateJob(job.id, {
        state: JOB_STATES.FAILED,
        lockedAt: null,
        lockedBy: null,
        errorCode: 'EXECUTION_ERROR',
        updatedAt: now.toISOString()
      });
      results.push({ status: JOB_STATES.FAILED, errorCode: 'EXECUTION_ERROR' });
    }
  }

  return {
    claimed: claimedJobs.length,
    completed: results.filter((item) => item.status === JOB_STATES.COMPLETED).length,
    retrying: results.filter((item) => item.status === JOB_STATES.RETRYING).length,
    rescheduled: results.filter((item) => item.status === JOB_STATES.SCHEDULED).length,
    failed: results.filter((item) => item.status === JOB_STATES.FAILED).length,
    results
  };
}
