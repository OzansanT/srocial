import test from 'node:test';
import assert from 'node:assert/strict';
import { createOAuthProviderRegistry } from '../server/auth/oauth-provider-registry.js';
import { createPlatformRegistry } from '../server/platforms/registry.js';
import { registerThreadsProvider } from '../server/platforms/threads/index.js';

test('does not register Threads when app credentials are absent', () => {
  const oauthRegistry=createOAuthProviderRegistry(); const platformRegistry=createPlatformRegistry();
  assert.deepEqual(registerThreadsProvider({env:{},oauthRegistry,platformRegistry}),{configured:false});
  assert.equal(oauthRegistry.has('threads'),false); assert.equal(platformRegistry.has('threads'),false);
});

test('registers Threads OAuth and publishing adapters when configured', () => {
  const oauthRegistry=createOAuthProviderRegistry(); const platformRegistry=createPlatformRegistry();
  const repository={async getAccount(){return{id:'acct1',provider:'threads',providerAccountId:'threads-1',state:'CONNECTED',accessTokenEncrypted:'ciphertext'};},async listMediaForPost(){return[];}};
  const result=registerThreadsProvider({
    env:{THREADS_APP_ID:'app',THREADS_APP_SECRET:'secret'},oauthRegistry,platformRegistry,repository,
    cipher:{decrypt(){return'threads-token';}},fetchImpl:async()=>new Response('{}',{status:200})
  });
  assert.equal(result.configured,true); assert.equal(typeof oauthRegistry.get('threads').getAuthorizationUrl,'function');
  assert.equal(typeof oauthRegistry.get('threads').refreshAccessToken,'function'); assert.equal(typeof platformRegistry.get('threads').publish,'function');
  assert.equal(platformRegistry.get('threads').capabilities.video,true);
});

test('Threads credential resolver rejects wrong-provider, disconnected or missing accounts', async () => {
  for(const account of [null,{provider:'facebook',state:'CONNECTED',accessTokenEncrypted:'x'},{provider:'threads',state:'DISCONNECTED',accessTokenEncrypted:'x'}]){
    const oauthRegistry=createOAuthProviderRegistry(); const platformRegistry=createPlatformRegistry();
    registerThreadsProvider({
      env:{THREADS_APP_ID:'app',THREADS_APP_SECRET:'secret'},oauthRegistry,platformRegistry,
      repository:{async getAccount(){return account;},async listMediaForPost(){return[];}},cipher:{decrypt(){return'token';}},
      fetchImpl:async()=>{throw new Error('provider should not be called');}
    });
    await assert.rejects(()=>platformRegistry.get('threads').publish({post:{id:'p1',caption:'x'},publication:{accountId:'acct1'}}),(error)=>error.code==='AUTH_ERROR'&&error.retryable===false);
  }
});
