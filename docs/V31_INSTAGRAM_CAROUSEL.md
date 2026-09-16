# V31 — Instagram Carousel & Multi-Image Composer

V31 closes supplied source-roadmap items **#24 Instagram carousel posts — multiple images/videos** and **#25 Instagram multi-image composer UI**.

## Scope

V31 adds ordered Instagram carousel scheduling and publishing while keeping the existing single-item Instagram image/Reel path intact.

### Composer

- The master Composer accepts **1–10 ordered media items**.
- Each item keeps an explicit `image` or `video` type and URL.
- The first row preserves the existing media controls; additional rows use the same repeated form-field contract.
- **Add media item** appends an empty row up to the 10-item limit.
- Uploading media and choosing **Use in composer** from the Media Library append to the ordered media list rather than replacing an existing item.
- Individual rows can be removed while at least one row remains.
- Draft/state restoration recreates the complete ordered media array.
- Scheduling serializes repeated `mediaUrl` / `mediaType` fields in row order.

V31 does not add drag-to-reorder. The effective order is the visible row order.

### Scheduling and compatibility

Instagram accepts **1–10** media items. Facebook, Threads, and TikTok keep their existing one-item limits in this milestone. Composer compatibility uses the same Instagram 1–10 contract as scheduling so a valid carousel is not rejected before submission.

Provider publishing still requires public HTTPS media URLs. V31 deliberately does not invent provider capabilities for the other platforms.

### Instagram publishing

- **1 media item:** existing image or Reel publication path.
- **2–10 media items:** Instagram carousel path.
- Carousel children are created in the persisted media order.
- Image children can advance immediately after container creation.
- Video children may require processing/status checks before the parent is ready.
- Once all children are ready, the adapter creates the carousel parent and publishes it.
- Provider workflow state is persisted in `providerOptions.instagramCarousel` so scheduler/status-check retries resume the existing child/parent workflow instead of intentionally creating a fresh carousel after every poll.

The social publication and status-check workers persist provider options returned by the adapter before later execution steps.

## Safety boundaries

The existing execution gates remain authoritative:

```text
SCHEDULER_ENABLED=false
ALLOW_REAL_PUBLISH=false
```

V31 does not enable provider publishing by default and does not change WhatsApp execution gates.

## Deferred source validation items

The supplied roadmap keeps the following as separate work after carousel support:

- **#26** Instagram image aspect-ratio validation before scheduling;
- **#27** Instagram video duration validation;
- **#28** Instagram file-size validation.

V31 therefore validates the ordered media count/type/URL contract but does **not** claim those provider-specific media-property checks are complete. They are the next source-defined development milestone.

## Verification

V31 uses TDD and repository CI for:

- Instagram 1–10 scheduling validation;
- deterministic mixed image/video carousel child/parent publication flow;
- persisted/resumable carousel provider state across workers;
- Composer ordered repeated-media payloads and UI/state hooks;
- Composer compatibility accepting Instagram multi-media while one-item providers remain bounded;
- real Chrome scheduling of an ordered two-image Instagram carousel and persisted `sortOrder` evidence;
- regression coverage for Media Library append semantics and the existing Composer/Queue/Calendar browser workflow.

GitHub Actions cannot prove real Meta Graph delivery with an approved Instagram Professional account and production media. That live-provider verification remains separately tracked in `PROBLEMS.md`.

## Next source milestone

After V31, the next bounded source-defined work is **#26–28 Instagram pre-scheduling media validation**: aspect ratio, video duration, and file size.