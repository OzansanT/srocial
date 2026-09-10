# Srocial

Srocial is a self-hosted social media publishing, scheduling, monitoring, and business messaging dashboard.

The goal is to manage multiple platforms from one interface while keeping each platform integration isolated, replaceable, and easy for AI-assisted development to understand and modify.

## Purpose

Srocial is designed to provide one place to:

- Create and schedule social media posts.
- Publish content automatically at the scheduled time.
- Check whether each publication succeeded, failed, or is still processing.
- Retry recoverable failures without creating duplicate posts.
- Connect and manage multiple social accounts.
- Store platform-specific captions and settings.
- Track publication history and API errors.
- Send scheduled WhatsApp Business campaigns.
- Track WhatsApp message delivery states such as sent, delivered, read, and failed.
- Later add analytics, approval workflows, inbox features, AI-assisted content, and automation rules.

## Supported Channels

### Social publishing

- Instagram
- Facebook Pages
- Threads
- TikTok

### Business messaging

- WhatsApp Business Cloud API

WhatsApp is intentionally treated differently from public social networks. Instagram, Facebook, Threads, and TikTok publish public content. WhatsApp sends business messages or campaigns to recipients and therefore requires separate contact, template, consent, delivery, and webhook logic.

## Core Principle

Srocial must not become five unrelated schedulers.

There is one scheduling system and multiple adapters.

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
          |
          +-----------------+
                            |
                         SCHEDULER
                            |
                    QUEUE / WORKERS
                            |
                  STATUS / WEBHOOKS
                            |
                        DATABASE
```

## Recommended Technology Stack

### Frontend

- HTML
- CSS
- Vanilla JavaScript

The frontend is intentionally framework-light. It should remain understandable without requiring a large frontend toolchain.

### Backend

- Node.js
- Express

The backend owns OAuth, API secrets, access tokens, scheduling, publishing, webhooks, media operations, retries, and database access.

### Data

- PostgreSQL for persistent application data.
- Redis + BullMQ may be introduced when queue volume requires it.
- A simple database-backed scheduler can be used during the first MVP.

### Media

- Cloudflare R2 or another object-storage service for images and videos.

### Deployment

- Docker
- Reverse proxy such as Nginx or Cloudflare
- HTTPS required for production OAuth callbacks and webhooks

## Security Boundary

Secrets must never be stored in browser JavaScript.

```text
Browser
   |
   | authenticated request
   v
Srocial Node.js API
   |
   | protected credentials
   v
Meta / TikTok / WhatsApp APIs
```

The browser must never receive application secrets, raw long-lived credentials, refresh-token secrets, or other server-only credentials unless a platform flow explicitly requires a safe client-side value.

Access and refresh tokens must be encrypted at rest where practical.

## Application Areas

The initial application should contain the following screens.

### Dashboard

Shows overall operational health:

- scheduled publications
- successful publications
- processing publications
- failures
- next scheduled jobs
- WhatsApp delivery summary

### Calendar

Shows scheduled social publications and WhatsApp campaigns by date and time.

### Social Composer

Creates a social post and selects one or more destinations.

A post can contain a master caption plus platform-specific overrides.

```text
Master caption
  |- Instagram override
  |- Facebook override
  |- Threads override
  `- TikTok override
```

### WhatsApp Campaign Composer

Creates a WhatsApp campaign using:

- business account
- approved template
- recipient list or segment
- template variables
- optional supported media
- scheduled date/time

### Connected Accounts

Manages OAuth/account connections for supported platforms.

### Contacts and Lists

Stores WhatsApp recipients, lists, tags, segmentation data, and messaging eligibility/consent state.

### WhatsApp Templates

Displays and later manages message templates and their approval state.

### Queue

Shows queued, processing, retrying, completed, and failed jobs.

### Logs

Shows publication attempts, API responses, webhook events, retries, and useful diagnostic information without exposing secrets.

## Data Model

A social post and a platform publication are not the same object.

One post can succeed on one platform and fail on another.

```text
Post #120
  |- Instagram -> published
  |- Facebook  -> published
  |- Threads   -> failed
  `- TikTok    -> processing
```

The database should therefore separate the content from each publication attempt.

### Core entities

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

### WhatsApp entities

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

A social publication should move through explicit states instead of using a single boolean such as `published=true`.

```text
DRAFT
  -> SCHEDULED
  -> QUEUED
  -> UPLOADING
  -> PROCESSING
  -> PUBLISHING
  -> PUBLISHED
```

Failure/recovery states may include:

```text
RETRYING
RATE_LIMITED
AUTH_ERROR
MEDIA_ERROR
API_ERROR
FAILED
CANCELLED
```

State transitions must be recorded so failures are diagnosable.

## WhatsApp Message State Model

WhatsApp delivery is tracked per recipient, not only per campaign.

```text
QUEUED
  -> SENT
  -> DELIVERED
  -> READ
```

Messages may also become:

```text
FAILED
RETRYING
CANCELLED
```

A campaign containing 1,000 recipients therefore contains up to 1,000 independently tracked message records.

## Platform Adapter Architecture

Platform-specific API logic must not leak into the main scheduler or UI.

Conceptually:

```js
class SocialPlatform {
  connect() {}
  refreshToken() {}
  validatePost() {}
  uploadMedia() {}
  publish() {}
  getStatus() {}
}
```

Implementations:

```text
InstagramAdapter
FacebookAdapter
ThreadsAdapter
TikTokAdapter
```

WhatsApp uses a separate messaging abstraction because it is not a public-post platform.

```js
class MessagingPlatform {
  connect() {}
  getTemplates() {}
  validateRecipient() {}
  sendTemplate() {}
  sendMessage() {}
  sendMedia() {}
  handleWebhook() {}
  getMessageStatus() {}
}
```

Implementation:

```text
WhatsAppBusinessAdapter
```

## Scheduler Architecture

There must be one scheduling engine.

Typical job types:

```text
SOCIAL_PUBLICATION
WHATSAPP_CAMPAIGN
STATUS_CHECK
TOKEN_REFRESH
RETRY_PUBLICATION
```

The scheduler determines what is due. Workers perform the actual operation.

```text
Scheduler
   |
   +-> Social Publication Worker
   |
   +-> WhatsApp Campaign Worker
   |
   +-> Status Check Worker
   |
   `-> Retry Worker
```

The scheduler must use locking/idempotency controls so concurrent workers cannot publish the same job twice.

## Webhooks

Webhooks are first-class infrastructure, not an optional afterthought.

They are used to receive asynchronous status changes and inbound events from supported APIs.

Expected routes may include:

```text
/webhooks/meta
/webhooks/whatsapp
/webhooks/tiktok
```

Webhook processing should:

1. verify the request when the provider supports verification/signatures;
2. save or identify the event id where possible;
3. reject or safely ignore duplicate events;
4. update internal records;
5. keep expensive processing outside the request path where appropriate.

## Retry and Idempotency

Not every failure should be retried.

Recoverable examples:

- rate limiting
- temporary provider outage
- media still processing
- temporary network errors

Non-recoverable examples:

- unsupported media
- invalid permissions
- invalid recipient
- permanently rejected content

Retries must use controlled backoff and must never cause duplicate publication.

## Initial Repository Direction

The intended high-level structure is:

```text
srocial/
|- README.md
|- updaterules.md
|- client/
|  |- index.html
|  |- css/
|  `- js/
|- server/
|  |- routes/
|  |- platforms/
|  |- messaging/
|  |- scheduler/
|  |- webhooks/
|  |- services/
|  `- db/
|- tests/
|- .env.example
|- package.json
`- docker-compose.yml
```

The exact structure may evolve, but changes must follow `updaterules.md`.

## Development Priorities

The first implementation stages should focus on foundation rather than trying to support every API immediately:

1. project structure and shared UI system;
2. backend bootstrap and configuration;
3. database schema;
4. scheduler/job model;
5. account connection architecture;
6. Instagram adapter as the first social implementation;
7. Threads and Facebook adapters;
8. TikTok adapter;
9. WhatsApp Business messaging/campaign subsystem;
10. status monitoring, retries, logs, and operational hardening.

## Non-Goals for the Initial MVP

To keep the first version maintainable, the MVP should not initially attempt to provide:

- a full CRM;
- a full omnichannel customer-support inbox;
- deep social analytics;
- AI-generated campaigns without human review;
- browser automation that imitates clicking social-network websites;
- unofficial APIs when an official supported API is available.

## Development Rules

All contributors and AI coding agents must read `updaterules.md` before modifying the project.

`README.md` defines what Srocial is.

`updaterules.md` defines how Srocial is allowed to evolve.
