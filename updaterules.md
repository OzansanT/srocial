# Srocial Update Rules

This file defines the mandatory rules for modifying the Srocial codebase.

Every human contributor and AI coding agent must read this file before making changes.

The objective is to keep the project modular, predictable, secure, and easy to modify without requiring an agent to understand the entire repository at once.

---

## 1. Primary Rule: One Responsibility Per Module

Every file should have one clear responsibility.

A developer should be able to understand what a file does from its name and location without reading unrelated parts of the project.

Avoid files that mix:

- UI rendering
- network requests
- database access
- platform-specific API logic
- scheduling
- authentication
- state management
- styling

If a file begins to own several unrelated responsibilities, split it.

Do not create a giant `app.js`, `style.css`, `utils.js`, or `helpers.js` containing unrelated behavior.

---

## 2. AI-Friendly Change Rule

Changes must be localized.

When implementing a feature or fixing a bug:

1. identify the smallest responsible module;
2. modify only the files required for that change;
3. avoid unrelated refactoring;
4. preserve existing public interfaces unless the change explicitly requires an interface update;
5. document architectural changes;
6. verify that neighboring modules still work.

An AI agent should not rewrite an entire subsystem to change one button, API call, or scheduler rule.

---

## 3. Frontend Technology Rule

The initial frontend stack is:

```text
HTML
CSS
Vanilla JavaScript
```

Do not introduce React, Vue, Angular, Svelte, Tailwind, Bootstrap, jQuery, or another frontend framework unless the project architecture is intentionally changed and documented first.

Reusable behavior should be created with small JavaScript modules and reusable CSS components instead of adding a framework by default.

---

## 4. CSS Architecture

CSS must be divided by responsibility.

The intended structure is:

```text
client/css/
|- root.css
|- reset.css
|- base.css
|- utilities.css
|- layout/
|  |- app-shell.css
|  |- header.css
|  |- sidebar.css
|  `- main.css
|- components/
|  |- button.css
|  |- input.css
|  |- select.css
|  |- modal.css
|  |- dropdown.css
|  |- card.css
|  |- badge.css
|  |- tabs.css
|  |- table.css
|  |- toast.css
|  `- calendar.css
`- pages/
   |- dashboard.css
   |- composer.css
   |- accounts.css
   |- contacts.css
   |- templates.css
   |- queue.css
   `- logs.css
```

The exact list may grow, but the separation rules must remain.

### 4.1 `root.css`

`root.css` contains universal design tokens only.

Examples:

```css
:root {
  --color-background: #ffffff;
  --color-surface: #f7f7f8;
  --color-text: #171717;
  --color-text-muted: #6b7280;

  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;

  --radius-sm: 0.375rem;
  --radius-md: 0.625rem;
  --radius-lg: 1rem;

  --font-size-sm: 0.875rem;
  --font-size-md: 1rem;
  --font-size-lg: 1.125rem;
}
```

Use `root.css` for repeated system-wide values such as:

- colors
- spacing
- radii
- font sizes
- shadows
- transitions
- z-index layers
- shared dimensions

Do not put component selectors in `root.css`.

Wrong:

```css
:root { ... }
.button { ... }
.sidebar { ... }
```

Correct:

```text
root.css       -> tokens
button.css     -> buttons
sidebar.css    -> sidebar
```

### 4.2 Reuse Tokens

Do not repeatedly hard-code the same visual value.

Wrong:

```css
.card { gap: 16px; }
.modal { gap: 16px; }
.toolbar { gap: 16px; }
```

Preferred:

```css
.card { gap: var(--space-4); }
.modal { gap: var(--space-4); }
.toolbar { gap: var(--space-4); }
```

### 4.3 Component CSS

A reusable UI component gets its own CSS file.

Examples:

```text
button -> components/button.css
modal  -> components/modal.css
tabs   -> components/tabs.css
```

Do not put button rules into `dashboard.css` just because the button first appeared on the Dashboard.

### 4.4 Page CSS

Page CSS contains only layout or styling unique to that page.

If a style becomes reusable across pages, move it into a shared component or utility.

### 4.5 No Inline CSS

Avoid:

```html
<div style="margin:20px;color:red">
```

Use classes and the appropriate stylesheet.

### 4.6 No `!important` by Default

Do not use `!important` to hide specificity problems.

It may only be used when there is a documented reason that cannot reasonably be solved through normal cascade/specificity rules.

---

## 5. JavaScript Architecture

JavaScript must also be divided by responsibility.

Suggested frontend structure:

```text
client/js/
|- app.js
|- config.js
|- api/
|  |- client.js
|  |- posts-api.js
|  |- accounts-api.js
|  |- contacts-api.js
|  `- campaigns-api.js
|- components/
|  |- modal.js
|  |- dropdown.js
|  |- toast.js
|  |- tabs.js
|  `- calendar.js
|- pages/
|  |- dashboard.js
|  |- composer.js
|  |- accounts.js
|  |- contacts.js
|  |- templates.js
|  |- queue.js
|  `- logs.js
`- utils/
   |- date.js
   |- validation.js
   `- format.js
```

### 5.1 `app.js`

`app.js` is an application entry point.

It may initialize modules and coordinate top-level startup.

It must not become a container for every feature.

### 5.2 API Requests

Frontend API requests must go through dedicated API modules.

Do not scatter raw `fetch()` calls throughout UI components.

Preferred:

```js
import { createPost } from './api/posts-api.js';
```

Instead of embedding endpoint logic in a button click handler.

### 5.3 DOM Modules

A component module should own the behavior of that component.

For example:

```text
modal.js
```

may own:

- opening
- closing
- escape-key handling
- overlay click handling

It should not publish Instagram posts or access PostgreSQL.

### 5.4 No Inline JavaScript

Avoid:

```html
<button onclick="publishPost()">Publish</button>
```

Use event listeners in the appropriate JavaScript module.

### 5.5 Explicit Dependencies

Prefer ES module imports instead of hidden global variables.

Avoid creating application behavior that depends on accidental global state.

---

## 6. HTML Rules

HTML should describe structure and semantics.

It should not contain application secrets, large scripts, or large blocks of component-specific CSS.

Use semantic elements where appropriate:

```text
header
nav
main
aside
section
form
button
```

Buttons must be real `<button>` elements when they perform actions.

Links must be real `<a>` elements when they navigate.

Interactive elements must remain keyboard accessible.

---

## 7. Backend Structure

Backend responsibilities must be isolated.

Target structure:

```text
server/
|- server.js
|- config/
|- routes/
|- controllers/
|- services/
|- platforms/
|- messaging/
|- scheduler/
|- webhooks/
|- db/
|- middleware/
`- utils/
```

Routes should not contain large amounts of business logic.

Preferred flow:

```text
Route
  -> Controller
      -> Service
          -> Adapter / Database
```

Small projects may combine route/controller layers where doing so stays clear, but platform, scheduler, and database logic must remain separated.

---

## 8. Platform Isolation Rule

Each external platform must own its API-specific implementation.

```text
server/platforms/
|- instagram/
|- facebook/
|- threads/
`- tiktok/
```

Each platform may contain files such as:

```text
auth.js
client.js
publish.js
media.js
status.js
validator.js
mapper.js
```

Do not create condition-heavy code like:

```js
if (platform === 'instagram') {
  // 150 lines
} else if (platform === 'facebook') {
  // 170 lines
} else if (platform === 'tiktok') {
  // 200 lines
}
```

Use adapters with a common internal contract.

The scheduler should call an adapter, not know provider endpoint details.

---

## 9. WhatsApp Isolation Rule

WhatsApp Business is a messaging subsystem, not a social-post adapter.

Its code belongs under:

```text
server/messaging/whatsapp/
```

Suggested modules:

```text
auth.js
client.js
accounts.js
contacts.js
templates.js
messages.js
media.js
webhook.js
status.js
validator.js
```

Do not implement conceptual APIs such as:

```text
whatsapp.publishPost()
```

Use messaging operations such as:

```text
sendTemplate()
sendMessage()
sendMedia()
handleWebhook()
```

WhatsApp campaign status must be tracked per recipient/message.

---

## 10. Scheduler Rule

There is exactly one scheduling subsystem.

Do not create independent cron systems for every platform.

Correct:

```text
Scheduler
|- SOCIAL_PUBLICATION
|- WHATSAPP_CAMPAIGN
|- STATUS_CHECK
|- TOKEN_REFRESH
`- RETRY_PUBLICATION
```

Wrong:

```text
instagram-cron.js
facebook-cron.js
threads-cron.js
tiktok-cron.js
whatsapp-cron.js
```

Platform differences belong in adapters/workers, not separate scheduling engines.

---

## 11. Worker Rule

The scheduler decides **when** work should run.

Workers decide **how** a specific job is performed.

Example:

```text
scheduler.js
  -> social-publication-worker.js
  -> whatsapp-campaign-worker.js
  -> status-check-worker.js
  -> retry-worker.js
```

A worker must be designed so the same job cannot accidentally execute twice and create duplicate external content.

---

## 12. Idempotency and Locking

Every publish/send operation must account for duplicate execution.

Before calling an external API, the system should know whether the job:

- is already locked;
- is already processing;
- already has an external provider id;
- already completed;
- is eligible for retry.

Use transaction-safe database locking or another explicit lock mechanism.

Never depend only on an in-memory JavaScript boolean for production duplicate protection.

---

## 13. Database Rules

Database access belongs in the database/data layer.

Do not place SQL queries inside UI code, platform adapters, or random route handlers.

Use migrations for schema changes once the database layer is initialized.

Never silently modify production schema during ordinary server startup.

Separate core content from provider-specific publications.

```text
posts
  -> publications
      -> publication_attempts
```

For WhatsApp:

```text
campaigns
  -> campaign_recipients
      -> whatsapp_messages
```

---

## 14. State Machine Rule

Do not represent complex asynchronous processes with only a boolean.

Wrong:

```text
published = true / false
```

Use explicit states.

Social example:

```text
DRAFT
SCHEDULED
QUEUED
UPLOADING
PROCESSING
PUBLISHING
PUBLISHED
RETRYING
FAILED
CANCELLED
```

WhatsApp example:

```text
QUEUED
SENT
DELIVERED
READ
RETRYING
FAILED
CANCELLED
```

State transitions should be validated and auditable.

---

## 15. Webhook Rules

Webhook endpoints must remain small and reliable.

A webhook handler should:

1. validate or verify the provider request when supported;
2. normalize the event;
3. detect duplicates when possible;
4. persist or enqueue the event;
5. return promptly;
6. process heavier work outside the request path where appropriate.

Do not perform slow unrelated business operations before acknowledging a provider webhook.

Webhook payloads must not be trusted blindly.

---

## 16. OAuth and Token Rules

OAuth and provider credentials are server responsibilities.

Never store sensitive provider credentials in:

- frontend source files
- HTML
- CSS
- public JSON
- Git history
- browser localStorage
- browser sessionStorage

Long-lived credentials should be encrypted at rest where practical.

Token refresh logic belongs to the relevant provider authentication module/service.

The UI should receive connection state and safe account metadata, not server secrets.

---

## 17. Environment Variables

Secrets belong in environment variables or a dedicated secrets manager.

The repository may contain:

```text
.env.example
```

It must never contain a real production `.env` with credentials.

`.env.example` should contain names only, for example:

```text
DATABASE_URL=
SESSION_SECRET=
META_APP_ID=
META_APP_SECRET=
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
WHATSAPP_VERIFY_TOKEN=
```

Do not commit actual values.

---

## 18. Logging Rules

Logs should help diagnose operations without leaking credentials or personal data unnecessarily.

Never log:

- passwords
- raw access tokens
- refresh tokens
- application secrets
- authorization headers
- full private credential payloads

Prefer structured log fields such as:

```text
job_id
post_id
publication_id
campaign_id
platform
status
provider_error_code
attempt
```

---

## 19. Error Handling

Do not use a generic retry for every error.

Classify errors.

Examples:

```text
AUTH_ERROR
RATE_LIMIT
NETWORK_ERROR
MEDIA_PROCESSING
INVALID_MEDIA
PERMISSION_DENIED
INVALID_RECIPIENT
PROVIDER_ERROR
```

Recoverable errors may retry with controlled backoff.

Permanent errors should fail clearly and require corrective action.

User-visible errors should be understandable without exposing raw secrets or implementation details.

---

## 20. Time and Timezone Rules

Store canonical schedule timestamps in UTC.

Store the user's selected timezone separately where necessary.

Convert to/from the UI timezone at application boundaries.

Do not store ambiguous local timestamps without timezone context.

A scheduled job must continue to represent the intended moment after server restart or deployment to another region.

---

## 21. Media Rules

Media storage must be abstracted behind a service.

UI and platform adapters should not contain provider-specific object-storage credentials.

The media service may own:

- upload
- metadata
- validation
- public/signed URLs
- deletion
- later transformations

Before publishing, validate provider-specific requirements through the destination platform adapter.

---

## 22. Naming Rules

Use names that describe responsibility.

Preferred:

```text
publication-service.js
instagram-publish.js
campaign-worker.js
status-checker.js
button.css
sidebar.css
```

Avoid vague names:

```text
stuff.js
misc.js
all.js
new.js
functions.js
styles2.css
final.js
final-final.js
```

Names should remain stable unless a rename materially improves architecture.

---

## 23. File Size and Complexity Rule

There is no absolute line-count limit, but large files are a warning signal.

As a practical guideline:

- a file approaching roughly 300-400 lines should be reviewed for multiple responsibilities;
- a function approaching roughly 50-80 lines should be reviewed for separable logic;
- deeply nested conditionals should usually be decomposed.

Do not split files only to satisfy a number. Split them when responsibilities can be named independently.

---

## 24. Shared Utility Rule

Do not create a generic utility merely because two lines look similar.

Create shared utilities only for concepts that are genuinely reusable and stable.

A utility must have a clear domain.

Preferred:

```text
utils/date.js
utils/validation.js
utils/format.js
```

Avoid a massive `utils.js` containing unrelated functions.

---

## 25. API Contract Rule

Frontend code should depend on Srocial's internal API contract, not external provider response shapes.

Backend adapters normalize provider responses.

Example internal publication result:

```js
{
  status: 'PROCESSING',
  externalId: 'provider-id',
  externalUrl: null,
  error: null
}
```

If Meta or TikTok changes a response field, the adapter should absorb that change whenever possible without forcing a frontend rewrite.

---

## 26. Provider Capability Rule

Do not assume every platform supports the same media, caption, scheduling, privacy, or analytics features.

Maintain provider capability definitions.

Conceptually:

```js
{
  text: true,
  image: true,
  video: true,
  carousel: true,
  nativeScheduling: false
}
```

The composer should validate selected content against the destination capabilities before scheduling.

---

## 27. Do Not Use Browser Automation as the Primary Integration

Do not implement normal publishing by scripting the provider website with Puppeteer, Playwright, Selenium, or simulated clicks when an official supported API exists.

Browser automation is fragile and may trigger security challenges, CAPTCHA, UI breakage, or account restrictions.

Official APIs are the default integration strategy.

---

## 28. Dependency Rule

Before adding an npm package, ask whether the behavior can be implemented clearly with existing dependencies or platform APIs.

Add dependencies only when they materially reduce complexity or risk.

Avoid packages for trivial helpers.

When a dependency is added:

- document its purpose when not obvious;
- pin/lock through the package lockfile;
- check that it is maintained and appropriate for production use.

---

## 29. Accessibility Rule

UI changes must preserve basic accessibility.

At minimum:

- keyboard-accessible controls;
- visible focus states;
- semantic buttons and links;
- form labels;
- meaningful alt text where appropriate;
- sufficient contrast;
- no interaction that depends only on hover.

---

## 30. Responsive UI Rule

The dashboard must remain usable on common desktop widths and smaller screens.

Do not build layouts that depend entirely on one fixed viewport size.

Shared breakpoints, when introduced, belong in the design system rather than being invented independently in every page stylesheet.

---

## 31. Testing Rule

Every meaningful backend behavior must be testable outside the UI.

Prioritize tests for:

- state transitions
- scheduler eligibility
- idempotency
- retry classification
- platform response normalization
- webhook verification/normalization
- permission checks
- time conversion

Provider HTTP calls should be mockable.

Tests must not publish real social posts or send real WhatsApp campaigns by default.

---

## 32. Development vs Production Rule

Development mode must make accidental real publication difficult.

Where practical, support explicit environment configuration such as:

```text
APP_ENV=development
ALLOW_REAL_PUBLISH=false
```

Tests and local development should use mocks/sandboxes/test recipients when available.

Never silently switch from mock publishing to real publishing.

---

## 33. Data Privacy Rule

Contacts, phone numbers, messages, account identifiers, and tokens must be treated as sensitive application data.

Only collect data needed for the application feature.

Do not expose one account's contacts, campaigns, logs, or publication records to another account.

Authorization must be checked server-side.

---

## 34. WhatsApp Consent Rule

WhatsApp recipient records must support the information necessary to determine whether messaging is permitted under applicable platform rules and business requirements.

Do not build a campaign system that treats an arbitrary list of phone numbers as automatically eligible recipients.

Consent/eligibility logic should be explicit and auditable.

---

## 35. Change Workflow

Before changing code:

1. read `README.md`;
2. read `updaterules.md`;
3. inspect the target module and its direct dependencies;
4. inspect relevant tests;
5. identify the smallest safe change.

During the change:

1. preserve module boundaries;
2. reuse shared tokens/components;
3. avoid unrelated edits;
4. preserve security boundaries;
5. add/update tests for behavior changes.

After the change:

1. run relevant tests;
2. run lint/format checks once configured;
3. check for accidental secrets;
4. check for broken imports/references;
5. verify changed UI behavior when applicable;
6. update documentation if behavior or architecture changed.

---

## 36. Documentation Update Rule

Update `README.md` when a change alters:

- project purpose;
- supported platforms;
- major architecture;
- setup instructions;
- core data flow;
- top-level repository structure.

Update `updaterules.md` only when a project-wide engineering rule changes.

Do not add temporary implementation notes to this file.

Temporary or feature-specific design documentation should live in a dedicated documentation location.

---

## 37. Breaking Change Rule

A breaking change includes:

- changing an internal API contract used by multiple modules;
- renaming shared database fields;
- changing state names/transitions;
- changing adapter interfaces;
- moving shared design tokens;
- changing authentication/session behavior.

Before making a breaking change:

1. identify consumers;
2. update them deliberately;
3. provide migrations where data is affected;
4. update tests;
5. update documentation.

Do not leave half-migrated architectures in the default branch.

---

## 38. Avoid Premature Features

Do not add features merely because they may be useful later.

Build the smallest architecture that safely supports the current requirement while preserving clean extension points.

Examples of features that should not be added before needed:

- full CRM
- complex analytics warehouse
- multi-region scheduling
- Kubernetes
- microservices
- event streaming infrastructure
- AI-generated autonomous publishing

Start modular. Scale infrastructure when real requirements justify it.

---

## 39. Commit Quality Rule

Commits should describe one coherent change.

Preferred examples:

```text
docs: add Srocial architecture rules
feat: add publication state model
feat: add Instagram account connection
fix: prevent duplicate scheduled publication
```

Avoid meaningless messages such as:

```text
update
changes
fix stuff
final
```

---

## 40. Definition of Done

A change is complete only when:

- the intended behavior works;
- the responsible module remains isolated;
- no secrets were introduced;
- error handling is appropriate;
- duplicate execution is considered for external side effects;
- relevant tests pass;
- relevant documentation is updated;
- existing unrelated behavior was not intentionally changed.

---

# Universal AI Instruction

When an AI coding agent works on Srocial, use the following principle:

> Read `README.md` and `updaterules.md` first. Understand the existing module responsible for the requested change before editing. Make the smallest complete change. Keep HTML structural, CSS componentized, JavaScript modular, backend business logic isolated, external platform code inside adapters, and all secrets server-side. Reuse universal values from `root.css` instead of duplicating them. Do not rewrite unrelated modules. Preserve existing interfaces unless a deliberate documented migration is required. Verify the change and update documentation when architecture or behavior changes.

---

# Final Architectural Invariants

These rules must remain true unless the architecture is deliberately redesigned:

```text
ONE frontend system
ONE backend application
ONE scheduler subsystem
ONE canonical data model
MULTIPLE isolated platform adapters
SEPARATE WhatsApp messaging subsystem
SERVER-ONLY secrets
EXPLICIT asynchronous states
IDEMPOTENT external actions
WEBHOOK-aware status tracking
MODULAR HTML/CSS/JS
SHARED CSS design tokens
SMALL, RESPONSIBILITY-FOCUSED FILES
```

If a proposed change violates one of these invariants, stop and redesign the change before implementation.

---

## 41. Persistent Problem Tracking Rule

`PROBLEMS.md` is the canonical persistent tracker for unresolved problems discovered during development.

Every contributor and AI coding agent must read `PROBLEMS.md` before starting a development task and review it again before declaring the task complete.

A problem must be added to `PROBLEMS.md` when any of the following is true:

- development exposed a defect that is not fixed in the same verified change;
- work is only partially implemented;
- a required path, platform, migration, UI interaction, recovery case, or integration remains incomplete;
- verification could not be performed because credentials, browser/runtime access, provider access, infrastructure, or another dependency was unavailable;
- a workaround or compatibility path leaves known technical debt that could be forgotten;
- a task was described as complete but a meaningful condition remains unverified;
- a failed or interrupted development attempt leaves follow-up work.

Do not hide an unresolved problem only in a chat response, pull-request description, temporary note, or commit message. If it still exists after the development task, it must also exist in `PROBLEMS.md`.

Do not remove a problem merely because code intended to fix it was written. Mark it `RESOLVED` only after appropriate verification evidence exists. Record that evidence in the tracker.

If a problem is urgent (`P0` or `P1`) and the next requested feature depends on the affected area, address the problem first unless there is a deliberate documented reason to defer it.

At the end of each development task:

1. review all active problems affected by the change;
2. add newly discovered problems;
3. update statuses for problems touched by the work;
4. record verification evidence for resolved problems;
5. keep partially solved items as `PARTIAL`;
6. keep unavailable verification as `VERIFY` or `BLOCKED`;
7. report any remaining relevant active problems with the development result.

Future planned features that have never been started belong in the roadmap/README rather than `PROBLEMS.md`. Once implementation starts and leaves an incomplete or problematic state, the unfinished portion belongs in `PROBLEMS.md` until resolved and verified.
