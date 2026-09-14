# V17 WhatsApp Business Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the source-roadmap WhatsApp Business subsystem with contacts/consent, approved templates, campaigns, recipient-level status, verified webhooks, retries, UI, and operational telemetry.

**Architecture:** WhatsApp stays isolated under `server/messaging/whatsapp/` and uses the existing scheduler via `WHATSAPP_CAMPAIGN`. Social and WhatsApp external side effects have independent gates and allowed job types. Persistence uses the existing canonical WhatsApp tables from migration 001 plus a V17 campaign template-components column.

**Tech Stack:** Node.js ES modules, built-in HTTP/fetch, vanilla HTML/CSS/JS, JSON repository, PostgreSQL 17, Node test runner, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-14-whatsapp-business-v17-design.md`

## Global Constraints

- Keep exactly one scheduler.
- Keep WhatsApp under `server/messaging/whatsapp/`; do not register it as a social platform adapter.
- Default `ALLOW_REAL_WHATSAPP=false`.
- Enabling WhatsApp must never execute social publication jobs when `ALLOW_REAL_PUBLISH=false`.
- Persist recipient/message lifecycle explicitly; do not use booleans for asynchronous status.
- Only `OPTED_IN` contacts are campaign-eligible.
- Never expose access tokens, app secrets, raw authorization headers, or raw webhook payloads to browser APIs.
- Use test-first RED/GREEN cycles for every behavior change.

---

### Task 1: Persistence contracts and migration

**Files:**
- Create: `server/db/migrations/006_whatsapp_business.sql`
- Create: `server/db/postgres-whatsapp.js`
- Modify: `server/db/postgres-repository.js`
- Modify: `server/db/json-repository.js`
- Test: `tests/whatsapp-repository.test.js`
- Test: `tests/postgres-repository.test.js`

**Interfaces:**
- Produces repository methods: `createContact`, `updateContact`, `getContact`, `listContacts`, `upsertWhatsAppTemplate`, `getWhatsAppTemplate`, `listWhatsAppTemplates`, `createCampaign`, `updateCampaign`, `getCampaign`, `listCampaigns`, `createCampaignRecipient`, `updateCampaignRecipient`, `getCampaignRecipient`, `listCampaignRecipients`, `createWhatsAppMessage`, `updateWhatsAppMessage`, `findWhatsAppMessageByProviderId`, `findLatestWhatsAppMessageForRecipient`, `listWhatsAppMessages`.

- [ ] Write repository tests that fail because the methods/collections do not exist.
- [ ] Run the full test suite and confirm failures are limited to the V17 persistence contract.
- [ ] Add migration 006 with `campaigns.template_components jsonb NOT NULL DEFAULT '[]'::jsonb` and a unique partial index on non-null `whatsapp_messages.provider_message_id`.
- [ ] Implement focused PostgreSQL WhatsApp operations and spread them into the existing repository.
- [ ] Extend JSON storage with the WhatsApp collections and matching methods.
- [ ] Add the five WhatsApp runtime tables to PostgreSQL `REQUIRED_TABLES`.
- [ ] Run persistence tests and the full suite green.

### Task 2: WhatsApp configuration, client, adapter and template synchronization

**Files:**
- Create: `server/messaging/whatsapp/config.js`
- Create: `server/messaging/whatsapp/client.js`
- Create: `server/messaging/whatsapp/adapter.js`
- Create: `server/services/whatsapp-template-service.js`
- Test: `tests/whatsapp-provider.test.js`

**Interfaces:**
- `getWhatsAppConfig(env)` returns null unless access token, phone number ID, business account ID, verify token, and app secret are configured.
- `createWhatsAppAdapter({ config, fetchImpl })` exposes `getTemplates()` and `sendTemplate()`.
- `syncWhatsAppTemplates({ repository, adapter, now })` normalizes/upserts provider templates.

- [ ] Write failing config/client/template-sync tests.
- [ ] Verify RED.
- [ ] Implement configuration parsing with `v26.0` default and `ALLOW_REAL_WHATSAPP` send gate.
- [ ] Implement sanitized Graph GET/POST client calls with explicit safe error codes.
- [ ] Implement adapter template mapping and approved-template sends.
- [ ] Implement template synchronization service.
- [ ] Run provider tests and full suite green.

### Task 3: Contacts and campaign service/API

**Files:**
- Create: `server/services/whatsapp-contact-service.js`
- Create: `server/services/whatsapp-campaign-service.js`
- Create: `server/routes/whatsapp.js`
- Modify: `server/app.js`
- Test: `tests/whatsapp-api.test.js`

**Interfaces:**
- `createWhatsAppContact`, `setWhatsAppConsent`, `createWhatsAppCampaign`, and sanitized listing payloads.
- Protected endpoints: contacts, templates, template sync, campaigns.

- [ ] Write failing API/service tests for E.164 validation, consent eligibility, approved-template requirement, future schedule requirement, recipient dedupe, and scheduler job creation.
- [ ] Verify RED.
- [ ] Implement contact validation and consent updates.
- [ ] Implement transactional-shaped campaign orchestration through repository methods: campaign -> recipients -> one scheduler job.
- [ ] Add protected management routes to `server/app.js` without adding public exceptions.
- [ ] Run API tests and full suite green.

### Task 4: Independent scheduler gates and WhatsApp campaign worker

**Files:**
- Create: `server/scheduler/workers/whatsapp-campaign-worker.js`
- Modify: `server/scheduler/job-dispatcher.js`
- Modify: `server/scheduler/run-scheduler-tick.js`
- Modify: `server/scheduler/start-scheduler-loop.js`
- Modify: `server/db/json-repository.js`
- Modify: `server/db/postgres-repository.js`
- Modify: `server/server.js`
- Test: `tests/whatsapp-worker.test.js`
- Test: `tests/scheduler-loop.test.js`
- Test: `tests/scheduler-tick.test.js`

**Interfaces:**
- Job claiming accepts `types` and claims only allowed types when supplied.
- Scheduler loop derives allowed types from independent `allowRealPublish` / `allowRealWhatsApp` gates.
- `executeWhatsAppCampaignJob` sends only QUEUED/RETRYING recipients and never re-sends terminal recipients.

- [ ] Write failing tests proving WhatsApp-only mode cannot claim SOCIAL_PUBLICATION and social-only mode cannot claim WHATSAPP_CAMPAIGN.
- [ ] Write failing worker tests for successful recipient send, explicit rate-limit retry, permanent invalid-recipient failure, and unresolved `SENDING` fail-closed behavior.
- [ ] Verify RED.
- [ ] Add repository claim filtering in JSON/PostgreSQL.
- [ ] Pass `allowedJobTypes` and `messagingRegistry` through scheduler runtime.
- [ ] Implement the WhatsApp worker with message-before-send persistence and `DELIVERY_UNCERTAIN` protection.
- [ ] Feed success/failure/rate-limit outcomes into existing provider telemetry.
- [ ] Run scheduler/worker tests and full suite green.

### Task 5: Verified WhatsApp status webhooks

**Files:**
- Create: `server/messaging/whatsapp/webhook.js`
- Modify: `server/routes/webhooks.js`
- Modify: `server/webhooks/processor.js`
- Modify: `server/app.js`
- Modify: `server/server.js`
- Test: `tests/whatsapp-webhooks.test.js`

**Interfaces:**
- Public endpoints: `GET /api/webhooks/whatsapp`, `POST /api/webhooks/whatsapp`.
- Reuse Meta-style raw-body HMAC verification.
- Normalize WhatsApp statuses and update message + recipient by provider message ID.

- [ ] Write failing challenge/signature/status/dedup/resume tests.
- [ ] Verify RED.
- [ ] Add WhatsApp challenge and POST route.
- [ ] Reuse raw-body signature verification with WhatsApp app secret.
- [ ] Persist/fingerprint events under provider `whatsapp` and process sent/delivered/read/failed transitions.
- [ ] Preserve retry-safe semantics: only PROCESSED records are terminal duplicates.
- [ ] Run webhook tests and full suite green.

### Task 6: WhatsApp dashboard UI

**Files:**
- Create: `client/js/api/whatsapp-api.js`
- Create: `client/js/pages/whatsapp.js`
- Create: `client/css/pages/whatsapp.css`
- Modify: `client/index.html`
- Modify: `client/js/app.js`
- Test: `tests/whatsapp-ui.test.js`

**Interfaces:**
- Contacts form/list with consent control.
- Templates list + sync action.
- Campaign form/list with recipient summary.

- [ ] Write failing structural/UI module tests that require dedicated API/page modules and prohibit `innerHTML` rendering in the new page module.
- [ ] Verify RED.
- [ ] Add the WhatsApp dashboard section and stylesheet.
- [ ] Implement API wrapper and DOM rendering/event handlers through DOM APIs.
- [ ] Initialize the page from `app.js`.
- [ ] Run UI tests and full suite green.

### Task 7: Documentation, problem tracker, release verification

**Files:**
- Create: `docs/V17_WHATSAPP_BUSINESS.md`
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `PROBLEMS.md`

- [ ] Document safe configuration, consent model, campaign lifecycle, webhook callback paths, and live-verification procedure.
- [ ] Advance README current status/data model/public/protected surfaces/development direction to V17.
- [ ] Move `SR-P004` from `OPEN` to `VERIFY` only if deterministic implementation is complete; state the exact real-provider evidence still missing.
- [ ] Add any newly discovered unresolved defect to `PROBLEMS.md` rather than hiding it.
- [ ] Run final CI-equivalent gate: PostgreSQL migration, complete Node tests, JavaScript syntax.
- [ ] Review changed-file scope and secret/public-route exposure.
- [ ] Create PR, mark ready only after green CI, squash-merge with expected head SHA, then verify `main` CI green.

## Self-review

The plan covers every V17 source-roadmap requirement: contacts, consent/eligibility, approved templates, campaigns, recipient states, delivery/read/failure webhooks, retries, UI, Operations telemetry, persistence parity, and verification tracking. It preserves the one-scheduler rule and explicitly prevents the new WhatsApp gate from weakening the existing social-publish safety gate.
