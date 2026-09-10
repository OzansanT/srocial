import { PUBLICATION_STATES, TERMINAL_PUBLICATION_STATES } from './states.js';

export function getDueJobs(jobs, now = new Date()) {
  const nowMs = now.getTime();

  return jobs.filter((job) => {
    if (TERMINAL_PUBLICATION_STATES.has(job.state)) return false;
    if (job.state !== PUBLICATION_STATES.SCHEDULED && job.state !== PUBLICATION_STATES.RETRYING) return false;

    const scheduledMs = Date.parse(job.scheduledAt);
    return Number.isFinite(scheduledMs) && scheduledMs <= nowMs;
  });
}
