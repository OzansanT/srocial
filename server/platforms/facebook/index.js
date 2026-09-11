import { registerOAuthProvider } from '../../auth/oauth-provider-registry.js';
import { registerPlatform } from '../registry.js';
import { createFacebookOAuthProvider } from './auth.js';
import { createFacebookClient } from './client.js';
import { getFacebookConfig } from './config.js';
import { createFacebookPublishingAdapter } from './publish.js';

function authError() {
  const error = new Error('AUTH_ERROR');
  error.code = 'AUTH_ERROR';
  error.retryable = false;
  return error;
}

export function registerFacebookProvider({ env = process.env, oauthRegistry, platformRegistry, repository, cipher, fetchImpl = globalThis.fetch } = {}) {
  const config = getFacebookConfig(env);
  if (!config) return { configured: false };
  if (!oauthRegistry || !platformRegistry || !repository) throw new Error('FACEBOOK_RUNTIME_DEPENDENCIES_REQUIRED');

  const client = createFacebookClient({ fetchImpl, apiVersion: config.apiVersion });
  const oauthProvider = createFacebookOAuthProvider({ config, client });

  async function resolveCredentials(accountId) {
    if (!cipher || typeof cipher.decrypt !== 'function') throw authError();
    const account = await repository.getAccount(accountId);
    if (!account || account.provider !== 'facebook' || account.state !== 'CONNECTED' || !account.accessTokenEncrypted || !account.providerAccountId) throw authError();
    let accessToken;
    try { accessToken = cipher.decrypt(account.accessTokenEncrypted); } catch { throw authError(); }
    if (!accessToken) throw authError();
    return { accountId: account.id, providerAccountId: account.providerAccountId, accessToken };
  }

  const publishingAdapter = createFacebookPublishingAdapter({
    client,
    resolveCredentials,
    getMedia: (postId) => repository.listMediaForPost(postId)
  });
  registerOAuthProvider(oauthRegistry, 'facebook', oauthProvider);
  registerPlatform(platformRegistry, 'facebook', publishingAdapter);
  return { configured: true, apiVersion: config.apiVersion, scopes: [...config.scopes], pageId: config.pageId };
}
