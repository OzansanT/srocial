# Accounts UI and OAuth Redirect V7 Design

## Goal

Make connected social accounts manageable from the Srocial browser UI and return browser-based OAuth callbacks to the dashboard without exposing provider credentials or breaking explicit JSON API clients.

## Scope

V7 includes:

- an Accounts panel in the existing dashboard;
- safe account rendering from `GET /api/accounts`;
- Instagram Connect and Reconnect actions using the existing OAuth start endpoint;
- Disconnect actions using the existing account disconnect endpoint;
- browser OAuth callback redirects back to the dashboard;
- explicit JSON content negotiation so API clients can still receive callback JSON;
- safe dashboard query parameters for OAuth success/failure feedback;
- composer account refresh after account changes;
- tests for callback response negotiation and account UI view-model behavior.

V7 does not add new provider adapters, account deletion, token refresh, direct media upload, or WhatsApp account management.

## Browser Accounts Flow

The Accounts panel contains one primary provider action for Instagram and a list of stored account records.

Connected account row:

```text
Instagram   @username   CONNECTED   [Reconnect] [Disconnect]
```

Disconnected account row:

```text
Instagram   @username   DISCONNECTED   [Reconnect]
```

Connect/Reconnect calls:

```text
POST /api/oauth/instagram/start
  -> authorizationUrl
  -> window.location.assign(authorizationUrl)
```

Disconnect calls:

```text
POST /api/accounts/:id/disconnect
  -> safe account payload
  -> refresh Accounts panel
  -> refresh Composer account selectors
```

Only implemented OAuth providers receive active Connect/Reconnect controls. Facebook, Threads, and TikTok remain represented by existing channel status UI until their adapters exist.

## OAuth Callback Negotiation

`GET /api/oauth/:provider/callback` keeps one endpoint.

When the request explicitly accepts JSON (`Accept: application/json`), Srocial returns the existing safe JSON payload and status code.

When the request is a browser navigation that prefers HTML (`Accept: text/html`), Srocial returns a `303 See Other` redirect.

Success:

```text
/?oauth=<provider>&status=connected#accounts
```

Safe failure:

```text
/?oauth=<provider>&status=error&code=<safe-code>#accounts
```

Allowed error codes come only from Srocial's existing sanitized OAuth error mapping. Raw provider messages, tokens, authorization codes, OAuth state values, and stack traces never enter the redirect URL.

If token encryption is not configured, HTML browser callbacks redirect with `code=oauth_not_configured`; JSON clients keep the existing `503` JSON response.

## Client Architecture

`client/js/api/accounts-api.js` owns:

- `listAccounts()`;
- `startOAuth(provider)`;
- `disconnectAccount(id)`.

`client/js/pages/accounts.js` owns:

- pure account view-model construction;
- Accounts panel rendering;
- Connect/Reconnect/Disconnect event handling;
- OAuth result-banner rendering from safe URL parameters;
- removing handled OAuth parameters from browser history after rendering.

`client/js/app.js` remains the coordinator. It initializes the composer and Accounts module, and asks the composer to refresh account selectors after account changes.

`client/js/pages/composer.js` exposes a small `refreshAccounts()` controller method rather than duplicating account-fetch logic elsewhere.

## UI/CSS

Add `client/css/pages/accounts.css` for Accounts-specific layout only. Reuse existing buttons, cards, tokens, spacing, typography, and state styles where possible.

The panel must remain usable on narrow screens, expose real buttons rather than clickable generic elements, and use an `aria-live` feedback area for connection/disconnection results.

## Security

- Browser receives safe account metadata only.
- OAuth authorization code and state are never copied into dashboard query parameters.
- Provider error messages are not reflected into redirects.
- Connect/Reconnect obtains only an authorization URL from Srocial; provider secrets remain server-side.
- Disconnect sends only the internal account ID.
- OAuth dashboard redirect is a fixed relative Srocial URL; no user-controlled open redirect is introduced.

## Testing

Tests must cover:

- JSON OAuth callback remains JSON when `Accept: application/json`;
- browser OAuth callback success returns `303` to a fixed safe dashboard URL;
- browser OAuth callback sanitized failure redirects with a safe code;
- missing token cipher uses safe browser redirect behavior;
- account view models map connected/disconnected states to correct actions;
- unknown provider/account metadata renders safely without enabling unsupported OAuth actions;
- existing OAuth, composer, server, scheduling, scheduler, and Instagram tests remain green.
