# V31 — Instagram Carousel & Multi-Image Composer Design

## Source scope

V31 implements only the supplied roadmap items:

- **#24 [P1] Instagram carousel posts — multiple images/videos**
- **#25 [P1] Instagram multi-image composer UI**

Items #26–28 (aspect ratio, duration, and file-size validation) remain separate follow-on work.

## Constraints

- Preserve existing single-image and single-Reel Instagram behavior.
- Preserve Facebook, Threads, and TikTok media-count limits.
- Reuse the existing ordered media-array persistence; no database migration is required.
- Keep real provider execution behind the existing execution gates.
- Never collapse multiple carousel child IDs into the publication `externalId`; that field remains reserved for the current provider container/media identity.

## Scheduling contract

Instagram accepts 1–10 ordered media items. One item uses the existing single-image/Reel path. Two through ten items are a carousel. Every item must remain an HTTPS `image` or `video` URL.

The generic post service changes only Instagram's provider contract from `max: 1` to `max: 10`. Global media validation already caps a post at ten items and persists `sortOrder`.

## Provider workflow

For a carousel, the adapter creates one ordered child container per media item:

- image child: `image_url` plus `is_carousel_item=true`;
- video child: `video_url`, `media_type=VIDEO`, and `is_carousel_item=true`.

Video children may need provider processing before the carousel parent can safely proceed. V31 stores temporary Instagram carousel workflow state under the publication's existing JSON `providerOptions` field. The scheduler workers will persist adapter-returned `providerOptions` alongside state/external-ID updates.

Workflow state records only provider container identifiers, ordered child metadata, stage, and the caption required to finish the provider operation. It contains no account credential material.

Stages:

1. `children` — ordered child containers exist; status checks wait for video children to become `FINISHED`.
2. `parent` — the carousel parent exists; status checks wait for it to become `FINISHED`.
3. published — call `media_publish`, return the final provider media ID, and remove temporary carousel workflow state.

Provider `ERROR` child/parent states map to a safe media failure. Nonterminal states remain `PROCESSING` and reuse the existing one-minute status-check scheduler.

## Composer UI

The master Composer becomes an ordered list of up to ten media rows. The first row remains compatible with the current `mediaType`/`mediaUrl` controls; additional rows use the same repeated form names so `FormData.getAll()` returns media in visual order.

UI behavior:

- Add media item up to ten rows.
- Remove extra rows.
- Upload or Media Library selection fills the first empty row; when the current row is occupied it appends a row until the limit is reached.
- Draft/autosave state preserves the complete ordered media array through the existing `getState()` / `applyState()` integration.
- Reset after scheduling returns the Composer to one empty media row.
- Existing per-platform custom-media overrides remain single-item; an Instagram carousel uses the master ordered media list (or inherited master media). This keeps V31 bounded to source #24–25 without widening all override editors.

If multiple master media items are combined with a provider that still supports at most one, existing server validation rejects that destination before persistence.

## Verification

TDD coverage must prove:

- validator accepts ordered mixed 2–10 item Instagram carousels and rejects >10;
- post-service permits multiple Instagram media while unchanged providers still reject it;
- publisher creates children in order and resumes safely through child/parent processing using persisted provider workflow state;
- single-image/Reel regression behavior remains unchanged;
- Composer payload preserves repeated ordered media rows;
- uploads/library selection append without overwriting an existing row;
- draft state round-trips all media rows;
- real Chrome schedules a two-item Instagram post and the persisted media order matches the Composer order.

Live provider verification remains separate from deterministic CI and must be recorded in `PROBLEMS.md` if a real Instagram Professional account/app is not available during V31.