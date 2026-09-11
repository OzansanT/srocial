import { registerOAuthProvider } from '../../auth/oauth-provider-registry.js';
import { registerPlatform } from '../registry.js';
import { createThreadsOAuthProvider } from './auth.js';
import { createThreadsClient } from './client.js';
import { getThreadsConfig } from './config.js';
import { createThreadsPublishingAdapter } from './publish.js';

function authError() {
  const error = new Error('AUTH_ERROR');
  error.code = 'AUTH_ERROR';
  error.retryable = false;
  return error;
}

export function registerThreadsProvider({ env = process.env, oauthRegistry, platformRegistry, repository, cipher, fetchImpl = globalThis.fetch } = {}) {
  const config = getThreadsConfig(env);
  if (!config) return { configured: false };
  if (!oauthRegistry || !platformRegistry || !repository) throw new Error('THREADS_RUNTIME_DEPENDENCIES_REQUIRED');

  const client = createThreadsClient({ fetchImpl, apiVersion: config.apiVersion });
  const oauthProvider = createThreadsOAuthProvider({ config, client });

  async function resolveCredentials(accountId) {
    if (!cipher || typeof cipher.decrypt !== 'function') throw authError();
    const account = await repository.getAccount(accountId);
    if (!account || account.provider !== 'threads' || account.state !== 'CONNECTED' || !account.accessTokenEncrypted || !account.providerAccountId) throw authError();
    let accessToken;
    try { accessToken = cipher.decrypt(account.accessTokenEncrypted); } catch { throw authError(); }
    if (!accessToken) throw authError();
    return { accountId: account.id, providerAccountId: account.providerAccountId, accessToken };
  }

  const publishingAdapter = createThreadsPublishingAdapter({
    client,
    resolveCredentials,
    getMedia: (postId) => repository.listMediaForPost(postId)
  });
  registerOAuthProvider(oauthRegistry, 'threads', oauthProvider);
  registerPlatform(platformRegistry, 'threads', publishingAdapter);
  return { configured: true, apiVersion: config.apiVersion, scopes: [...config.scopes] };
}
