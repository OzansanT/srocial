# V14 — Facebook Pages + Threads Providers

V14 adds isolated Facebook Pages and Threads adapters to the existing Srocial OAuth, account, scheduler, publication, token-encryption, and status-check infrastructure.

## What V14 adds

### Facebook Pages

- browser Connect / Reconnect / Disconnect through the generic Accounts UI;
- Meta OAuth with `pages_show_list`, `pages_read_engagement`, and `pages_manage_posts`;
- User-token upgrade followed by Page access-token resolution;
- Page identity stored as the connected Srocial account;
- text posts;
- one-image posts using a provider-reachable HTTPS URL;
- one-video hosted Reel flow with start, hosted upload, finish, and later status checks;
- normalized provider errors and processing states.

Facebook V14 deliberately does not guess among multiple managed Pages. Configure `FACEBOOK_PAGE_ID` when the authenticating Meta user manages more than one eligible Page. If no Page ID is configured, Srocial auto-selects only when exactly one Page with an access token is returned. Multiple candidates fail closed with `PAGE_SELECTION_REQUIRED`.

### Threads

- browser Connect / Reconnect / Disconnect through the generic Accounts UI;
- OAuth with `threads_basic` and `threads_content_publish`;
- short-lived token exchange followed by long-lived token exchange;
- automatic long-lived Threads token refresh through the existing account-bound `TOKEN_REFRESH` scheduler path;
- text posts;
- one-image posts using a provider-reachable HTTPS URL;
- one-video posts using a provider-reachable HTTPS URL;
- media-container processing/status checks before publish;
- normalized `IN_PROGRESS`, `FINISHED`, `ERROR`, `EXPIRED`, and published outcomes.

## Server configuration

Add provider credentials to the deployment environment. Do not put real values in committed `.env` files.

```text
TOKEN_ENCRYPTION_KEY=<long-random-secret>

FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
FACEBOOK_API_VERSION=v26.0
FACEBOOK_PAGE_ID=

THREADS_APP_ID=
THREADS_APP_SECRET=
THREADS_API_VERSION=v1.0
```

Provider registration is configuration-gated. When both required credentials for a provider are absent, that provider is not registered at runtime.

`FACEBOOK_PAGE_ID` is optional only when the connected Meta user exposes exactly one eligible managed Page. It is strongly recommended for deterministic production deployments.

## OAuth callback URLs

Srocial uses the provider-neutral callback shape:

```text
<PUBLIC_BASE_URL>/api/oauth/facebook/callback
<PUBLIC_BASE_URL>/api/oauth/threads/callback
```

Configure the corresponding redirect/callback URLs in the Meta developer configuration for the application(s) used by the deployment.

OAuth start remains an authenticated management operation when Srocial application authentication is enabled. The callback itself remains public so the provider can redirect the browser back to Srocial.

## Media requirements

V14 Facebook and Threads adapters accept zero or one media item per publication.

- Facebook text-only publishing requires a non-empty caption.
- Facebook image/video media must use HTTPS.
- Threads text-only publishing requires non-empty text.
- Threads image/video media must use HTTPS.
- Multi-item/carousel publishing is intentionally deferred.

For local uploads, the URL presented to the provider must be reachable by that provider. A loopback or private-only HTTP URL cannot be fetched by Meta. Use HTTPS public media hosting, including the S3-compatible media driver where appropriate.

## Publishing safety

Real publishing remains off by default:

```text
ALLOW_REAL_PUBLISH=false
SCHEDULER_ENABLED=false
```

The recurring scheduler executes real provider jobs only when both flags are explicitly enabled. V14 does not add a second publisher or bypass the existing scheduler gate.

## Credential handling

Provider access tokens remain server-only.

- OAuth tokens are encrypted through the existing token cipher before persistence.
- `/api/accounts` returns only safe account metadata.
- provider clients sanitize remote error bodies before errors reach scheduler/UI layers.
- Facebook Page access tokens and Threads long-lived tokens are never placed in frontend JavaScript or browser storage.

Facebook Page tokens are stored without a local expiry timestamp in V14. Threads long-lived tokens keep their provider expiry timestamp and are refreshed by the existing scheduler-supported refresh workflow.

## Provider status and retry behavior

Adapters normalize provider-specific responses into Srocial's stable publication/scheduler states.

Typical normalized errors include:

```text
AUTH_ERROR
PERMISSION_DENIED
RATE_LIMIT
NETWORK_ERROR
INVALID_MEDIA
PROVIDER_ERROR
```

Rate-limit, network, and provider-server failures may be retryable. Authentication/permission/media-contract failures fail permanently until configuration/content is corrected.

Video/media processing is not republished blindly. The adapter returns `PROCESSING`; Srocial creates or reuses status-check work and calls the provider-specific `getStatus()` path.

## V14 boundaries

Not included in this release:

- Facebook carousel/multi-image publishing;
- Facebook Page picker UI;
- Threads replies, quote posts, or carousels;
- provider webhooks;
- provider-health/rate-limit dashboard;
- TikTok adapter;
- WhatsApp Business campaigns;
- calendar/queue operational controls.

The roadmap order after V14 is:

1. TikTok OAuth + Content Posting;
2. provider webhooks and provider-health/rate-limit visibility;
3. WhatsApp Business contacts/templates/campaigns/delivery;
4. calendar/queue operational controls.

## Verification

V14 provider tests use injected HTTP clients and do not call real Meta APIs. CI must pass against PostgreSQL 17 and run the repository-wide JavaScript syntax check before merge.
