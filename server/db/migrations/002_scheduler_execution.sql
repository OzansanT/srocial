BEGIN;

ALTER TABLE scheduler_jobs
  ADD COLUMN error_code text;

CREATE INDEX idx_scheduler_jobs_claim
  ON scheduler_jobs(state, scheduled_at, locked_at);

CREATE UNIQUE INDEX idx_scheduler_jobs_active_status_check
  ON scheduler_jobs(publication_id)
  WHERE type = 'STATUS_CHECK'
    AND publication_id IS NOT NULL
    AND state IN ('SCHEDULED', 'RUNNING', 'RETRYING');

COMMENT ON COLUMN scheduler_jobs.state IS
  'Scheduler execution state: SCHEDULED, RUNNING, RETRYING, COMPLETED, FAILED, or CANCELLED.';

COMMIT;
