# Accounts and OAuth V4 Design

## Goal

Add a provider-agnostic account connection layer that can safely support Instagram, Facebook, Threads, TikTok, and WhatsApp authentication without exposing provider credentials to the browser or coupling account persistence to any one provider API.

## Scope

This increment adds account metadata, one-time OAuth state, encrypted token persistence, provider auth contracts, safe account APIs, and disconnect handling. It does not add live Meta/TikTok/WhatsApp endpoints or production credentials yet.

## Core Flow

```text
Browser
  -> POST /api/oauth/:provider/start
      -> OAuth service issues one-time state
      -> provider auth adapter creates authorization URL
  <- safe authorization URL

Provider callback
  -> GET /api/oauth/:provider/callback?code=...&state=...
      -> OAuth service consumes state exactly once
      -> provider adapter exchanges code
      -> provider adapter resolves external account identity
      -> account service encrypts tokens and persists account
  <- safe account metadata only
```

## Security Boundaries

- Raw provider access/refresh tokens never enter frontend JSON responses.
- Tokens are encrypted before persistence with AES-256-GCM using a server-only `TOKEN_ENCRYPTION_KEY`.
- OAuth state values are unpredictable, expire, and can be consumed only once.
- Callback state must match the requested provider.
- Disconnect removes stored token material and marks the account disconnected rather than deleting audit identity metadata.
- Real provider credentials remain optional; tests inject fake provider adapters.

## Provider Auth Contract

Each OAuth-capable provider adapter must expose:

```js
{
  name,
  getAuthorizationUrl({ state, redirectUri }),
  exchangeCode({ code, redirectUri }),
  getAccountIdentity({ accessToken })
}
```

Normalized exchange result:

```js
{
  accessToken,
  refreshToken: null,
  expiresAt: null,
  scopes: []
}
```

Normalized identity result:

```js
{
  providerAccountId,
  displayName,
  username: null,
  metadata: {}
}
```

## Account State

Use explicit connection states:

```text
DISCONNECTED
CONNECTING
CONNECTED
EXPIRED
ERROR
```

The public account representation may expose identifiers, provider, display name, username, state, connected timestamps, expiry metadata, and safe error codes. It must not expose encrypted or raw credential fields.

## Persistence

Development JSON storage adds:

```text
accounts
oauthStates
```

PostgreSQL migration `003_accounts_oauth.sql` adds:

- `accounts.connection_state`
- `accounts.username`
- `accounts.scopes`
- `accounts.connected_at`
- `accounts.disconnected_at`
- `accounts.last_error_code`
- `oauth_states` table with provider, state hash, redirect URI, expiry, consumed time

## Internal Services

```text
server/auth/token-crypto.js
server/auth/oauth-state-service.js
server/auth/oauth-provider-registry.js
server/services/account-service.js
server/services/oauth-service.js
server/routes/accounts.js
server/routes/oauth.js
```

Responsibilities remain isolated: crypto encrypts secrets, state service owns OAuth state lifecycle, provider registry owns auth adapters, account service owns persisted account data, OAuth service orchestrates provider flow, and routes translate HTTP to service calls.

## API Surface

```text
GET  /api/accounts
POST /api/accounts/:id/disconnect
POST /api/oauth/:provider/start
GET  /api/oauth/:provider/callback
```

`POST /api/oauth/:provider/start` accepts an optional safe `redirectUri`; if omitted, the server builds one from `PUBLIC_BASE_URL`.

The callback returns JSON in this increment. A later provider-specific UX layer may redirect to an Accounts screen after successful connection.

## Error Model

Expected safe codes include:

```text
UNSUPPORTED_PROVIDER
OAUTH_STATE_INVALID
OAUTH_STATE_EXPIRED
OAUTH_STATE_USED
OAUTH_CODE_REQUIRED
TOKEN_ENCRYPTION_KEY_REQUIRED
ACCOUNT_NOT_FOUND
```

Provider raw error payloads are not returned directly to the browser.

## Non-Goals

- Live Meta/TikTok/WhatsApp OAuth endpoints.
- Token refresh worker execution.
- User login/session authentication for Srocial itself.
- Multi-tenant authorization.
- Provider-specific scopes/capability discovery.

These are later increments built on top of this contract.