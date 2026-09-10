import { getOAuthProvider } from '../auth/oauth-provider-registry.js';
import { consumeOAuthState, issueOAuthState } from '../auth/oauth-state-service.js';
import { upsertConnectedAccount } from './account-service.js';

export async function startOAuthConnection({ provider, redirectUri, repository, providerRegistry, now = new Date() }) {
  const adapter = getOAuthProvider(providerRegistry, provider);
  const issued = await issueOAuthState(repository, { provider, redirectUri, now });
  const authorizationUrl = await adapter.getAuthorizationUrl({ state: issued.state, redirectUri });
  return { provider: String(provider).trim().toLowerCase(), authorizationUrl, state: issued.state, expiresAt: issued.expiresAt };
}

export async function completeOAuthConnection({ provider, code, state, repository, providerRegistry, cipher, now = new Date() }) {
  if (!String(code ?? '').trim()) throw new Error('OAUTH_CODE_REQUIRED');
  const adapter = getOAuthProvider(providerRegistry, provider);
  const stateRecord = await consumeOAuthState(repository, { provider, state, now });
  const tokens = await adapter.exchangeCode({ code, redirectUri: stateRecord.redirectUri });
  if (!tokens?.accessToken) throw new Error('OAUTH_TOKEN_EXCHANGE_FAILED');
  const identity = await adapter.getAccountIdentity({ accessToken: tokens.accessToken });
  const account = await upsertConnectedAccount(repository, cipher, {
    provider: String(provider).trim().toLowerCase(),
    providerAccountId: identity.providerAccountId,
    displayName: identity.displayName ?? null,
    username: identity.username ?? null,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken ?? null,
    expiresAt: tokens.expiresAt ?? null,
    scopes: tokens.scopes ?? []
  }, { now });
  return { account };
}
