import { toSafeAccount } from '../accounts/account-serializer.js';
import { createOAuthState, consumeOAuthState } from './oauth-state-service.js';
import { getOAuthProvider } from './provider-registry.js';

export class OAuthServiceError extends Error {
  constructor(code, statusCode = 400) {
    super(code);
    this.name = 'OAuthServiceError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function getBaseUrl(env) {
  try {
    return new URL(env?.APP_BASE_URL).origin;
  } catch {
    throw new OAuthServiceError('PROVIDER_NOT_CONFIGURED', 503);
  }
}

export async function beginOAuth({ repository, providers, providerName, returnTo = '/', env = process.env, now = new Date() }) {
  const provider = getOAuthProvider(providers, providerName);
  if (!provider.isConfigured(env)) throw new OAuthServiceError('PROVIDER_NOT_CONFIGURED', 503);

  const baseUrl = getBaseUrl(env);
  const issued = await createOAuthState({ repository, provider: provider.name, returnTo, now });
  const redirectUri = new URL(`/auth/${provider.name}/callback`, `${baseUrl}/`).toString();
  const authorizationUrl = provider.getAuthorizationUrl({ state: issued.state, redirectUri, env });
  return { provider: provider.name, authorizationUrl, expiresAt: issued.expiresAt };
}

export async function completeDevelopmentOAuth({ repository, providers, providerName, query, env = process.env, now = new Date() }) {
  const provider = getOAuthProvider(providers, providerName);
  const callback = provider.normalizeCallback(query);

  if (callback.error || !callback.code || !callback.state) {
    throw new OAuthServiceError('OAUTH_CALLBACK_ERROR', 400);
  }
  if (String(env.APP_ENV ?? 'development').toLowerCase() === 'production') {
    throw new OAuthServiceError('TOKEN_EXCHANGE_NOT_IMPLEMENTED', 501);
  }

  const oauthState = await consumeOAuthState({ repository, provider: provider.name, state: callback.state, now });
  const timestamp = now.toISOString();
  const account = await repository.createAccount({
    platform: provider.name,
    providerAccountId: null,
    displayName: `${provider.name} development authorization`,
    connected: true,
    scopes: callback.scopes,
    accessTokenEncrypted: null,
    refreshTokenEncrypted: null,
    tokenExpiresAt: null,
    connectionMode: 'development-placeholder',
    createdAt: timestamp,
    updatedAt: timestamp
  });

  return { account: toSafeAccount(account), returnTo: oauthState.returnTo };
}
