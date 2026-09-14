# V17 — WhatsApp Business

V17 adds WhatsApp Business as a separate messaging/campaign subsystem while reusing Srocial's persistent repository, scheduler, webhook infrastructure, and Operations Center.

WhatsApp is intentionally **not** treated as another social publishing destination. Social publication jobs and WhatsApp campaign jobs have separate execution gates so enabling one cannot accidentally execute the other.

## Safety defaults

```text
SCHEDULER_ENABLED=false
ALLOW_REAL_PUBLISH=false
ALLOW_REAL_WHATSAPP=false
```

The scheduler starts only when `SCHEDULER_ENABLED=true` and at least one real-execution gate is enabled.

- `ALLOW_REAL_PUBLISH=true` permits social `SOCIAL_PUBLICATION`, `STATUS_CHECK`, and `TOKEN_REFRESH` work.
- `ALLOW_REAL_WHATSAPP=true` permits only `WHATSAPP_CAMPAIGN` work.
- Enabling WhatsApp does not enable social publishing.
- Enabling social publishing does not enable WhatsApp sends.

## Required server configuration

All WhatsApp credentials are server-only.

```text
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_GRAPH_API_VERSION=v26.0
ALLOW_REAL_WHATSAPP=false
```

The WhatsApp adapter is unavailable unless the access token, phone-number ID, business-account ID, webhook verify token, and app secret are all configured.

## Data model

V17 persists these records in both JSON development storage and PostgreSQL:

```text
contacts
whatsapp_templates
campaigns
campaign_recipients
whatsapp_messages
```

Migration `006_whatsapp_business.sql` also allows `whatsapp` in provider-health telemetry and adds V17 schema constraints/indexes.

### Contacts and consent

Phone numbers must use E.164 form, for example:

```text
+905551112233
```

Consent states are:

```text
UNKNOWN
OPTED_IN
OPTED_OUT
```

Campaign creation accepts only explicitly `OPTED_IN` contacts. Opt-in records require a consent source. Consent state is therefore an execution eligibility gate, not presentation-only metadata.

## Approved templates

Srocial discovers templates from the configured WhatsApp Business Account and stores normalized local template records.

Management routes:

```text
GET  /api/whatsapp/templates
POST /api/whatsapp/templates/sync
```

Only provider templates currently represented as `APPROVED` may be used to create a campaign. Template components supplied for a campaign are persisted separately from the local template definition so scheduled work is deterministic.

## Contacts API

Protected management routes:

```text
GET  /api/whatsapp/contacts
POST /api/whatsapp/contacts
POST /api/whatsapp/contacts/:id/consent
```

These routes sit behind Srocial's existing administrator session, API rate limit, and same-origin mutation checks when application authentication is enabled.

## Campaigns API

Protected management routes:

```text
GET  /api/whatsapp/campaigns
POST /api/whatsapp/campaigns
```

Campaign creation validates:

- non-empty campaign name;
- future schedule;
- approved template;
- at least one recipient;
- recipient deduplication;
- every recipient exists and is opted in.

One `WHATSAPP_CAMPAIGN` scheduler job is created for each campaign.

## Delivery execution and duplicate-send safety

The campaign worker persists a `whatsapp_messages` intent before calling the provider.

A successful provider response stores its WhatsApp message ID and advances the recipient/message to `SENT`.

Explicit provider rate-limit failures can retry through the existing bounded scheduler retry policy.

Network/transport ambiguity is handled differently: if Srocial cannot know whether the provider accepted a send, it does **not** blindly send again. The message/recipient is terminalized with:

```text
DELIVERY_UNCERTAIN
```

Likewise, if a restart discovers a persisted unresolved `SENDING` record without a provider message ID, it is not automatically resent. This favors duplicate-send prevention over speculative delivery.

## Webhooks

Public provider callback routes:

```text
GET  /api/webhooks/whatsapp
POST /api/webhooks/whatsapp
```

The GET route performs the Meta webhook verification challenge using `WHATSAPP_VERIFY_TOKEN`.

The POST route verifies `X-Hub-Signature-256` against the exact raw request bytes with HMAC-SHA256 using `WHATSAPP_APP_SECRET`. Unverified bodies are rejected before state-changing processing.

Verified deliveries are persisted using V16's provider-scoped webhook deduplication/resume mechanism.

Recognized message progression includes:

```text
SENT -> DELIVERED -> READ
```

Failure events can move a message/recipient to `FAILED`. Older/lower-rank delivery events do not downgrade a later state such as `READ`.

Provider failures are normalized before persistence; raw provider exception text and credentials are not returned to the browser.

## Operations Center

WhatsApp uses the same provider-health telemetry introduced in V16. Successful messaging/webhook work can mark WhatsApp healthy; normalized rate-limit/provider/auth failures surface as degraded/error state without exposing credentials.

## Operator UI

The dashboard includes a dedicated WhatsApp section for:

- creating contacts;
- recording consent state/source;
- synchronizing approved templates;
- selecting opted-in recipients;
- scheduling campaigns;
- viewing campaign state summaries.

The browser uses dedicated ES modules and DOM APIs rather than injecting provider data with `innerHTML`.

## Verification

V17 deterministic verification covers:

- JSON and PostgreSQL persistence parity;
- migration 006;
- E.164/contact consent validation;
- approved-template campaign eligibility;
- campaign recipient deduplication;
- scheduler execution-domain isolation;
- recipient/message send state transitions;
- explicit rate-limit retry behavior;
- ambiguous-delivery fail-closed behavior;
- WhatsApp webhook challenge/signature verification;
- webhook deduplication/resume;
- monotonic delivered/read state handling;
- sanitized failure handling;
- protected management API wiring;
- operator UI wiring;
- full JavaScript syntax checks.

## Real-provider verification gap

Repository CI does not have an approved WhatsApp Business account, production access token, sender phone number, approved template, or public HTTPS webhook endpoint. V17 must therefore remain a `VERIFY` item in `PROBLEMS.md` until a real end-to-end test proves:

```text
template sync
-> opted-in contact
-> scheduled real send
-> provider message ID
-> signed webhook
-> delivered/read or failed state
-> Operations Center telemetry
```

Do not mark the live provider path resolved based only on deterministic mocks.
