# V32 Instagram Media Validation Design

## Goal

Close source roadmap items **#26–28** by validating Instagram image aspect ratio, video duration, and media file size before a post can be scheduled, while preserving every existing non-Instagram scheduling contract.

## Scope

V32 validates the effective media selected for each Instagram destination before persistence. The same validation is surfaced by the Composer compatibility endpoint so operators receive the provider-specific problem before pressing Schedule.

This milestone does **not** add transcoding, resizing, remote URL downloading, provider-side probing, or background media analysis. Those would be separate capabilities.

## Provider policy

The V32 policy is centralized under `server/platforms/instagram/` rather than spread across generic scheduling code.

Current limits used by this milestone (reviewed 2026-09-16):

- feed/carousel image aspect ratio: **4:5 through 1.91:1** inclusive;
- image file size: **8 MiB maximum**;
- video duration: **3 seconds through 15 minutes** inclusive;
- video file size: **300 MiB maximum**.

The duration range follows Meta's current Instagram Reels publishing guidance. The 300 MiB video ceiling is the conservative current Graph content-publishing limit used for preflight; Meta's public Postman collection has also historically shown a 1 GB ceiling, so these values remain isolated in one policy module and should be rechecked when provider documentation changes.

V32 intentionally does not validate codec, frame rate, width, color space, or cross-carousel aspect-ratio equality because source items #26–28 ask only for aspect ratio, duration, and file size. Existing type/HTTPS/count checks remain in force.

## Trust boundary

Srocial must not fetch arbitrary user-supplied HTTPS URLs to discover dimensions/duration. Doing so would create a server-side request-forgery and unbounded-download surface.

Instead, provider preflight inspection is available only for **Srocial-managed media** that the configured media store can map back to one of its own keys through `keyFromUrl()` and open through the existing media-store contract.

For Instagram scheduling in the real application:

1. resolve the URL to a managed media key;
2. open the managed object through the configured media store;
3. use trusted store size/content type;
4. parse image dimensions or MP4 duration from the object stream;
5. evaluate the Instagram policy;
6. reject before repository mutation if metadata is unavailable or out of range.

No outbound HTTP request is made to the media URL during inspection.

Direct service calls that intentionally omit a media-store dependency keep their existing unit-level compatibility; the production request handler always supplies the configured store.

## Metadata inspection

Create focused media-domain modules rather than adding provider parsing to `app.js` or `post-service.js`:

- `server/media/media-metadata.js` parses dimensions/duration from bytes/streams;
- `server/media/managed-media-inspector.js` owns media-store key resolution, bounded stream collection, trusted size/content type, and safe unavailable/error normalization;
- `server/platforms/instagram/media-policy.js` owns Instagram-specific numeric limits and policy evaluation.

Supported uploaded formats remain JPEG, PNG, WebP, and MP4. Image dimension parsers must cover all three currently supported image formats. MP4 duration is read from ISO BMFF `mvhd` metadata. Inspection is bounded by the provider file-size limit and never buffers an object already known to exceed the relevant Instagram ceiling.

## Scheduling contract

`createScheduledPost()` remains the scheduling authority. When a media store is provided, it preflights every **effective Instagram media set**, including destination media overrides, before `createSocialScheduleGraph()` is called.

Inspection is deduplicated by media URL within one request so the same managed asset used by multiple Instagram destinations is opened once.

Safe validation details use stable fields/codes and never include storage/provider secrets. Expected codes:

- `INSTAGRAM_MEDIA_METADATA_REQUIRED`
- `INSTAGRAM_IMAGE_ASPECT_RATIO_UNSUPPORTED`
- `INSTAGRAM_VIDEO_DURATION_UNSUPPORTED`
- `INSTAGRAM_MEDIA_FILE_TOO_LARGE`

Base-media records may persist the trusted inspection metadata already supported by their existing `metadata` object; client-supplied metadata is never authoritative.

## Composer compatibility

`createComposerWorkflowService()` accepts the same explicit media-store dependency. Compatibility remains async and runs the same Instagram preflight policy for each effective Instagram destination. It reports incompatibility instead of throwing a scheduling mutation error.

Other providers continue to use their existing count/type/HTTPS compatibility rules and are not forced through Instagram metadata inspection.

## Application wiring

`server/app.js` already owns the configured `mediaStore`, so it passes that dependency to:

- post creation/scheduling payload handling;
- Composer workflow routing/compatibility.

Routes remain thin; media parsing and provider policy stay in their responsible modules.

## Browser verification

The existing Instagram carousel browser test currently uses arbitrary external-looking URLs. V32 will change that fixture to create Srocial-managed media and schedule through HTTPS-shaped URLs that map back to the locally stored keys. This proves the real browser path crosses the new preflight boundary without making live provider calls.

## Failure behavior

- Invalid provider metadata: return the existing scheduling `VALIDATION_ERROR` / Composer incompatibility response before persistence.
- Unmanaged Instagram URL: fail closed with `INSTAGRAM_MEDIA_METADATA_REQUIRED` when the production media store is present.
- Store/open/parse failure: expose only the same safe metadata-required validation code; do not serialize raw filesystem/object-store errors.
- Facebook, Threads, TikTok, WhatsApp: unchanged.

## Verification gates

A V32 release candidate is not mergeable until all of the following pass on the exact PR head:

1. migrations 001–010;
2. complete Node test suite;
3. JavaScript syntax check;
4. complete Chrome/CDP E2E suite, including managed-media Instagram carousel scheduling;
5. final diff/review-thread check;
6. exact merged-main push workflow after squash merge.

## External verification

V32 can prove local preflight correctness without provider credentials, but current Instagram requirements are external and can change. Live provider acceptance remains tied to `SR-P011`; V32 should extend that entry so real carousel verification also confirms representative media at the validation boundaries.