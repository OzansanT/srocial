# Srocial Scheduling Workflow Design

## Goal

Add the first end-to-end content scheduling workflow to Srocial without enabling real external publishing.

The system must let a user create a scheduled social post, generate one publication per selected social platform, create scheduler jobs, persist development data across server restarts, list scheduled posts, and expose the data to the dashboard.

## Scope

This increment adds:

- post creation and listing APIs;
- social platform validation for Instagram, Facebook, Threads, and TikTok;
- explicit creation of publication records and scheduler jobs;
- a dependency-free file-backed development repository;
- a PostgreSQL initial schema/migration representing the production target model;
- a dashboard composer for scheduling a post;
- scheduled-post rendering in the dashboard;
- tests covering validation, persistence, API behavior, and scheduler records.

This increment does not:

- connect OAuth accounts;
- upload media;
- call Meta, TikTok, or WhatsApp APIs;
- execute real publication side effects;
- create WhatsApp campaigns;
- add authentication or multi-user authorization.

## Architecture

The HTTP layer remains thin. Request parsing is handled by an HTTP utility, routes delegate to a post service, and the post service owns validation plus creation of the related post/publication/job records.

Repository access is abstracted behind methods rather than direct filesystem access in services. The development implementation stores a JSON document on disk and serializes writes. The production target is PostgreSQL, represented by the checked-in migration. A PostgreSQL runtime adapter will be added when the project is ready to add and lock the required database package.

```text
Browser composer
      |
      v
POST /api/posts
      |
      v
post route
      |
      v
post service
      |
      +--> post
      +--> publications (one per selected social platform)
      `--> scheduler jobs (one per publication)
              |
              v
       repository contract
              |
      +-------+--------+
      |                |
JSON dev store   PostgreSQL schema target
```

## API Contract

### POST /api/posts

Request:

```json
{
  "caption": "Scheduled content",
  "platforms": ["instagram", "threads"],
  "scheduledAt": "2026-09-11T10:00:00.000Z"
}
```

Rules:

- `caption` must be a non-empty string after trimming;
- `platforms` must be a non-empty array;
- allowed values are `instagram`, `facebook`, `threads`, and `tiktok`;
- duplicate platform values are normalized to one publication;
- `whatsapp` is invalid here because WhatsApp is a messaging subsystem;
- `scheduledAt` must be a valid ISO-compatible timestamp in the future relative to the server clock.

Success: `201` with the created post, publications, and jobs.

Validation failure: `400` with `{ "error": "validation_error", "details": [...] }`.

### GET /api/posts

Returns scheduled posts ordered by `scheduledAt`, including their publication records.

## Data Model

### posts

- id
- caption
- scheduled_at
- created_at
- updated_at

### publications

- id
- post_id
- platform
- state
- scheduled_at
- external_id nullable
- error_code nullable
- created_at
- updated_at

### scheduler_jobs

- id
- type
- publication_id nullable
- campaign_id nullable
- state
- scheduled_at
- attempts
- locked_at nullable
- locked_by nullable
- created_at
- updated_at

Additional PostgreSQL tables for accounts, media, publication attempts, contacts, WhatsApp templates, campaigns, campaign recipients, WhatsApp messages, and webhook events are included so the schema does not paint the project into a corner.

## State Rules

New social publications are created as `SCHEDULED`.

Their scheduler jobs use job type `SOCIAL_PUBLICATION` and state `SCHEDULED`.

No code in this increment advances them to `PUBLISHING` or calls an external provider. `ALLOW_REAL_PUBLISH=false` remains the safe default.

## Development Persistence

Development data is stored in `data/srocial.json` by default. The file is ignored by Git.

The repository:

- creates the file/directories when necessary;
- loads existing JSON on startup;
- returns copies of stored records;
- serializes mutations so concurrent writes cannot overwrite each other;
- uses UUIDs for record identifiers.

## Frontend

The Dashboard keeps the existing shell. The right-side queue panel becomes a compact Social Composer with:

- caption textarea;
- platform checkboxes;
- local date/time input;
- Schedule button;
- inline success/error feedback.

A scheduled-post section lists upcoming posts and their platform states.

Frontend HTTP code remains under `client/js/api/`; DOM behavior remains under `client/js/pages/`.

## Error Handling

Malformed JSON returns `400 invalid_json`.

Bodies larger than the configured request limit return `413 payload_too_large`.

Validation failures return structured field-level details.

Repository failures return `500 internal_error` without exposing filesystem paths or sensitive configuration.

## Testing

Tests must cover:

- post validation;
- deduplication of selected platforms;
- creation of one publication and one job per platform;
- file persistence across repository re-instantiation;
- `POST /api/posts` status and response;
- `GET /api/posts` listing;
- malformed request handling;
- existing health/dashboard/static behavior remains operational.

No test may contact an external social platform.
