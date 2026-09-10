import { JOB_STATES, TERMINAL_JOB_STATES } from './job-states.js';

export function getDueJobs(jobs, now = new Date()) {
  const nowMs = now.getTime();

  return jobs.filter((job) => {
    if (TERMINAL_JOB_STATES.has(job.state)) return false;
    if (job.state !== JOB_STATES.SCHEDULED && job.state !== JOB_STATES.RETRYING) return false;

    const scheduledMs = Date.parse(job.scheduledAt);
    return Number.isFinite(scheduledMs) && scheduledMs <= nowMs;
  });
}
