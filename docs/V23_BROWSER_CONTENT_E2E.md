# V23 — Browser E2E Critical Content Workflow

V23 extends Srocial's real-browser production-readiness coverage from the V22 authentication/RBAC foundation into the critical social-content operator workflow. The supplied source feature roadmap is already implemented through item 100, so V23 does not invent a new product feature; it reduces the remaining `SR-P001` verification gap.

## Goals

- exercise V19 draft/autosave/recovery/conflict behavior through the real browser;
- exercise reusable caption templates, hashtag collections, and destination groups;
- verify per-platform content overrides, compatibility output, and live previews;
- upload, reuse, and delete local media through the actual Composer/Media Library UI;
- schedule account-bound content without enabling provider execution;
- exercise Queue/Calendar bulk reschedule and cancel lifecycle actions;
- keep every external publishing and WhatsApp execution gate disabled;
- treat browser-discovered UI state defects as product defects instead of masking them in the test harness.

## Architecture

V23 reuses the dependency-light V22 browser harness: Node.js 22 starts an isolated Srocial instance and controls installed headless Chrome directly through the Chrome DevTools Protocol.

Browser test files run serially to avoid Chrome/profile contention. The fixture uses temporary JSON persistence and temporary local media storage. It can seed deterministic connected-account metadata for browser workflows without storing a live provider token or making provider HTTP requests.

The CDP driver now supports setting a real file input so upload behavior is tested through the browser rather than bypassing the UI.

Execution remains explicitly disabled:

```text
DATABASE_DRIVER=json
APP_AUTH_ENABLED=true
SCHEDULER_ENABLED=false
ALLOW_REAL_PUBLISH=false
ALLOW_REAL_WHATSAPP=false
MEDIA_ORPHAN_CLEANUP_ENABLED=false
```

The seeded Facebook Page exists only inside the isolated test repository. Scheduling persists the normal account-bound post/publication/job graph, but the disabled scheduler/publish gate prevents external publication.

## Covered browser flows

The combined V22 + V23 Chrome gate now verifies six scenarios. V23 adds three critical-content scenarios:

1. **Composer workflows**
   - create and autosave a draft;
   - recover persisted draft state;
   - reject a stale revision instead of overwriting newer data;
   - create/apply reusable caption, hashtag, and destination resources;
   - apply Facebook caption/media overrides;
   - render compatibility and platform-preview state.

2. **Media Library**
   - upload a valid local image through the real file input;
   - observe it in Media Library;
   - reuse it in the composer;
   - delete the unreferenced asset and refresh library state.

3. **Scheduling + Queue/Calendar lifecycle**
   - select a deterministic connected Facebook Page;
   - schedule text-only account-bound content in the future;
   - observe the scheduled record in operator views;
   - bulk-reschedule safely;
   - bulk-cancel safely.

V22's three authentication/RBAC/Admin-user scenarios continue to run in the same gate.

## Product defects discovered by the browser suite

### Queue selection divergence after bulk reschedule

The browser test exposed that Queue could render a row checkbox as checked after bulk reschedule while the internal `selected` set had already been cleared. A later bulk action therefore appeared enabled visually but had no selected IDs internally.

The lifecycle handlers now clear selection **before** the successful mutation refresh renders the Queue. If the mutation fails, the previous selection is restored. A deterministic regression test protects this state ordering.

### Media deletion success feedback overwritten by refresh

The Media Library previously displayed `Media deleted.` before refreshing. `refresh()` immediately replaced the message with `Loading media…` and then cleared it, so successful deletion had no durable success state.

Deletion now performs the refresh first and sets `Media deleted.` only after the refreshed payload succeeds. Refresh errors therefore retain their own error state instead of being mislabeled as successful deletion.

## Verification

V23 implementation exact-head workflow `34972361989` on commit `98601015a31e1129a2d6e9999d9d1050beb2c531` passed:

- PostgreSQL migrations through `009_users_roles.sql`;
- **447/447 deterministic Node tests**;
- JavaScript syntax checks;
- **6/6 real headless-Chrome E2E scenarios**.

A fresh release-head workflow is required after documentation/tracker promotion and before PR/merge. The exact merged `main` commit must also pass the full workflow before V23 is considered closed.

## Safety boundary

V23 adds no production test route, provider credential, live-provider mock secret, scheduler bypass, or publish bypass. The production execution defaults remain:

```text
SCHEDULER_ENABLED=false
ALLOW_REAL_PUBLISH=false
ALLOW_REAL_WHATSAPP=false
```

Real OAuth completion, real provider publishing, real webhook delivery, WhatsApp Cloud API delivery, and live analytics permissions remain separate provider verification work.

## Remaining `SR-P001` browser work

`SR-P001` remains `PARTIAL`. The next browser-readiness slice should cover deterministic operator surfaces that do not require pretending to have live provider credentials:

- Accounts connect/reconnect/disconnect UI state and authorization boundaries;
- WhatsApp contacts/templates/campaign operator workflows with execution disabled;
- Operations Center rendering and deterministic failed-work/provider-health state;
- V20 Analytics filters/report/freshness/refresh error and empty states;
- Calendar drag/drop;
- remaining edit, duplicate, retry, filtering, and dialog-based lifecycle paths.

Live provider verification remains separately tracked under `SR-P002`, `SR-P003`, `SR-P004`, and `SR-P010`.
