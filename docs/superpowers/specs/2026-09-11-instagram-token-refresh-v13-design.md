# V13 Instagram Token Refresh Design

## Goal

Keep connected Instagram professional accounts usable by refreshing long-lived access tokens before expiry through Srocial's existing scheduler.

## Architecture

- Instagram's OAuth adapter owns provider-specific refresh HTTP behavior.
- OAuth completion schedules one account-bound `TOKEN_REFRESH` job when the provider exposes refresh support and the token has a valid expiry.
- The existing scheduler claims and dispatches `TOKEN_REFRESH` jobs.
- A dedicated token-refresh worker decrypts the current credential, calls the provider OAuth adapter, encrypts the replacement token, updates `tokenExpiresAt`, and reschedules the same job.
- Existing JSON/PostgreSQL account and scheduler-job fields are sufficient; no migration is required.

## Scheduling

Default refresh target is 30 days before token expiry. The first job is never scheduled before 24 hours after account connection, matching Instagram's long-lived-token refresh constraint. If the calculated time is already past but the token is still valid and old enough, the job becomes due immediately.

Reconnects reuse a scheduled/retrying refresh job when possible. A refresh already in flight is not reused; reconnect creates a new scheduled job, and the in-flight worker checks that the encrypted credential has not changed before persisting its result. This prevents an older refresh response from overwriting a newly reconnected account.

## Failure handling

- retryable provider/network/rate-limit failures use the existing scheduler retry policy;
- invalid/expired credentials mark the account `EXPIRED` and fail the job;
- other permanent provider failures mark the account `ERROR` and fail the job;
- disconnected accounts cancel refresh work without provider calls;
- logs and persisted error fields contain safe codes only, never tokens.

## Security

Tokens remain encrypted at rest with the existing token cipher. Plaintext access tokens exist only inside the worker/provider call boundary. The UI and APIs continue to expose only safe account metadata.

## Runtime

V13 uses the existing scheduler loop and `TOKEN_REFRESH` job type. It does not add a provider-specific cron or second token scheduler. Current scheduler safety gates remain unchanged: scheduled work executes only when the existing scheduler runtime is enabled under current production gates.
