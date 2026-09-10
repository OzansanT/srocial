import { beginOAuth, completeDevelopmentOAuth } from '../oauth/oauth-service.js';

const ERROR_RESPONSES = Object.freeze({
  UNSUPPORTED_PROVIDER: [404, 'unsupported_provider'],
  PROVIDER_NOT_CONFIGURED: [503, 'provider_not_configured'],
  INVALID_OAUTH_STATE: [400, 'invalid_oauth_state'],
  EXPIRED_OAUTH_STATE: [400, 'expired_oauth_state'],
  OAUTH_CALLBACK_ERROR: [400, 'oauth_callback_error'],
  TOKEN_EXCHANGE_NOT_IMPLEMENTED: [501, 'token_exchange_not_implemented']
});

export function oauthErrorPayload(error) {
  const mapped = ERROR_RESPONSES[error?.code];
  if (!mapped) return null;
  return { statusCode: mapped[0], payload: { error: mapped[1] } };
}

export async function startOAuthRoute({ repository, providers, providerName, returnTo, env, now }) {
  return beginOAuth({ repository, providers, providerName, returnTo, env, now });
}

export async function completeOAuthRoute({ repository, providers, providerName, query, env, now }) {
  return completeDevelopmentOAuth({ repository, providers, providerName, query, env, now });
}

export function buildOAuthSuccessLocation(returnTo, provider) {
  const url = new URL(returnTo || '/', 'http://srocial.local');
  url.searchParams.set('oauth', 'connected');
  url.searchParams.set('provider', provider);
  return `${url.pathname}${url.search}${url.hash}`;
}
