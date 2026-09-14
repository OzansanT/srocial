# V19 — Drafts + Composer Workflows Design

## Context

The source roadmap's next unfinished creation block is items 81–90: draft posts, composer autosave, caption templates, hashtag collections, saved destination groups, per-platform caption/media overrides, live previews, provider-aware character counts, and pre-publish compatibility reporting.

V18 already completed Calendar/Queue lifecycle management. V19 must extend content creation without weakening the existing scheduler, one-canonical-post model, provider isolation, or duplicate-side-effect protections.

## Decision

Use a dedicated **composer-workflow subsystem** for unscheduled work. Do not turn scheduled `posts` into drafts.

Scheduled posts currently require a non-null future `scheduled_at`, create publications/jobs atomically, and participate in lifecycle/scheduler state rules. Making `posts` serve both draft and scheduled semantics would spread nullable schedule/state behavior through stable runtime code. V19 instead stores mutable drafts separately, then materializes them through the existing `createScheduledPost()` path when the user schedules.

### Rejected alternatives

1. **Reuse `posts` with a `DRAFT` state and nullable schedule** — rejected because it changes scheduler/lifecycle invariants and increases migration risk.
2. **Browser-only drafts** — rejected because the roadmap explicitly calls for saved/autosaved drafts and because local storage cannot provide durable server-side recovery or consistent multi-tab conflict handling.
3. **Create one scheduled post per platform override** — rejected because it fragments one composer campaign into multiple posts and degrades Queue/Calendar management.

## Data model

Migration `007_composer_workflows.sql` adds four reusable creation tables and two publication override columns.

### `composer_drafts`

Fields:

- `id uuid primary key`
- nullable `user_id` for future multi-user compatibility
- `name text not null`
- `caption text not null default ''`
- nullable `scheduled_at timestamptz`
- `media jsonb not null default '[]'`
- `destinations jsonb not null default '[]'`
- `platform_overrides jsonb not null default '{}'`
- `revision integer not null default 1`
- `created_at`, `updated_at`

`revision` is optimistic concurrency control. Every update supplies the revision last read by the browser. A stale update returns a conflict rather than silently overwriting a newer autosave from another tab.

### `caption_templates`

Stores `id`, nullable `user_id`, `name`, `caption`, timestamps.

### `hashtag_collections`

Stores `id`, nullable `user_id`, `name`, `tags jsonb`, timestamps. Tags are normalized server-side to unique strings beginning with `#`.

### `destination_groups`

Stores `id`, nullable `user_id`, `name`, `destinations jsonb`, timestamps. Each destination contains `platform` and `accountId`. Group application revalidates account availability in the browser and final scheduling still revalidates on the server.

### `publications`

Add:

- `caption_override text null`
- `media_override jsonb null`

These values are generic content overrides, not provider API options. `provider_options` remains provider-specific configuration such as TikTok privacy/consent.

## Draft contract

Draft payload:

```json
{
  "name": "Launch draft",
  "caption": "Base caption",
  "scheduledAt": "2026-09-15T10:00:00.000Z",
  "media": [{"type":"image","url":"https://cdn.example.com/a.jpg"}],
  "destinations": [{"platform":"instagram","accountId":"..."}],
  "platformOverrides": {
    "threads": {
      "caption": "Threads-specific caption",
      "media": []
    }
  },
  "revision": 3
}
```

Drafts may be incomplete. Saving a draft does not require a caption, a future schedule, destinations, or provider-ready media. Scheduling does require the ordinary strict post validation.

## Scheduling with per-platform overrides

`createScheduledPost()` accepts optional destination fields:

```json
{
  "platform": "instagram",
  "accountId": "...",
  "options": {},
  "captionOverride": "Instagram caption",
  "mediaOverride": [{"type":"image","url":"https://..."}]
}
```

Validation computes **effective content per destination**:

- caption = non-empty override when supplied, otherwise base caption;
- media = override array when explicitly supplied, otherwise base media.

Provider media-count validation runs against each destination's effective media rather than only the base media.

The publication stores normalized overrides. The scheduler still creates one publication/job per destination under one post.

## Runtime content resolution

Add a small platform-neutral helper under `server/platforms/publication-content.js`:

```text
resolvePublicationContent({ post, publication, baseMedia })
  -> { post: effectivePost, media: effectiveMedia }
```

Each social adapter uses the helper before provider validation/publishing. The helper does not know provider rules and does not call external APIs.

This preserves provider isolation while making caption/media overrides effective at real publish time.

## Compatibility report

Add a pure service operation that accepts composer content and returns one result per selected destination.

Result shape:

```json
{
  "compatible": false,
  "destinations": [
    {
      "platform": "instagram",
      "accountId": "...",
      "captionLength": 240,
      "captionLimit": 2200,
      "remainingCharacters": 1960,
      "compatible": true,
      "issues": []
    }
  ]
}
```

V19 uses conservative application limits only where Srocial has an explicit product rule:

- Instagram: 2200 characters
- Facebook: 63206 characters
- Threads: 500 characters
- TikTok: 2200 characters

Compatibility also reports the existing media-count, media-type/HTTPS, destination/account, TikTok required-options, and future-schedule rules. The report is advisory; final scheduling always executes strict server validation again.

## Protected APIs

All routes use the existing admin/session and same-origin mutation boundary.

Drafts:

```text
GET    /api/composer/drafts
POST   /api/composer/drafts
GET    /api/composer/drafts/:id
PATCH  /api/composer/drafts/:id
DELETE /api/composer/drafts/:id
```

Reusable resources:

```text
GET/POST           /api/composer/caption-templates
DELETE             /api/composer/caption-templates/:id
GET/POST           /api/composer/hashtag-collections
DELETE             /api/composer/hashtag-collections/:id
GET/POST           /api/composer/destination-groups
DELETE             /api/composer/destination-groups/:id
```

Compatibility:

```text
POST /api/composer/compatibility
```

No new public routes are introduced.

## Browser architecture

Keep `client/js/pages/composer.js` focused on scheduling/upload/TikTok capability behavior.

Add:

- `client/js/api/composer-workflows-api.js` — workflow API calls only.
- `client/js/pages/composer-workflows.js` — draft/resource/autosave orchestration.
- `client/js/components/platform-preview.js` — safe DOM preview + count rendering.

The workflow controller reads/writes the existing composer form through explicit field names and dispatches `change`/`input` events when applying resources so existing TikTok/account behavior stays authoritative.

### Autosave

- debounce: 800 ms after composer input/change;
- first dirty edit creates a draft if none is active;
- later saves PATCH with `revision`;
- only one request may be in flight; a later edit marks the draft dirty and schedules another save after completion;
- stale revision (`409`) stops blind overwrite and prompts the operator to reload the server version;
- successful scheduling does **not** delete the source draft automatically; it marks feedback as scheduled-from-draft so accidental data loss is avoided. The operator may delete it explicitly.

## Reusable workflows

### Caption templates

Selecting a template replaces the base caption only after an explicit Apply action.

### Hashtag collections

Applying a collection appends normalized hashtags to the current base caption, deduplicating hashtags already present.

### Destination groups

Applying a group checks the matching platform checkboxes and selects matching connected accounts where available. Missing/disconnected accounts remain unselected and are surfaced in feedback rather than silently substituted.

## Live preview and character reporting

The browser renders one preview card per selected platform using DOM APIs, never `innerHTML`.

Each card shows:

- effective platform caption;
- selected/effective media type and URL summary;
- `used / limit` character count;
- compatibility state and issue text returned by the server.

Compatibility requests are debounced independently from autosave so preview rendering is responsive while server validation stays authoritative.

## Persistence parity

JSON and PostgreSQL expose the same repository contract for drafts/templates/collections/groups.

JSON uses its existing serialized write chain and atomic temp-file replacement. PostgreSQL uses ordinary row-level CRUD. Draft revision updates are compare-and-swap operations in both backends.

## Error handling

Stable workflow errors:

- `DRAFT_NOT_FOUND` -> 404
- `DRAFT_REVISION_CONFLICT` -> 409
- `WORKFLOW_VALIDATION_ERROR` -> 400
- unknown resource -> 404

Raw database/provider error text is not returned to the browser.

## Testing

Required deterministic coverage:

1. migration creates all V19 tables/columns;
2. JSON/PostgreSQL repository parity for draft/resource CRUD;
3. stale draft revisions fail without overwriting;
4. scheduling persists caption/media overrides on the correct publication;
5. provider adapters publish effective override content;
6. compatibility reports provider-specific caption/media issues;
7. HTTP route status/error contracts;
8. frontend API endpoints;
9. autosave debounce/revision contract by static/module tests;
10. preview module uses DOM APIs and exposes per-platform counts;
11. dashboard wiring includes draft/resource/preview controls;
12. complete existing test suite, PostgreSQL migrations, and JS syntax checks remain green.

Browser-level E2E remains tracked separately under `SR-P001`; V19 does not falsely resolve that verification gap.

## Security and operational constraints

- No credentials in drafts/resources or API responses.
- No new scheduler/job type.
- Saving/autosaving never calls a provider.
- Preview/compatibility never calls a provider.
- Scheduling remains the only path that creates publish jobs.
- `SCHEDULER_ENABLED`, `ALLOW_REAL_PUBLISH`, and `ALLOW_REAL_WHATSAPP` semantics remain unchanged.
- Dynamic UI content uses DOM node creation/text content, not `innerHTML`.

## Roadmap after V19

After Drafts + Composer Workflows, the next source-defined product area is **Analytics / Reporting** (source item 98 and live README development direction), while live-provider verification and browser E2E remain tracked production-readiness work rather than being misreported as feature-complete.