# V25 — Account-Bound Scheduling Migration

V25 resolves `SR-P007` by making account-bound destinations the normal scheduling contract and isolating the historical `platforms`-only request shape behind an explicit, default-off compatibility gate.

## Decision

New social schedules must use `destinations`, with each destination naming both the social platform and the connected Srocial account that will execute the publication:

```json
{
  "caption": "Example",
  "destinations": [
    { "platform": "facebook", "accountId": "<connected-account-id>" }
  ],
  "scheduledAt": "2026-09-16T12:00:00.000Z"
}
```

A valid request that supplies only `platforms` now fails validation before persistence. This prevents normal operation from creating new social publications or scheduler jobs with `accountId=null`.

## Temporary compatibility gate

Operators that still have an older integration may temporarily set:

```dotenv
ALLOW_LEGACY_PLATFORM_SCHEDULING=true
```

The default is `false`. Only the normalized value `true` enables the compatibility path. When enabled, the historical request shape remains unchanged and deliberately creates unbound publication/job records. It must not be used by new callers.

## Migration sequence

1. Audit external callers for POST `/api/posts` payloads containing `platforms` without `destinations`.
2. If an old caller cannot be changed before deployment, temporarily enable `ALLOW_LEGACY_PLATFORM_SCHEDULING=true`.
3. Change each caller to resolve a connected account and send `destinations: [{ platform, accountId }]`.
4. Verify schedules are persisted with non-null account IDs.
5. Return `ALLOW_LEGACY_PLATFORM_SCHEDULING` to `false` or remove it from the environment.

The browser Composer already sends explicit account-bound destinations, so no browser migration is required for the normal scheduling flow.

## Historical data

V25 intentionally does not backfill existing unbound rows. Automatically assigning an account would be ambiguous when more than one connected account exists for a platform and could cause publication through the wrong identity. Existing records remain readable under the existing nullable schema.

No database migration is required because this milestone changes the creation policy, not the historical storage contract.

## Verification contract

V25 regression coverage proves that:

- valid `platforms`-only scheduling is rejected by default before persistence;
- explicit compatibility opt-in preserves the legacy behavior;
- the HTTP API uses account-bound destinations in its normal fixtures;
- the operator environment flag can enable compatibility deliberately;
- account-bound publications persist their selected account IDs;
- existing invalid legacy payload validation remains deterministic before the compatibility-policy rejection;
- PostgreSQL migrations, the deterministic suite, JavaScript syntax checks, and browser E2E continue to pass.

## Next readiness milestone

After V25, the tracker-driven development target is `SR-P006`: distributed, trusted-proxy-aware rate limiting for multi-instance deployment.
