import { registerAnalyticsProvider } from '../../analytics/registry.js';
import { registerOAuthProvider } from '../../auth/oauth-provider-registry.js';
import { registerPlatform } from '../registry.js';
import { createTikTokAnalyticsAdapter } from './analytics.js';
import { createTikTokOAuthProvider } from './auth.js';
import { createTikTokClient } from './client.js';
import { getTikTokConfig } from './config.js';
import { createTikTokPublishingAdapter } from './publish.js';

function authError() {
  const error = new Error('AUTH_ERROR');
  error.code = 'AUTH_ERROR';
  error.retryable = false;
  return error;
}

export function registerTikTokProvider({ env = process.env, oauthRegistry, platformRegistry, analyticsRegistry = null, repository, cipher, fetchImpl = globalThis.fetch } = {}) {
  const config = getTikTokConfig(env);
  if (!config) return { configured: false };
  if (!oauthRegistry || !platformRegistry || !repository) throw new Error('TIKTOK_RUNTIME_DEPENDENCIES_REQUIRED');

  const client = createTikTokClient({ fetchImpl });
  const oauthProvider = createTikTokOAuthProvider({ config, client });

  async function resolveCredentials(accountId) {
    if (!cipher || typeof cipher.decrypt !== 'function') throw authError();
    const account = await repository.getAccount(accountId);
    if (!account || account.provider !== 'tiktok' || account.state !== 'CONNECTED' || !account.accessTokenEncrypted || !account.providerAccountId) throw authError();
    let accessToken;
    try { accessToken = cipher.decrypt(account.accessTokenEncrypted); } catch { throw authError(); }
    if (!accessToken) throw authError();
    return { accountId: account.id, providerAccountId: account.providerAccountId, accessToken };
  }

  const publishingAdapter = createTikTokPublishingAdapter({
    client,
    resolveCredentials,
    getMedia: (postId) => repository.listMediaForPost(postId)
  });
  registerOAuthProvider(oauthRegistry, 'tiktok', oauthProvider);
  registerPlatform(platformRegistry, 'tiktok', publishingAdapter);
  if (analyticsRegistry) registerAnalyticsProvider(analyticsRegistry, 'tiktok', createTikTokAnalyticsAdapter({ client, resolveCredentials }));
  return { configured: true, scopes: [...config.scopes] };
}
