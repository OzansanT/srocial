import test from 'node:test';
import assert from 'node:assert/strict';
import { createOAuthProviderRegistry, registerOAuthProvider, getOAuthProvider } from '../server/auth/oauth-provider-registry.js';

test('normalizes provider names', () => {
  const registry = createOAuthProviderRegistry();
  const adapter = { name: 'Instagram' };
  registerOAuthProvider(registry, ' Instagram ', adapter);
  assert.equal(getOAuthProvider(registry, 'INSTAGRAM'), adapter);
});

test('rejects duplicates and unsupported providers', () => {
  const registry = createOAuthProviderRegistry();
  registerOAuthProvider(registry, 'threads', {});
  assert.throws(() => registerOAuthProvider(registry, 'THREADS', {}), /already registered/i);
  assert.throws(() => getOAuthProvider(registry, 'tiktok'), /UNSUPPORTED_PROVIDER/);
});
