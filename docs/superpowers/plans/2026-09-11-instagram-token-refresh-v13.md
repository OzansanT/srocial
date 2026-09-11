# V13 Instagram Token Refresh Implementation Plan

**Goal:** Refresh Instagram long-lived access tokens before expiry using the existing scheduler and encrypted account storage.

## Tasks

1. Extend the Instagram OAuth adapter with `refreshAccessToken({ accessToken })` and deterministic expiry normalization.
2. Add a token-refresh scheduling helper that creates or reuses one account-bound `TOKEN_REFRESH` job and respects the 24-hour minimum token age.
3. Schedule refresh work after successful OAuth connection only when the provider exposes refresh support and an expiry exists.
4. Add a dedicated scheduler worker that decrypts credentials, calls the provider refresh adapter, stale-checks reconnect races, re-encrypts the new token, updates account state/expiry, and reschedules the same job.
5. Dispatch `TOKEN_REFRESH` through the existing scheduler, passing the OAuth registry and token cipher as explicit dependencies.
6. Cover success, retry, auth expiry, disconnected accounts, reconnect races, duplicate-job prevention, and provider contract validation.
7. Update environment/operator documentation if runtime configuration changes; otherwise document V13 behavior without adding new secrets.
8. Run full CI, review the branch diff for credential leakage/unrelated changes, open a PR, squash-merge with the exact head SHA, and verify `main` CI.

## Constraints

- no new scheduler subsystem or provider-specific cron;
- no real provider calls in tests;
- no plaintext token logging or API exposure;
- no schema migration unless tests prove existing fields are insufficient;
- preserve all existing publication scheduler behavior and safety gates.
