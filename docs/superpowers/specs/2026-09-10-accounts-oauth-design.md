# Accounts and OAuth V4 Design

## Goal

Add a provider-neutral connected-account subsystem that can safely start OAuth authorization flows, validate callbacks, and persist safe account metadata without enabling any real publishing or exposing provider credentials to the browser.

## Scope

This increment adds:

- account records in the development repository;
- OAuth authorization-state records with expiry and one-time consumption;
- a server-side credential encryption boundary;
- provider-neutral OAuth provider contracts;
- provider registry support for Instagram/Facebook, Threads, TikTok, and WhatsApp Business connection flows;
- account listing and disconnect APIs;
- OAuth start and callback endpoints;
- a simple Accounts UI that shows connection state and exposes safe connect/disconnect actions;
- PostgreSQL follow-up migration for OAuth state and credential metadata.

This increment does **not** exchange real authorization codes for production tokens. Provider modules may build authorization URLs only when the required environment configuration is present. Token exchange remains the next provider-specific implementation stage.

## Architectural Rules

1. OAuth state is generated server-side using cryptographically strong randomness.
2. OAuth state is short-lived, persisted, provider-bound, redirect-bound, and consumed exactly once.
3. The frontend receives only safe account metadata.
4. Raw access/refresh tokens never appear in frontend JSON.
5. Credential encryption/decryption is owned by a dedicated server module.
6. Provider-specific authorization URL construction stays inside provider auth modules.
7. Account APIs and OAuth routes do not know provider endpoint details.
8. WhatsApp Business remains under the messaging subsystem even though its connection flow may use Meta authorization infrastructure.
9. Real provider publishing remains disabled by `ALLOW_REAL_PUBLISH=false`.
10. Development remains dependency-free on Node.js >= 20.

## Data Model

Development JSON storage expands to:

```text
posts
publications
jobs
accounts
oauthStates
```

An account contains safe metadata plus server-only encrypted credential fields:

```text
id
platform
providerAccountId
displayName
connected
scopes
accessTokenEncrypted
refreshTokenEncrypted
tokenExpiresAt
createdAt
updatedAt
```

API serialization strips encrypted fields.

OAuth state record:

```text
id
provider
stateHash
returnTo
createdAt
expiresAt
consumedAt
```

Only a SHA-256 hash of the raw state is persisted. The raw random state is sent to the authorization endpoint and returned through the callback.

## Provider Contract

Each OAuth-capable provider auth module implements:

```js
{
  name,
  isConfigured(env),
  getAuthorizationUrl({ state, redirectUri, env }),
  normalizeCallback(query)
}
```

The common OAuth service owns state issuance/consumption and delegates URL construction/callback normalization.

## Initial Provider Modules

### Meta social authorization

A Meta auth module covers the configuration boundary for Instagram/Facebook connection work. Exact token exchange and account discovery are deferred to the first real Meta provider stage.

### Threads

Threads remains a separate logical provider entry so its scopes and account metadata can evolve independently.

### TikTok

TikTok authorization uses Login Kit OAuth 2.0. For web, TikTok currently documents `https://www.tiktok.com/v2/auth/authorize/`, server-side authorization-code exchange, refreshable tokens, and anti-forgery `state` validation. Srocial models these requirements without storing secrets in the browser.

### WhatsApp Business

WhatsApp remains a messaging account type. Its OAuth/configuration boundary is exposed through the same Accounts UI, but business messaging code stays under `server/messaging/whatsapp/`.

## HTTP API

### List accounts

```http
GET /api/accounts
```

Returns safe account metadata only.

### Disconnect account

```http
DELETE /api/accounts/:id
```

Marks/removes the development connection record without exposing token fields.

### OAuth start

```http
GET /auth/:provider/start?returnTo=/
```

Behavior:

1. resolve the provider;
2. reject unsupported providers;
3. reject providers missing required configuration;
4. generate raw random state;
5. persist only state hash + metadata;
6. return HTTP 302 to the provider authorization URL.

For API/test clients, `?mode=json` returns a safe JSON payload containing the authorization URL instead of redirecting.

### OAuth callback

```http
GET /auth/:provider/callback?code=...&state=...
```

Behavior:

1. validate provider callback parameters;
2. hash and atomically consume the matching unexpired OAuth state;
3. reject missing, mismatched, expired, or replayed states;
4. persist a development account placeholder containing no raw token;
5. redirect to the stored safe `returnTo` path with a connection result indicator.

The placeholder proves the state/account architecture while real code-to-token exchange remains provider-specific future work.

## Security

- OAuth raw state uses `crypto.randomBytes()`.
- Persistent state uses SHA-256 hashes only.
- `returnTo` accepts local absolute paths only; external URLs are rejected to prevent open redirects.
- Credential encryption uses AES-256-GCM with a 32-byte key derived from `TOKEN_ENCRYPTION_KEY` using SHA-256 for the dependency-free MVP.
- Encryption output includes version, IV, authentication tag, and ciphertext.
- Decryption is server-only.
- JSON APIs explicitly serialize safe account fields rather than spreading database records.

## Error Handling

Expected errors:

```text
unsupported_provider
provider_not_configured
invalid_oauth_state
expired_oauth_state
oauth_callback_error
account_not_found
```

OAuth callback error descriptions from providers are not blindly exposed to the user.

## Testing

TDD coverage must include:

- token encryption/decryption and tamper failure;
- OAuth state randomness/hash persistence/expiry/replay prevention;
- return-path sanitization;
- safe account serialization that never leaks encrypted fields;
- account create/list/disconnect repository behavior;
- provider configuration and authorization URL generation;
- OAuth start redirect and JSON mode;
- callback invalid-state/replay behavior;
- callback development-placeholder account persistence;
- existing scheduler regression suite remains green.

## Next Stage

After V4, implement the first **real Meta/Instagram token exchange and account discovery adapter**, then bind scheduled publications to specific connected account IDs.