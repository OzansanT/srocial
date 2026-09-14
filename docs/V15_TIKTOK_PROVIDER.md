# V15 — TikTok OAuth and Content Posting

V15 adds TikTok as a first-class Srocial social provider while preserving the existing provider-neutral scheduler and account model.

## Scope

- TikTok Login Kit web OAuth using `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET`.
- Default scopes: `user.info.basic,video.publish`.
- Encrypted access-token and refresh-token persistence through the existing Accounts/OAuth service.
- Scheduler-backed access-token refresh with refresh-token rotation support.
- TikTok account Connect / Reconnect / Disconnect controls.
- Creator-info lookup before scheduling/publishing so the UI uses TikTok's current privacy and interaction capabilities.
- Direct Post for one video or one photo using public HTTPS media URLs.
- User-selected privacy level; Srocial does not choose a TikTok privacy default.
- Comment, Duet, Stitch, commercial-content disclosure, and AI-generated-video controls.
- Explicit posting/music-usage consent captured with the scheduled publication.
- Async publish status polling through TikTok's publish-status endpoint.
- Provider-specific publication settings persisted as `publications.provider_options`.

## Configuration

```text
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
TIKTOK_SCOPES=user.info.basic,video.publish
```

The OAuth callback URL is the existing provider-neutral callback:

```text
https://YOUR-SROCIAL-HOST/api/oauth/tiktok/callback
```

Register the exact HTTPS redirect URI in the TikTok developer application. TikTok's web OAuth flow requires an absolute HTTPS redirect outside local development.

## Media transfer

V15 uses TikTok `PULL_FROM_URL` for scheduled media. The URL must therefore be:

1. public HTTPS;
2. reachable by TikTok;
3. under a domain or URL prefix verified for the TikTok developer application.

Srocial's S3-compatible media driver is the recommended production path. A successful Srocial upload does not by itself prove that TikTok has verified ownership of the media URL prefix.

## Direct Post controls

When a connected TikTok destination is selected, the composer requests current Creator Info and renders the provider-returned privacy choices. Scheduling fails closed if a privacy level is not selected or explicit consent is missing.

At publish time Srocial queries Creator Info again. If the creator's allowed privacy/interaction capabilities changed after scheduling, the publication fails closed instead of silently changing the user's selection.

TikTok requires Content Posting clients to honor creator privacy choices and obtain explicit consent before sending content. Unaudited clients may be restricted to private visibility by TikTok.

## Token refresh

TikTok access tokens are short-lived and the OAuth response includes a refresh token. V15 extends the generic token-refresh worker so providers may receive both the current access token and refresh token. If TikTok rotates the refresh token, Srocial encrypts and stores the replacement together with the new access token.

The existing stale-refresh protection compares both encrypted token values before writing refreshed credentials, preventing an older refresh job from overwriting a reconnect or newer rotation.

## Publication state

TikTok initialization returns a `publish_id`. Srocial stores it as the publication external ID and returns `PROCESSING`, causing the generic status-check scheduler path to poll:

```text
POST /v2/post/publish/status/fetch/
```

Provider state is normalized as:

- `PROCESSING_DOWNLOAD` / `PROCESSING_UPLOAD` -> `PROCESSING`
- `PUBLISH_COMPLETE` -> `PUBLISHED`
- `FAILED` -> `FAILED` with a normalized Srocial error code

The original publish job is not repeated while provider-side processing is in progress.

## Database migration

V15 adds:

```text
server/db/migrations/004_publication_provider_options.sql
```

Run migrations explicitly before starting Srocial with PostgreSQL:

```bash
npm run db:migrate
```

Historical migrations remain unchanged.

## Safety and deployment notes

- `ALLOW_REAL_PUBLISH=false` and `SCHEDULER_ENABLED=false` remain the safe defaults.
- OAuth credentials and user tokens stay server-side.
- TikTok API/provider errors are normalized before reaching the dashboard.
- Real provider publishing has not been credential-tested in this repository CI environment; CI uses deterministic provider doubles.
- Before production use, complete a real TikTok developer-app OAuth -> Creator Info -> Direct Post -> status cycle and verify the production media domain/prefix in TikTok.
