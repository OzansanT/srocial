# V13 Instagram Token Refresh

V13 keeps connected Instagram professional accounts usable by refreshing long-lived access tokens before expiry through Srocial's existing scheduler.

## Flow

1. Instagram OAuth completes normally and stores the access token encrypted at rest.
2. If the connected provider supports refresh and the account has a valid expiry, Srocial creates one account-bound `TOKEN_REFRESH` job.
3. The refresh target is normally 30 days before token expiry, but never before 24 hours after the connection time.
4. The existing scheduler claims the due refresh job.
5. The refresh worker decrypts the current token only inside the server-side execution boundary and calls the Instagram refresh endpoint through the provider adapter.
6. On success, Srocial encrypts the replacement token, updates `tokenExpiresAt`, clears the account error state, and reschedules the same job for the next refresh window.

No second scheduler or provider-specific cron is introduced.

## Runtime requirements

Token refresh uses the existing scheduler runtime. In V13 the scheduler still starts only when both existing gates are enabled:

```text
SCHEDULER_ENABLED=true
ALLOW_REAL_PUBLISH=true
```

`TOKEN_ENCRYPTION_KEY` must also be configured for connected-account credentials to be usable by the refresh worker.

V13 adds no new environment variables or database migrations.

## Retry and account states

Retryable provider failures such as rate limits and network errors use the existing scheduler retry policy. The encrypted stored token is not replaced during a retry.

Permanent authentication failure marks the account `EXPIRED` and fails the refresh job. Other permanent refresh failures mark the account `ERROR`. A disconnected account cancels refresh work without making a provider request.

## Reconnect race protection

A reconnect may replace an account token while an older refresh request is already in flight. The worker records the encrypted credential it started with and reloads the account after the provider returns. If the stored credential changed, the old refresh result is treated as stale and is not persisted.

Scheduled or retrying refresh jobs are reused on reconnect. A running refresh job is not reused; a new scheduled refresh job is created for the newly connected credential.

## Security

- access tokens remain encrypted at rest;
- plaintext tokens are never returned through account APIs;
- refresh errors persist safe codes rather than provider response bodies;
- tokens are not written to logs;
- provider-specific refresh HTTP behavior remains isolated in the Instagram OAuth adapter;
- refresh execution remains behind the existing scheduler safety gates.

## Instagram adapter behavior

The Instagram OAuth adapter refreshes an unexpired long-lived token through the unversioned Graph refresh endpoint using `grant_type=ig_refresh_token`. Returned access tokens and expiry durations are normalized before the generic worker persists them.
