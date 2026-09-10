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
- explicit publication/job states;
- social-platform and messaging adapter contracts;
- a PostgreSQL production-target schema in `server/db/migrations/001_initial.sql`;
- automated Node tests.

Real provider publishing is intentionally **not enabled yet**. The development default remains:

```text
ALLOW_REAL_PUBLISH=false
```

OAuth connections, media upload, provider publishing, webhook processing, and WhatsApp campaigns are subsequent implementation stages.

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
                     JOB / STATUS MODEL
                            |
                        REPOSITORY
                            |
              +-------------+-------------+
              |                           |
       JSON development             PostgreSQL target
          storage                       schema
```

The scheduler decides **when** work is eligible. Workers and provider adapters will decide **how** external work is performed. Provider-specific endpoint details must not leak into the scheduler or frontend.

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

## Data Model

A post is not the same object as a platform publication.

```text
Post
  |- Instagram publication -> SCHEDULED
  |- Facebook publication  -> SCHEDULED
  `- Threads publication   -> SCHEDULED
```

Each publication receives its own scheduler job. This allows one destination to eventually succeed, retry, or fail independently without corrupting the other destinations.

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

The current scheduling workflow creates publications and jobs in `SCHEDULED`. It does not advance them into live publishing states yet.

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
|  |- index.html
|  |- css/
|  `- js/
|- server/
|  |- db/
|  |  `- migrations/
|  |- http/
|  |- routes/
|  |- services/
|  |- scheduler/
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

1. scheduler execution and safe job locking/idempotency;
2. account/OAuth connection architecture;
3. Instagram as the first real social provider adapter;
4. Threads and Facebook adapters;
5. TikTok Content Posting integration;
6. media storage and provider-specific media validation;
7. webhook/status processing and retries;
8. WhatsApp contacts, templates, campaigns, and recipient-level delivery tracking;
9. production PostgreSQL repository adapter;
10. analytics and operational hardening.

## Development Rules

All contributors and AI coding agents must read `updaterules.md` before modifying the project.

`README.md` defines what Srocial is and its current implementation status.

`updaterules.md` defines how Srocial is allowed to evolve.
