# V30 — Account Token Expiration & Reconnect Health

V30 implements source roadmap items **#22 Token expiration warning** and **#23 Automatic reconnect-needed state**. Source item **#21 Instagram long-lived token refresh** already existed before this milestone, so V30 reuses the existing refresh subsystem.

## Health contract

The Accounts API derives safe operator-facing health from existing account state and expiry metadata:

- `CONNECTED` — connected and outside the warning horizon.
- `EXPIRING` — connected and expiring within the existing 30-day refresh horizon.
- `CONNECTING` — an account connection is in progress.
- `RECONNECT_NEEDED` — operator action is required because the account is disconnected, expired, permission-revoked, in an account error state, or its recorded expiry is already in the past.

The safe projection also includes `expiresInDays`, `expirationWarning`, `reconnectNeeded`, and `reconnectReason`. Reconnect reasons are `expired`, `permission_revoked`, `disconnected`, or `error`.

## Accounts UI

The Accounts page now shows source-aligned messages such as:

```text
Token expires in 8 days.
Reconnect needed: token expired.
Reconnect needed: provider permission was revoked.
Reconnect needed: account is disconnected.
Reconnect needed: account connection error.
```

One remaining day uses singular wording. Reconnect-needed accounts use the existing provider OAuth flow and display a `Reconnect` action.

## Provider revocation

TikTok `authorization.removed` processing records the safe code `PERMISSION_REVOKED` while moving the account to `DISCONNECTED`. That lets the account-health projection distinguish provider permission removal from an ordinary disconnect.

## Token refresh interaction

Existing account-bound `TOKEN_REFRESH` jobs remain authoritative for providers that support refresh. V30 makes lifetime and reconnect requirements visible; it does not replace refresh scheduling or provider refresh behavior.

## Verification

V30 code-complete GitHub Actions run `35095442455` passed PostgreSQL migrations `001–010`, **505/505 Node tests**, JavaScript syntax checks, and **16/16 real Chrome/CDP E2E scenarios**. The browser suite includes an Accounts scenario for the permission-revoked reconnect-needed state.

The existing live-provider verification items in `PROBLEMS.md` remain open because V30 does not provide the external provider environments required to close them.

## Next source-aligned development

The supplied source roadmap continues with **#24 Instagram carousel posts — multiple images/videos** and **#25 Instagram multi-image composer UI**. Those form the next bounded milestone before the separate Instagram media-validation items #26–28.
