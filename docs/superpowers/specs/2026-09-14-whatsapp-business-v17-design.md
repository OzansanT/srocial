# V17 — WhatsApp Business Design

## Goal

Implement the roadmap's WhatsApp Business subsystem without turning WhatsApp into a social-post adapter or creating a second scheduler.

V17 covers contacts, explicit consent/eligibility, approved template synchronization, scheduled campaigns, recipient-level send state, verified delivery/read/failure webhooks, controlled retries, operator UI, Operations Center telemetry, JSON/PostgreSQL persistence, and deterministic tests.

## Architectural boundary

WhatsApp remains under `server/messaging/whatsapp/`. It does not implement `publishPost()` and is not registered in `server/platforms/`.

The existing scheduler remains the only scheduling engine. `WHATSAPP_CAMPAIGN` jobs are dispatched to a dedicated worker. Social publishing and WhatsApp sending have independent real-side-effect gates:

```text
SCHEDULER_ENABLED=true
ALLOW_REAL_PUBLISH=false
ALLOW_REAL_WHATSAPP=false
```

The scheduler may start when at least one execution domain is enabled, but repository job claiming receives an allow-list of job types so enabling WhatsApp never causes social publication jobs to run, and enabling social publishing never causes WhatsApp campaigns to run.

## Runtime data model

The initial migration already contains the core WhatsApp tables:

```text
contacts
whatsapp_templates
campaigns
campaign_recipients
whatsapp_messages
```

V17 promotes them to required runtime tables and adds only the missing campaign payload needed by approved template sends:

```text
campaigns.template_components jsonb NOT NULL DEFAULT '[]'
```

Message lifecycle is recipient-scoped:

```text
QUEUED
SENDING
SENT
DELIVERED
READ
RETRYING
FAILED
CANCELLED
```

Campaign state is derived from recipient outcomes and persisted as:

```text
SCHEDULED
SENDING
COMPLETED
COMPLETED_WITH_FAILURES
FAILED
CANCELLED
```

## Contacts and consent

Contacts use E.164 phone numbers and explicit consent states:

```text
UNKNOWN
OPTED_IN
OPTED_OUT
```

Only `OPTED_IN` contacts are eligible for campaign scheduling. Consent source and timestamp are persisted. V17 does not infer consent from message activity.

Protected management endpoints:

```text
GET  /api/whatsapp/contacts
POST /api/whatsapp/contacts
POST /api/whatsapp/contacts/:id/consent
```

## Template synchronization

WhatsApp template discovery is server-side through the configured WhatsApp Business Account. The adapter normalizes provider templates into local `whatsapp_templates` records. Campaigns may use only templates whose normalized status is `APPROVED`.

Protected endpoints:

```text
GET  /api/whatsapp/templates
POST /api/whatsapp/templates/sync
```

Provider credentials never enter browser responses.

## Campaign creation

Protected endpoints:

```text
GET  /api/whatsapp/campaigns
POST /api/whatsapp/campaigns
```

Campaign creation requires:

- non-empty name;
- future UTC schedule;
- one approved local template;
- one or more unique contacts;
- every selected contact is `OPTED_IN`;
- WhatsApp runtime configuration exists.

Creation persists campaign + recipients + one `WHATSAPP_CAMPAIGN` scheduler job. `templateComponents` is a provider-shaped array stored on the campaign and supplied to `sendTemplate()`.

## WhatsApp adapter

`server/messaging/whatsapp/` owns provider-specific behavior:

```text
config.js        environment parsing and safe capability metadata
client.js        Graph HTTP requests and sanitized provider errors
adapter.js       getTemplates() / sendTemplate()
webhook.js       payload normalization for statuses
```

The adapter uses a configurable Graph API version and the configured phone-number/business-account IDs. The access token and app secret are server-only.

## Retry and duplicate-side-effect safety

The campaign worker sends only recipients in `QUEUED` or `RETRYING`.

Before an external send call it persists a `whatsapp_messages` row in `SENDING` state. If a later retry finds an unresolved `SENDING` message without a provider message ID, the recipient fails closed with `DELIVERY_UNCERTAIN` instead of automatically resending. This prevents an ambiguous crash/network boundary from producing duplicate WhatsApp messages.

Safe provider rejection such as explicit rate limiting may transition the recipient to `RETRYING` and reschedule the same campaign job using the existing retry policy. Permanent validation/auth/permission/recipient failures transition only that recipient to `FAILED`; already-sent recipients are never called again.

## Webhooks

Public provider endpoints:

```text
GET  /api/webhooks/whatsapp
POST /api/webhooks/whatsapp
```

GET performs the Meta-style subscription challenge with `WHATSAPP_VERIFY_TOKEN`.

POST verifies `X-Hub-Signature-256` over the exact raw body using `WHATSAPP_APP_SECRET`, fingerprints the raw body for duplicate protection, persists the verified webhook event, and normalizes WhatsApp message status events.

Known status transitions update the matching `whatsapp_messages` row by provider message ID and its `campaign_recipients` row:

```text
sent      -> SENT
 delivered -> DELIVERED
 read      -> READ
 failed    -> FAILED
```

Only a previously `PROCESSED` webhook record is terminally deduplicated. Incomplete persisted events are eligible to resume on provider retry, matching V16 reliability behavior.

## Operations telemetry

WhatsApp successful sends/webhook status events update provider health through the existing provider telemetry module. Rate-limit failures set `limitedUntil`; auth/permission errors set provider health to `ERROR`; transient provider failures set `DEGRADED`.

The Operations API remains sanitized. Raw webhook payloads and WhatsApp credentials are never returned.

## Frontend

Add a dedicated WhatsApp section to the existing vanilla dashboard with three focused operator groups:

- contacts + consent state;
- approved templates + sync;
- campaigns + recipient outcome summary.

Frontend network calls live in `client/js/api/whatsapp-api.js`; DOM behavior lives in `client/js/pages/whatsapp.js`; page-only styles live in `client/css/pages/whatsapp.css`.

No inline JavaScript, inline CSS, or framework is introduced.

## Configuration

New environment names:

```text
ALLOW_REAL_WHATSAPP=false
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_GRAPH_API_VERSION=v26.0
```

V17 never commits real values.

## Verification boundary

Deterministic CI must cover repository parity, contact consent validation, template sync mapping, campaign creation, scheduler type filtering, worker idempotency/retry behavior, signed webhook processing, API authorization/sanitization, and UI wiring.

`SR-P004` may move from `OPEN` to `VERIFY` only after the implementation is complete and CI is green. It must not become `RESOLVED` until a real WhatsApp Business Cloud API account verifies template sync, one approved-template send, and provider webhook delivery/read/failure callbacks over public HTTPS.
