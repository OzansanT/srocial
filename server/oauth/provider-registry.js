import { createMetaOAuthProvider } from '../platforms/meta/auth.js';
import { threadsOAuthProvider } from '../platforms/threads/auth.js';
import { tiktokOAuthProvider } from '../platforms/tiktok/auth.js';
import { whatsappOAuthProvider } from '../messaging/whatsapp/auth.js';

export class OAuthProviderError extends Error {
  constructor(code) {
    super(code);
    this.name = 'OAuthProviderError';
    this.code = code;
  }
}

export function createOAuthProviderRegistry() {
  return new Map([
    ['instagram', createMetaOAuthProvider({ name: 'instagram', scopesEnvKey: 'INSTAGRAM_OAUTH_SCOPES' })],
    ['facebook', createMetaOAuthProvider({ name: 'facebook', scopesEnvKey: 'FACEBOOK_OAUTH_SCOPES' })],
    ['threads', threadsOAuthProvider],
    ['tiktok', tiktokOAuthProvider],
    ['whatsapp', whatsappOAuthProvider]
  ]);
}

export function getOAuthProvider(registry, name) {
  const key = String(name ?? '').trim().toLowerCase();
  const provider = registry.get(key);
  if (!provider) throw new OAuthProviderError('UNSUPPORTED_PROVIDER');
  return provider;
}
