import test from 'node:test';
import assert from 'node:assert/strict';
import { createThreadsOAuthProvider } from '../server/platforms/threads/auth.js';

const config = { appId:'threads-app', appSecret:'threads-secret', apiVersion:'v1.0', scopes:['threads_basic','threads_content_publish'] };

test('builds Threads authorization URL', async () => {
  const provider = createThreadsOAuthProvider({ config, client:{} });
  const url = new URL(await provider.getAuthorizationUrl({ state:'state-1', redirectUri:'https://srocial.example/api/oauth/threads/callback' }));
  assert.equal(url.origin, 'https://threads.net'); assert.equal(url.pathname, '/oauth/authorize');
  assert.equal(url.searchParams.get('client_id'), 'threads-app');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://srocial.example/api/oauth/threads/callback');
  assert.equal(url.searchParams.get('scope'), 'threads_basic,threads_content_publish');
  assert.equal(url.searchParams.get('response_type'), 'code'); assert.equal(url.searchParams.get('state'), 'state-1');
});

test('exchanges Threads code for short then long-lived token', async () => {
  const calls=[];
  const client={
    async formPost(url,fields){ calls.push({method:'formPost',url,fields}); return { access_token:'short-token', user_id:'threads-1' }; },
    async getGraph(path,options){ calls.push({method:'getGraph',path,options}); return { access_token:'long-token', token_type:'bearer', expires_in:7200 }; }
  };
  const provider=createThreadsOAuthProvider({config,client,now:()=>new Date('2026-09-11T12:00:00.000Z')});
  const tokens=await provider.exchangeCode({code:'auth-code#_',redirectUri:'https://srocial.example/callback'});
  assert.equal(calls[0].url,'https://graph.threads.net/oauth/access_token');
  assert.deepEqual(calls[0].fields,{client_id:'threads-app',client_secret:'threads-secret',grant_type:'authorization_code',redirect_uri:'https://srocial.example/callback',code:'auth-code'});
  assert.deepEqual(calls[1],{method:'getGraph',path:'/access_token',options:{versioned:false,query:{grant_type:'th_exchange_token',client_secret:'threads-secret',access_token:'short-token'}}});
  assert.deepEqual(tokens,{accessToken:'long-token',refreshToken:null,expiresAt:'2026-09-11T14:00:00.000Z',scopes:['threads_basic','threads_content_publish']});
});

test('refreshes Threads long-lived token through existing scheduler-compatible hook', async () => {
  const calls=[];
  const client={async getGraph(path,options){calls.push({path,options});return{access_token:'fresh-token',expires_in:3600};}};
  const provider=createThreadsOAuthProvider({config,client,now:()=>new Date('2026-09-11T12:00:00.000Z')});
  assert.deepEqual(await provider.refreshAccessToken({accessToken:'old-token'}),{accessToken:'fresh-token',expiresAt:'2026-09-11T13:00:00.000Z'});
  assert.deepEqual(calls,[{path:'/refresh_access_token',options:{versioned:false,query:{grant_type:'th_refresh_token',access_token:'old-token'}}}]);
});

test('maps Threads /me identity into generic account shape', async () => {
  const client={async getGraph(path,options){
    assert.equal(path,'/me'); assert.equal(options.accessToken,'long-token');
    assert.equal(options.query.fields,'id,username,threads_profile_picture_url');
    return{id:'threads-1',username:'dranimal',threads_profile_picture_url:'https://cdn.example/threads.jpg'};
  }};
  const provider=createThreadsOAuthProvider({config,client});
  assert.deepEqual(await provider.getAccountIdentity({accessToken:'long-token'}),{
    providerAccountId:'threads-1',displayName:'dranimal',username:'dranimal',accountType:'THREADS',profilePictureUrl:'https://cdn.example/threads.jpg'
  });
});

test('rejects malformed Threads token and refresh responses safely', async () => {
  const exchange=createThreadsOAuthProvider({config,client:{async formPost(){return{};},async getGraph(){throw new Error('should not run');}}});
  await assert.rejects(()=>exchange.exchangeCode({code:'x',redirectUri:'https://x.example/cb'}),(error)=>error.code==='AUTH_ERROR'&&error.retryable===false);
  const refresh=createThreadsOAuthProvider({config,client:{async getGraph(){return{expires_in:3600,secret:'no'};}}});
  await assert.rejects(()=>refresh.refreshAccessToken({accessToken:'x'}),(error)=>error.code==='AUTH_ERROR'&&!String(error.message).includes('no'));
});
