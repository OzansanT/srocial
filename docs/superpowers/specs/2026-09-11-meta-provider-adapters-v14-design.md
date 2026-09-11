# V14 Meta Provider Adapters Design

## Goal

Add production-shaped Facebook Pages and Threads provider adapters to Srocial without changing the one-scheduler/provider-registry architecture.

## Scope

V14 adds OAuth, account identity, validation, publishing, provider status normalization, runtime registration, Accounts UI connection controls, environment configuration, tests, and operator documentation for Facebook Pages and Threads.

It does not add multi-Page selection UI, carousels, replies, quote posts, insights, webhooks, provider-health dashboards, TikTok, WhatsApp Business, or calendar/queue controls. Those remain later roadmap items.

## Architecture

Both providers stay isolated under `server/platforms/<provider>/` and register through the existing OAuth and social-platform registries. The scheduler continues to dispatch only normalized `publish()` and `getStatus()` calls.

Provider credentials remain server-only. Tokens are persisted through the existing encrypted account service. Provider-specific HTTP errors are mapped into Srocial's stable error codes and raw provider bodies are never surfaced to the browser.

## Facebook Pages

Configuration:

- `FACEBOOK_APP_ID`
- `FACEBOOK_APP_SECRET`
- `FACEBOOK_API_VERSION` (default `v26.0`)
- optional `FACEBOOK_PAGE_ID`

OAuth requests the Page permissions `pages_show_list`, `pages_read_engagement`, and `pages_manage_posts`.

The OAuth adapter exchanges the authorization code for a User access token, exchanges it for a long-lived User token, then resolves a Page access token. When `FACEBOOK_PAGE_ID` is configured, that Page must be returned by Meta. Without it, V14 only auto-selects when exactly one managed Page with an access token is returned; multiple candidates fail closed with a safe provider-contract error so Srocial never posts to an arbitrary Page.

The stored account is the Page, not the Facebook user.

Publishing capabilities:

- text: `/{page-id}/feed`
- image: `/{page-id}/photos` using a public HTTPS URL
- video/Reel: initialize `/{page-id}/video_reels`, upload the hosted video through Meta's returned upload URL, finish as `PUBLISHED`, then use provider status checks while processing

V14 accepts zero or one media item for Facebook. More than one item is rejected as `INVALID_MEDIA`.

## Threads

Configuration:

- `THREADS_APP_ID`
- `THREADS_APP_SECRET`
- `THREADS_API_VERSION` (default `v1.0`)

OAuth requests `threads_basic` and `threads_content_publish`, exchanges the code for a short-lived token, exchanges that for a long-lived token, and exposes refresh through the existing `TOKEN_REFRESH` scheduler path.

Publishing capabilities:

- text container
- single image container using a public HTTPS URL
- single video container using a public HTTPS URL

Srocial creates `/me/threads` containers and publishes with `/me/threads_publish`. Containers in `IN_PROGRESS` return normalized `PROCESSING`; `FINISHED` containers are published; `ERROR` and `EXPIRED` become normalized failures.

## UI

The Accounts panel exposes separate Connect Instagram, Connect Facebook, and Connect Threads controls. Connected Facebook/Threads rows support reconnect/disconnect through the same generic UI logic. TikTok remains visibly unsupported until its later adapter release.

The existing composer already models Facebook and Threads destinations and becomes usable automatically when connected accounts are returned by `/api/accounts`.

## Safety and Failure Semantics

- no provider secret or token is sent to client code
- only HTTPS public media URLs are accepted by provider validators
- provider 401/token-expiry failures -> `AUTH_ERROR`
- provider permission failures -> `PERMISSION_DENIED`
- rate limits -> retryable `RATE_LIMIT`
- transport failures -> retryable `NETWORK_ERROR`
- 5xx provider failures -> retryable `PROVIDER_ERROR`
- malformed provider responses -> non-retryable `PROVIDER_ERROR` or `AUTH_ERROR` at the OAuth boundary
- account/provider mismatches fail before provider HTTP calls

## Verification

V14 is complete only when provider config/auth/client/publish/registration tests pass, Accounts UI tests prove Facebook and Threads reconnect support, the full Node test suite passes against the existing PostgreSQL CI service, every server/client/test JavaScript file passes `node --check`, the PR diff contains no credentials, and the merged `main` workflow is green.
