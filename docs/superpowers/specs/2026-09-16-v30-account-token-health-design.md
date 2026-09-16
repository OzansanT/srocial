# V30 — Account Token Expiration & Reconnect Health

## Source scope

This milestone implements the next unimplemented source-roadmap items after V29:

- **#22 [P0] Token expiration warning** — show a human-readable remaining lifetime such as “expires in 8 days”.
- **#23 [P0] Automatic reconnect-needed state** — distinguish disconnected, expired, permission-revoked, and other account-health failures.

Source item #21 (long-lived token refresh) already exists in the scheduler and is not reimplemented here.

## Design

### 1. Derived account health, not a second lifecycle

Keep the persisted account `state` authoritative. Add a pure account-health projection that derives safe operator metadata from existing fields (`state`, `tokenExpiresAt`, `lastErrorCode`) at read time.

The Accounts API will expose:

- `healthState`: `CONNECTED`, `EXPIRING`, `CONNECTING`, or `RECONNECT_NEEDED`;
- `reconnectNeeded`: boolean;
- `reconnectReason`: `disconnected`, `expired`, `permission_revoked`, `error`, or `null`;
- `expiresInDays`: whole days remaining when an expiry is known;
- `expirationWarning`: true when a connected token is inside the existing 30-day refresh lead window.

A connected account whose persisted expiry is already in the past is projected as `RECONNECT_NEEDED`/`expired` even if the asynchronous refresh worker has not yet updated persistence.

### 2. Permission revocation evidence

TikTok `authorization.removed` already disconnects the account and clears credentials. Preserve that behavior but set the existing safe `lastErrorCode` field to `PERMISSION_REVOKED`, allowing the health projection to distinguish provider revocation from an operator-initiated disconnect without a schema migration.

Manual disconnect remains `DISCONNECTED` with no error reason.

### 3. Accounts UI

Keep safe DOM rendering. Account rows retain the persisted-state badge and gain one concise health message:

- expiring token: `Token expires in N day(s).`;
- expired: `Reconnect needed: token expired.`;
- permission revoked: `Reconnect needed: provider permission was revoked.`;
- disconnected: `Reconnect needed: account is disconnected.`;
- other error: `Reconnect needed: account connection error.`

Existing OAuth-capable accounts show `Reconnect` when reconnection is needed. Connected accounts continue to offer proactive `Reconnect` plus `Disconnect`.

### 4. Security and compatibility

No token, encrypted credential, provider response body, or secret is added to the API. Accounts without expiry metadata continue to work. No database migration is required.

### 5. Verification

Use TDD:

1. RED: pure account-health projection and safe account list expectations.
2. GREEN: minimal projection/service wiring.
3. RED/GREEN: Accounts view-model/UI expectations.
4. RED/GREEN: TikTok authorization-removal reason preservation.
5. Full PostgreSQL migrations, Node tests, JavaScript syntax, and real Chrome/CDP E2E gate before merge.
