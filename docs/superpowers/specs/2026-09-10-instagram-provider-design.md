# Instagram Provider V5 Design

## Goal

Add Srocial's first real external provider integration using Meta's current Instagram API with Instagram Login for professional (Business/Creator) accounts.

## Provider Choice

Use Instagram Login rather than the Facebook Login + linked Page path.

Reasons:

- It connects Instagram professional accounts directly.
- It does not require a Facebook Page to be linked to the Instagram account.
- Current publishing scopes are `instagram_business_basic` and `instagram_business_content_publish`.
- Provider API calls use `graph.instagram.com`.

Srocial will default the Instagram Graph API version to `v26.0`, while allowing `INSTAGRAM_API_VERSION` to override it without code changes.

## OAuth Flow

1. `POST /api/oauth/instagram/start` uses the existing generic OAuth service.
2. The Instagram adapter builds an authorization URL at `https://www.instagram.com/oauth/authorize` with `client_id`, `redirect_uri`, `response_type=code`, `state`, and the required scopes.
3. The callback reaches the existing `/api/oauth/instagram/callback` route.
4. The adapter exchanges the authorization code at `https://api.instagram.com/oauth/access_token` using form-encoded fields.
5. The returned short-lived access token is exchanged for a long-lived token at `https://graph.instagram.com/access_token` using `grant_type=ig_exchange_token`.
6. The adapter fetches the connected professional identity from `graph.instagram.com/{version}/me`.
7. The existing account service encrypts the token before persistence and returns only safe account metadata.

OAuth state, replay protection, encryption, and safe response mapping remain owned by the existing generic V4 infrastructure.

## Modules

`server/platforms/instagram/config.js`
- Reads Instagram-specific environment configuration.
- Requires app id and app secret to mark the provider configured.
- Defaults API version to `v26.0`.
- Exposes required scopes.

`server/platforms/instagram/client.js`
- Wraps `fetch`.
- Handles JSON parsing and provider error normalization.
- Never logs or returns access tokens in error messages.
- Supports form POST and Graph GET/POST helpers.

`server/platforms/instagram/auth.js`
- Implements the generic OAuth provider contract: `getAuthorizationUrl`, `exchangeCode`, `getAccountIdentity`.
- Exchanges short-lived tokens for long-lived tokens.
- Computes `expiresAt` from provider `expires_in` when present.

`server/platforms/instagram/validator.js`
- Validates current Instagram publication input.
- V5 supports one externally hosted image or Reel video per publish request.
- Rejects text-only posts, non-HTTPS media, unsupported media types, and multiple media items.

`server/platforms/instagram/publish.js`
- Creates a media container on `graph.instagram.com/{version}/{ig_user_id}/media`.
- Uses `image_url` for images and `video_url` + `media_type=REELS` for videos.
- Publishes finished image containers through `/media_publish`.
- For video containers, checks container state and returns `PROCESSING` until ready; once ready, publishes via `/media_publish`.
- Maps provider status into Srocial's `PROCESSING`, `PUBLISHED`, or `FAILED` vocabulary.

`server/platforms/instagram/index.js`
- Factory/composition point for the OAuth provider and social publish adapter.

## Credential Resolution

V5 does not expose credentials to routes or the frontend.

The Instagram publishing adapter receives a credential resolver dependency. It resolves the encrypted account token on the server and decrypts it only immediately before a provider call.

V5 will not auto-select among multiple Instagram accounts. Publication execution must have an `accountId`; if absent, the adapter returns a permanent configuration error. This preserves future multi-account correctness.

Because the current social-post API does not yet bind publications to accounts or media, V5 registers the OAuth provider at runtime but does not enable recurring live publishing. The publish adapter is complete and testable behind its internal contract; V6 will bind composer media/account selection to publications and the scheduler.

## Runtime Registration

On server startup:

- If `INSTAGRAM_APP_ID` and `INSTAGRAM_APP_SECRET` are present, register the Instagram OAuth provider.
- If either is missing, leave Instagram OAuth unregistered and preserve the existing `unsupported_provider` behavior.
- Do not fail ordinary development startup because provider credentials are missing.
- `ALLOW_REAL_PUBLISH=false` remains the default and no scheduler loop is started in V5.

## Environment Variables

Add:

```text
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
INSTAGRAM_API_VERSION=v26.0
```

Keep existing Meta variables because Facebook/Threads integrations will use their own later provider paths.

## Error Mapping

Provider/client errors use safe internal codes:

- `AUTH_ERROR` for invalid/expired credentials or OAuth exchange rejection.
- `PERMISSION_DENIED` for provider permission failures.
- `RATE_LIMIT` for throttling.
- `INVALID_MEDIA` for media/input rejection.
- `MEDIA_PROCESSING` only as an internal transient condition where applicable.
- `NETWORK_ERROR` for fetch/network failures.
- `PROVIDER_ERROR` for unclassified provider failures.

No error object may include access tokens, client secrets, authorization headers, or raw provider URLs containing token query parameters.

## Testing

Use dependency injection for `fetch` and credential resolution. Tests must make no real Meta calls.

Required tests:

- configuration defaults and missing-credential behavior;
- authorization URL contains exact current scopes and state;
- code exchange uses form-encoded POST and then long-lived token exchange;
- identity request maps `id`, `username`, `account_type` safely;
- provider errors are normalized without secret leakage;
- image publish flow creates and publishes a container;
- Reel flow returns `PROCESSING` while container is not ready and publishes once `FINISHED`;
- invalid media is rejected before HTTP calls;
- runtime registration occurs only when Instagram credentials are configured;
- existing generic OAuth tests remain green.

## Explicit Non-Goals for V5

- Facebook Login path for Instagram.
- Facebook Page discovery.
- Carousel publishing.
- Stories publishing.
- Local media upload/object storage.
- Social composer account selector.
- Binding existing scheduled publications to connected accounts.
- Recurring scheduler loop.
- Token refresh jobs.
- Webhooks.

Those are subsequent increments. This keeps V5 focused on a correct first provider boundary rather than mixing provider integration with media/storage/UI architecture changes.
