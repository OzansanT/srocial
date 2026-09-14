# V19 — Drafts + Composer Workflows

V19 implements the source-roadmap composer workflow block covering draft persistence and recovery, reusable composer resources, per-platform content overrides, live previews, character counts, and pre-publish compatibility reporting.

## Scope

V19 adds:

- server-persisted social composer drafts;
- delayed autosave and explicit Save now;
- optimistic draft revisions with stale-write conflict detection;
- caption templates;
- hashtag collections;
- saved destination groups;
- per-platform caption overrides;
- per-platform media overrides;
- live effective-content previews;
- per-platform character-count / caption-limit indicators;
- server-authoritative compatibility reporting before scheduling.

WhatsApp Business remains a separate messaging subsystem. V19 composer resources and overrides apply only to the social publishing path.

## Safety Model

Draft and reusable-resource writes are management operations only. They do **not** create posts, publications, scheduler jobs, campaigns, or external provider side effects.

The existing execution gates remain unchanged:

```text
SCHEDULER_ENABLED=false
ALLOW_REAL_PUBLISH=false
ALLOW_REAL_WHATSAPP=false
```

Saving or autosaving a draft never bypasses those gates and never schedules content.

## Draft Persistence and Autosave

Drafts are persisted through the repository instead of browser-only storage. A draft contains the editable composer state:

```text
name
caption
scheduledAt
media[]
destinations[]
platformOverrides
revision
createdAt
updatedAt
```

The browser delays autosave briefly after changes so ordinary typing does not create one request per keystroke. An explicit **Save now** action is also available.

### Optimistic revisions

Every draft starts at revision `1`. Updates must include the revision the browser last read. A successful update increments the revision.

If another tab or client updates the draft first, the stale writer receives a conflict instead of silently overwriting newer content:

```text
409 draft_revision_conflict
```

After a conflict, automatic writes are blocked until the saved draft is reloaded. Current browser values remain untouched so the operator can decide how to reconcile them.

## Reusable Composer Resources

V19 stores three reusable resource types independently from scheduled posts:

### Caption templates

Named reusable caption bodies that can replace the current master caption.

### Hashtag collections

Named normalized hashtag lists. The browser appends only hashtags not already present in the current caption.

### Destination groups

Named collections of `{ platform, accountId }` destinations. Applying a group reuses the selected account set while preserving compatible current destination-specific settings when possible.

These resources are persisted in both JSON and PostgreSQL backends.

## Per-Platform Content Overrides

The generic post remains the master content record. Each social publication may now persist:

```text
captionOverride
mediaOverride
```

`null` means inherit master content. An explicit empty media override (`[]`) means no media for that publication and is distinct from inheritance.

At execution time, provider adapters resolve the publication's **effective content** before provider validation or HTTP calls. This preserves the existing single-post / multiple-publication architecture instead of creating duplicate posts per platform.

Examples:

- Instagram can use a platform-specific caption and image;
- Facebook can inherit the master caption but intentionally publish text-only;
- Threads can use a shorter caption;
- TikTok can use a different caption/media pair while retaining its publication-specific privacy and consent options.

Final scheduling validates the effective content for every destination. Preview/compatibility checks are advisory and never replace final server validation.

## Compatibility Reporting

The protected compatibility endpoint evaluates the current unscheduled composer state without writing scheduler records or calling publishing endpoints.

For each selected destination it reports normalized information such as:

- platform/account identity;
- effective caption length;
- known platform caption limit;
- effective media count/type/url requirements;
- connected-account state;
- provider-specific compatibility issues;
- overall compatible/not-compatible state.

The browser renders the report next to a platform preview. Compatibility refresh is debounced while the operator edits.

## Platform Preview

The preview uses safe DOM construction (`textContent` / element APIs) rather than provider HTML or `innerHTML` injection.

Each selected platform preview shows:

- effective caption;
- effective media summary;
- caption character count and limit when known;
- Ready / Needs attention state;
- normalized compatibility issues.

It is a planning preview, not a pixel-perfect provider renderer.

## Protected Management APIs

```text
GET    /api/composer/drafts
POST   /api/composer/drafts
GET    /api/composer/drafts/:id
PATCH  /api/composer/drafts/:id
DELETE /api/composer/drafts/:id

GET    /api/composer/caption-templates
POST   /api/composer/caption-templates
DELETE /api/composer/caption-templates/:id

GET    /api/composer/hashtag-collections
POST   /api/composer/hashtag-collections
DELETE /api/composer/hashtag-collections/:id

GET    /api/composer/destination-groups
POST   /api/composer/destination-groups
DELETE /api/composer/destination-groups/:id

POST   /api/composer/compatibility
```

When application authentication is enabled, these routes use the existing protected-management session, same-origin mutation checks, and API rate limiting.

## Persistence

V19 adds PostgreSQL migration:

```text
007_composer_workflows.sql
```

It creates:

```text
composer_drafts
caption_templates
hashtag_collections
destination_groups
```

and adds the following publication fields:

```text
publications.caption_override
publications.media_override
```

The JSON repository exposes the same logical records and revision behavior.

## Verification

Deterministic branch verification covers:

- JSON draft persistence and stale-revision rejection;
- PostgreSQL compare-and-swap draft revisions;
- reusable resource round-trips in JSON and PostgreSQL;
- protected workflow API contracts;
- compatibility reporting;
- publication override persistence;
- effective destination media validation;
- provider execution using effective content;
- browser-module autosave/revision/resource orchestration contracts;
- safe-DOM preview rendering and character counts;
- dashboard V19 control wiring;
- regression coverage for existing composer uploads and legacy scheduling validation.

The feature-head GitHub Actions run `34855680708` passed **402/402 tests**, applied migrations through `007_composer_workflows.sql`, and passed JavaScript syntax checks.

A later documentation-only or PR merge commit must still pass its own exact-head CI before V19 is considered merged.

## Remaining Browser Verification

Node-level browser-module tests do not replace real browser end-to-end verification. `PROBLEMS.md` keeps this under `SR-P001`.

Browser E2E should verify at minimum:

- draft autosave after editing;
- refresh/recovery from server persistence;
- stale revision conflict behavior across tabs/sessions;
- applying/deleting caption templates and hashtag collections;
- applying destination groups;
- per-platform override editing;
- compatibility refresh and preview rendering;
- scheduling from a loaded draft without unintended duplicate scheduling.

## Next Product Direction

With source roadmap items 81–90 implemented, the next unresolved product block is **Analytics & Reporting**, beginning with source item 98, basic social analytics. The earlier source items 91–97 substantially overlap the already-implemented V16 Operations Center and provider-health/retry/webhook infrastructure.
