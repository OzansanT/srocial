import { registerOAuthProvider } from '../../auth/oauth-provider-registry.js';
import { registerPlatform } from '../registry.js';
import { getInstagramConfig } from './config.js';
import { createInstagramClient } from './client.js';
import { createInstagramOAuthProvider } from './auth.js';
import { createInstagramPublishingAdapter } from './publish.js';

function authError() { const error = new Error('AUTH_ERROR'); error.code = 'AUTH_ERROR'; error.retryable = false; return error; }

export function registerInstagramProvider({ env = process.env, oauthRegistry, platformRegistry, repository, cipher, fetchImpl = globalThis.fetch } = {}) {
  const config = getInstagramConfig(env);
  if (!config) return { configured: false };
  if (!oauthRegistry || !platformRegistry || !repository) throw new Error('INSTAGRAM_RUNTIME_DEPENDENCIES_REQUIRED');
  const client = createInstagramClient({ fetchImpl, apiVersion: config.apiVersion });
  const oauthProvider = createInstagramOAuthProvider({ config, client });

  async function resolveCredentials(accountId) {
    if (!cipher || typeof cipher.decrypt !== 'function') throw authError();
    const account = await repository.getAccount(accountId);
    if (!account || account.provider !== 'instagram' || account.state !== 'CONNECTED' || !account.accessTokenEncrypted || !account.providerAccountId) throw authError();
    let accessToken;
    try { accessToken = cipher.decrypt(account.accessTokenEncrypted); } catch { throw authError(); }
    if (!accessToken) throw authError();
    return { accountId: account.id, providerAccountId: account.providerAccountId, accessToken };
  }

  const publishingAdapter = createInstagramPublishingAdapter({ client, resolveCredentials, getMedia: (postId) => repository.listMediaForPost(postId) });
  registerOAuthProvider(oauthRegistry, 'instagram', oauthProvider);
  registerPlatform(platformRegistry, 'instagram', publishingAdapter);
  return { configured: true, apiVersion: config.apiVersion, scopes: [...config.scopes] };
}
