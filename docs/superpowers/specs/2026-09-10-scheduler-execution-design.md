# Scheduler Execution Design

## Goal

Turn Srocial's existing scheduled-job model into a safe execution engine that can claim due jobs, prevent duplicate concurrent execution, dispatch jobs to isolated workers, retry recoverable failures, and create follow-up status checks when providers return asynchronous processing states.

This increment must not make real provider calls by default. Production provider adapters remain a later integration step.

## Architecture

The scheduler remains one subsystem. Job claiming belongs to the repository because claiming must be atomic relative to persisted job state. The scheduler runner asks the repository for claimable work, then dispatches each claimed job by `type`. Provider-specific logic remains in workers/adapters.

```text
scheduler tick
   |
   v
repository.claimDueJobs()
   |
   v
RUNNING + locked_at + locked_by
   |
   v
job dispatcher
   |
   +-> social-publication-worker
   |      |
   |      +-> platform registry -> adapter.publish()
   |
   +-> status-check-worker
          |
          +-> platform registry -> adapter.getStatus()
```

## Separate Job States

Jobs must no longer reuse publication states. Job execution and publication lifecycle are different concerns.

```text
SCHEDULED
  -> RUNNING
  -> COMPLETED

RUNNING
  -> RETRYING
  -> RUNNING

RUNNING
  -> FAILED

SCHEDULED / RETRYING
  -> CANCELLED
```

A stale `RUNNING` job whose lock has exceeded the configured timeout becomes claimable again.

## Atomic Claim Contract

The repository exposes:

```js
claimDueJobs({ now, workerId, limit, lockTimeoutMs })
```

It returns only jobs successfully claimed by that call. Claimed jobs are persisted as:

```js
{
  state: 'RUNNING',
  lockedAt: now.toISOString(),
  lockedBy: workerId,
  attempts: previousAttempts + 1,
  updatedAt: now.toISOString()
}
```

Eligible jobs are:

- `SCHEDULED` with `scheduledAt <= now`;
- `RETRYING` with `scheduledAt <= now`;
- stale `RUNNING` jobs whose `lockedAt` is older than `lockTimeoutMs`.

The JSON development repository serializes claim mutations through its existing write chain. The future PostgreSQL repository must implement the same contract using transaction-safe row locking, preferably `FOR UPDATE SKIP LOCKED`.

## Repository Update Contracts

The repository also exposes focused operations needed by workers:

```js
getPost(id)
getPublication(id)
updatePublication(id, patch)
updateJob(id, patch)
createJob(record)
```

All mutations persist before returning.

## Scheduler Runner

`runSchedulerTick()` receives injected dependencies:

```js
runSchedulerTick({
  repository,
  registry,
  now,
  workerId,
  limit,
  lockTimeoutMs,
  retryPolicy
})
```

The runner claims jobs, executes them sequentially in v3, and returns a summary. Sequential execution is deliberate for the first implementation; concurrency can be introduced later after provider rate-limit policies are known.

## Social Publication Worker

For `SOCIAL_PUBLICATION` jobs:

1. load the publication;
2. if the publication is already `PUBLISHED`, `PROCESSING`, `FAILED`, or `CANCELLED`, complete the scheduler job without calling the provider again;
3. load the parent post;
4. resolve the platform adapter from the registry;
5. call `adapter.publish()` with a stable `idempotencyKey` equal to the publication id;
6. normalize the returned state.

Supported adapter publication results in this increment:

```js
{
  status: 'PUBLISHED' | 'PROCESSING',
  externalId: string | null,
  externalUrl: string | null
}
```

`PUBLISHED` updates the publication and completes the job.

`PROCESSING` updates the publication, completes the publish job, and creates a `STATUS_CHECK` job for the same publication.

## Status Check Worker

For `STATUS_CHECK` jobs:

1. load the publication;
2. terminal publications complete the job immediately;
3. resolve the adapter;
4. call `adapter.getStatus()`;
5. if still processing, reschedule the same job;
6. if published, update the publication and complete the job;
7. if provider reports failed, update the publication to `FAILED` and complete the status-check job.

## Retry Classification

Workers classify thrown errors into either recoverable or permanent failures.

A simple internal error shape is used:

```js
{
  code: 'RATE_LIMIT' | 'NETWORK_ERROR' | 'AUTH_ERROR' | 'PROVIDER_ERROR',
  retryable: boolean
}
```

Recoverable errors reschedule the same job as `RETRYING` using bounded backoff:

```text
attempt 1 -> +1 minute
attempt 2 -> +5 minutes
attempt 3 -> +15 minutes
attempt 4+ -> +60 minutes
```

Permanent failures set the scheduler job to `FAILED`. For a social publication job, the publication is also set to an appropriate failure state.

## Idempotency

The worker must never intentionally issue a second publish call after Srocial already persisted a terminal or provider-owned publication state.

The adapter receives `idempotencyKey: publication.id` on every publish call. Provider adapters should use that stable key wherever the provider supports native idempotency.

There remains an unavoidable distributed-systems edge case if a provider accepts a request and the process crashes before Srocial persists the provider response. Native provider idempotency, where available, is the mitigation for that gap.

## Default Runtime Safety

No real scheduler loop is enabled automatically in this increment. `runSchedulerTick()` is a tested internal execution primitive. It will be wired into a recurring runtime loop when real provider adapters are registered and deployment configuration is ready.

`ALLOW_REAL_PUBLISH=false` remains the default repository policy.

## PostgreSQL Alignment

The existing migration stores scheduler states as text, so changing job-state vocabulary does not require destructive schema migration. Add comments/index guidance for production claiming, and ensure the future PostgreSQL repository can query `(state, scheduled_at, locked_at)` efficiently.

## Testing

Tests must prove:

- only one claim receives the same due job;
- stale running jobs can be reclaimed;
- attempts increment on claim;
- successful synchronous publication completes once;
- asynchronous publication creates one status-check job;
- already-published publications do not call the adapter again;
- retryable failures reschedule with backoff;
- permanent failures stop retrying;
- status checks reschedule while processing and complete when published;
- existing scheduling/API tests remain green.

## Non-Goals

This increment does not add:

- Meta/TikTok OAuth;
- live Instagram/Facebook/Threads/TikTok HTTP clients;
- WhatsApp campaign execution;
- multi-process PostgreSQL repository implementation;
- concurrent job execution;
- provider-specific rate-limit algorithms.
