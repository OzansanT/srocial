import test from 'node:test';
import assert from 'node:assert/strict';
import { getDueJobs } from '../server/scheduler/scheduler.js';
import { JOB_STATES } from '../server/scheduler/job-states.js';

test('getDueJobs returns due scheduled and retrying jobs and excludes future or terminal jobs', () => {
  const now = new Date('2026-09-10T12:00:00.000Z');
  const jobs = [
    { id: 1, state: JOB_STATES.SCHEDULED, scheduledAt: '2026-09-10T11:59:00.000Z' },
    { id: 2, state: JOB_STATES.SCHEDULED, scheduledAt: '2026-09-10T12:01:00.000Z' },
    { id: 3, state: JOB_STATES.RETRYING, scheduledAt: '2026-09-10T11:58:00.000Z' },
    { id: 4, state: JOB_STATES.COMPLETED, scheduledAt: '2026-09-10T11:57:00.000Z' },
    { id: 5, state: JOB_STATES.FAILED, scheduledAt: '2026-09-10T11:56:00.000Z' }
  ];

  assert.deepEqual(getDueJobs(jobs, now).map((job) => job.id), [1, 3]);
});
