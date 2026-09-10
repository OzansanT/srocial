# Srocial

Srocial is a self-hosted social-media publishing, scheduling, monitoring, and business-messaging dashboard.

The project is designed around one scheduling system with isolated provider adapters so Instagram, Facebook, Threads, TikTok, and WhatsApp Business do not become five unrelated applications.

## Current Status

The current runnable foundation supports:

- a modular vanilla HTML/CSS/JavaScript dashboard;
- a social-post composer for Instagram, Facebook, Threads, and TikTok destinations;
- future-date scheduling with browser-local time converted to UTC;
- persistent development storage in `data/srocial.json`;
- one publication record and one scheduler job per selected social platform;
- scheduled-post listing and dashboard publication counts;
- `GET /api/health`, `GET /api/dashboard`, `GET /api/posts`, and `POST /api/posts`;
- explicit publication states and separate scheduler job states;
- atomic due-job claiming in the JSON development repository;
- stale scheduler-lock recovery;
- sequential scheduler tick execution;
- social-publication and provider-status workers;
- idempotency guards that avoid republishing already provider-owned publications;
- stable publication IDs passed to provider adapters as idempotency keys;
- retry classification with bounded backoff;
- asynchronous `STATUS_CHECK` jobs for providers that return `PROCESSING`;
- social-platform and messaging adapter contracts;
- PostgreSQL production-target migrations under `server/db/migrations/`;
- automated Node tests for scheduling, persistence, claiming, retries, worker dispatch, and HTTP behavior.

Real provider publishing is intentionally **not enabled yet**. The development default remains:

```text
ALLOW_REAL_PUBLISH=false
```

The scheduler execution primitive exists, but the server does not start a recurring live publication loop because real provider adapters and OAuth credentials are not connected yet.

## Supported Channels

### Social publishing

- Instagram
- Facebook Pages
- Threads
- TikTok

### Business messaging

- WhatsApp Business Cloud API

WhatsApp is intentionally separate from public social publishing. It will use contacts, consent, templates, campaigns, recipient-level message records, and delivery webhooks rather than a `publishPost()` abstraction.

## Architecture

```text
                         SROCIAL
                            |
          +-----------------+-----------------+
          |                                   |
   SOCIAL PUBLISHING                    BUSINESS MESSAGING
          |                                   |
   +------+------+------+               WhatsApp Business
   |      |      |      |
   IG     FB   Threads  TikTok
          |                                   |
          +-----------------+-----------------+
                            |
                       SCHEDULER
                            |
                  CLAIM / LOCK / DISPATCH
                            |
              +-------------+-------------+
              |                           |
       Publication worker           Status worker
              |                           |
              +-------------+-------------+
                            |
                     Provider registry
                            |
                         REPOSITORY
                            |
              +-------------+-------------+
              |                           |
       JSON development             PostgreSQL target
          storage                    migrations
```

The scheduler decides **when** work is eligible and claims it. Workers decide **what** the job means. Provider adapters decide **how** an external provider is called. Provider endpoint details must not leak into the scheduler or frontend.

## Technology

### Frontend

- HTML
- CSS
- vanilla JavaScript ES modules

The frontend stays framework-light and follows the CSS/JS modularity rules in `updaterules.md`.

### Backend

- Node.js >= 20
- built-in Node HTTP server for the current dependency-free MVP

A larger HTTP framework may be introduced later only when it materially reduces complexity. OAuth, secrets, tokens, scheduling, publishing, webhooks, media operations, retries, and database access remain server responsibilities.

### Data

Current development runtime:

```text
data/srocial.json
```

This file is created automatically and is ignored by Git.

Production target:

```text
PostgreSQL
server/db/migrations/001_initial.sql
server/db/migrations/002_scheduler_execution.sql
```

Redis/BullMQ may be added later when queue volume or multi-process execution requires a dedicated queue.

## Run Locally

Requirements:

```text
Node.js >= 20
```

Start Srocial:

```bash
npm start
```

Default address:

```text
http://127.0.0.1:3000
```

Run tests:

```bash
npm test
```

Optional development configuration can be copied from `.env.example`. Environment variables are read by the Node process; the repository does not include real secrets.

Useful variables:

```text
APP_ENV=development
ALLOW_REAL_PUBLISH=false
HOST=127.0.0.1
PORT=3000
DATA_FILE=./data/srocial.json
DATABASE_URL=postgres://...
```

## Scheduling API

### Create a scheduled social post

```http
POST /api/posts
Content-Type: application/json
```

```json
{
  "caption": "Scheduled content",
  "platforms": ["instagram", "threads"],
  "scheduledAt": "2026-09-11T10:00:00.000Z"
}
```

Rules:

- caption must not be empty;
- at least one social platform is required;
- allowed destinations are `instagram`, `facebook`, `threads`, and `tiktok`;
- duplicate platform names are deduplicated;
- WhatsApp is rejected by this endpoint because it is a messaging subsystem;
- `scheduledAt` must represent a future time;
- request bodies larger than 1 MiB are rejected.

A successful request creates:

```text
1 post
N publications
N SOCIAL_PUBLICATION scheduler jobs
```

where `N` is the number of unique selected platforms.

### List scheduled posts

```http
GET /api/posts
```

Returns posts in schedule order with their related publication records.

### Dashboard summary

```http
GET /api/dashboard
```

Counts stored publication states and returns the configured channel list.

## Scheduler Execution

The execution primitive is:

```js
runSchedulerTick({
  repository,
  registry,
  now,
  workerId,
  limit,
  lockTimeoutMs
})
```

A tick performs this flow:

```text
find due work
   -> atomically claim jobs
   -> mark RUNNING + worker lock
   -> dispatch by job type
   -> call provider adapter
   -> persist publication outcome
   -> complete, retry, or reschedule job
```

### Job states

Scheduler jobs use their own state model:

```text
SCHEDULED
RUNNING
RETRYING
COMPLETED
FAILED
CANCELLED
```

This is deliberately separate from publication states.

### Claiming and stale locks

`claimDueJobs()` claims eligible `SCHEDULED`/`RETRYING` jobs and can reclaim a stale `RUNNING` job after its lock timeout. A claimed job stores:

```text
state = RUNNING
lockedAt
lockedBy
attempts += 1
```

The JSON repository serializes these mutations inside one Node process. The future PostgreSQL repository must provide the same contract with transaction-safe row locking.

### Retry policy

Default retry backoff is bounded:

```text
attempt 1 -> 1 minute
attempt 2 -> 5 minutes
attempt 3 -> 15 minutes
attempt 4+ -> 60 minutes
```

Known transient failures such as network errors and rate limits retry. Authentication and unknown provider failures are permanent unless a provider adapter explicitly marks them retryable.

### Asynchronous provider processing

A provider adapter may return:

```js
{
  status: 'PROCESSING',
  externalId: 'provider-container-id'
}
```

Srocial then completes the original publish job and creates a `STATUS_CHECK` job. The status worker can:

- reschedule while the provider is still processing;
- mark the publication `PUBLISHED` when ready;
- mark the publication `FAILED` when the provider reports failure;
- retry transient status lookup errors without republishing the original content.

## Idempotency

Before calling `publish()`, the worker checks the persisted publication state. Publications already in provider-owned/terminal states such as `PUBLISHED` or `PROCESSING` are not published again.

Every publish call receives:

```js
{ idempotencyKey: publication.id }
```

Real provider adapters should use this stable identifier wherever the provider supports native idempotency. This mitigates the distributed-systems edge case where an external provider accepts a request but the Srocial process exits before persisting the response.

## Data Model

A post is not the same object as a platform publication.

```text
Post
  |- Instagram publication
  |- Facebook publication
  `- Threads publication
```

Each publication receives its own scheduler job. This allows one destination to succeed, process asynchronously, retry, or fail independently without corrupting the other destinations.

Core PostgreSQL entities are:

```text
users
accounts
posts
media
publications
publication_attempts
scheduler_jobs
webhook_events
```

WhatsApp-oriented entities are:

```text
contacts
contact_lists
contact_list_members
whatsapp_templates
campaigns
campaign_recipients
whatsapp_messages
```

## Publication State Model

Social publication states include:

```text
DRAFT
SCHEDULED
QUEUED
UPLOADING
PROCESSING
PUBLISHING
PUBLISHED
RETRYING
RATE_LIMITED
AUTH_ERROR
MEDIA_ERROR
API_ERROR
FAILED
CANCELLED
```

Publication state represents the external content lifecycle. Scheduler job state represents execution of internal work; the two are intentionally not interchangeable.

WhatsApp delivery will be tracked per message/recipient with states such as:

```text
QUEUED
SENT
DELIVERED
READ
RETRYING
FAILED
CANCELLED
```

## Security Boundary

Provider secrets must never be placed in browser JavaScript, HTML, CSS, public JSON, localStorage, sessionStorage, or Git history.

```text
Browser
   |
   | internal Srocial API
   v
Node.js backend
   |
   | protected credentials
   v
Meta / TikTok / WhatsApp APIs
```

Real publishing must never be silently enabled from development configuration.

## Repository Structure

```text
srocial/
|- README.md
|- updaterules.md
|- client/
|- server/
|  |- db/
|  |  `- migrations/
|  |- http/
|  |- routes/
|  |- services/
|  |- scheduler/
|  |  |- workers/
|  |  `- run-scheduler-tick.js
|  |- platforms/
|  `- messaging/
|- tests/
|- docs/superpowers/
|- .env.example
|- .gitignore
`- package.json
```

## Development Direction

The next implementation priorities are:

1. account/OAuth connection architecture;
2. Instagram as the first real social provider adapter;
3. wire the recurring scheduler loop only after real adapters are registered and safely configured;
4. Threads and Facebook adapters;
5. TikTok Content Posting integration;
6. media storage and provider-specific media validation;
7. webhook/status processing with real provider events;
8. WhatsApp contacts, templates, campaigns, and recipient-level delivery tracking;
9. production PostgreSQL repository adapter using transaction-safe job claims;
10. analytics and operational hardening.

## Development Rules

All contributors and AI coding agents must read `updaterules.md` before modifying the project.

`README.md` defines what Srocial is and its current implementation status.

`updaterules.md` defines how Srocial is allowed to evolve.
