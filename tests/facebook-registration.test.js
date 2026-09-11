import test from 'node:test';
import assert from 'node:assert/strict';
import { createOAuthProviderRegistry } from '../server/auth/oauth-provider-registry.js';
import { createPlatformRegistry } from '../server/platforms/registry.js';
import { registerFacebookProvider } from '../server/platforms/facebook/index.js';

test('does not register Facebook when app credentials are absent', () => {
  const oauthRegistry = createOAuthProviderRegistry(); const platformRegistry = createPlatformRegistry();
  assert.deepEqual(registerFacebookProvider({ env: {}, oauthRegistry, platformRegistry }), { configured: false });
  assert.equal(oauthRegistry.has('facebook'), false); assert.equal(platformRegistry.has('facebook'), false);
});

test('registers Facebook OAuth and publishing adapters when configured', () => {
  const oauthRegistry = createOAuthProviderRegistry(); const platformRegistry = createPlatformRegistry();
  const repository = {
    async getAccount(){ return { id:'acct1', provider:'facebook', providerAccountId:'page-1', state:'CONNECTED', accessTokenEncrypted:'ciphertext' }; },
    async listMediaForPost(){ return []; }
  };
  const result = registerFacebookProvider({
    env:{ FACEBOOK_APP_ID:'app', FACEBOOK_APP_SECRET:'secret', FACEBOOK_PAGE_ID:'page-1' }, oauthRegistry, platformRegistry, repository,
    cipher:{ decrypt(){ return 'page-token'; } }, fetchImpl:async()=>new Response('{}',{status:200})
  });
  assert.equal(result.configured, true);
  assert.equal(typeof oauthRegistry.get('facebook').getAuthorizationUrl, 'function');
  assert.equal(typeof platformRegistry.get('facebook').publish, 'function');
  assert.equal(platformRegistry.get('facebook').capabilities.video, true);
});

test('Facebook credential resolver rejects wrong-provider, disconnected or missing accounts', async () => {
  for (const account of [null, {provider:'threads',state:'CONNECTED',accessTokenEncrypted:'x'}, {provider:'facebook',state:'DISCONNECTED',accessTokenEncrypted:'x'}]) {
    const oauthRegistry=createOAuthProviderRegistry(); const platformRegistry=createPlatformRegistry();
    registerFacebookProvider({
      env:{FACEBOOK_APP_ID:'app',FACEBOOK_APP_SECRET:'secret'}, oauthRegistry, platformRegistry,
      repository:{async getAccount(){return account;},async listMediaForPost(){return[];}}, cipher:{decrypt(){return'token';}},
      fetchImpl:async()=>{throw new Error('provider should not be called');}
    });
    await assert.rejects(() => platformRegistry.get('facebook').publish({post:{id:'p1',caption:'x'},publication:{accountId:'acct1'}}), (error) => error.code==='AUTH_ERROR' && error.retryable===false);
  }
});
