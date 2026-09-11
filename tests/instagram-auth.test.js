import test from 'node:test';
import assert from 'node:assert/strict';
import { createInstagramOAuthProvider } from '../server/platforms/instagram/auth.js';

const config = { appId: 'app-123', appSecret: 'super-secret', apiVersion: 'v26.0', scopes: ['instagram_business_basic', 'instagram_business_content_publish'] };

test('builds current Instagram professional authorization URL', async () => {
  const provider = createInstagramOAuthProvider({ config, client: {} });
  const url = new URL(await provider.getAuthorizationUrl({ state: 'state-1', redirectUri: 'https://srocial.example/api/oauth/instagram/callback' }));
  assert.equal(url.origin, 'https://www.instagram.com'); assert.equal(url.pathname, '/oauth/authorize'); assert.equal(url.searchParams.get('client_id'), 'app-123');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://srocial.example/api/oauth/instagram/callback'); assert.equal(url.searchParams.get('response_type'), 'code'); assert.equal(url.searchParams.get('state'), 'state-1');
  assert.equal(url.searchParams.get('scope'), 'instagram_business_basic,instagram_business_content_publish');
});

test('exchanges code for short token then long-lived token', async () => {
  const calls = [];
  const client = { async formPost(url, fields) { calls.push({ method:'formPost', url, fields }); return { access_token:'short-token', user_id:'ig-42' }; }, async getGraph(path, options) { calls.push({ method:'getGraph', path, options }); return { access_token:'long-token', token_type:'bearer', expires_in:3600 }; } };
  const provider = createInstagramOAuthProvider({ config, client, now: () => new Date('2026-09-10T12:00:00.000Z') });
  const tokens = await provider.exchangeCode({ code:'auth-code#_', redirectUri:'https://srocial.example/callback' });
  assert.equal(calls[0].url, 'https://api.instagram.com/oauth/access_token');
  assert.deepEqual(calls[0].fields, { client_id:'app-123', client_secret:'super-secret', grant_type:'authorization_code', redirect_uri:'https://srocial.example/callback', code:'auth-code' });
  assert.equal(calls[1].path, '/access_token'); assert.equal(calls[1].options.versioned, false);
  assert.deepEqual(calls[1].options.query, { grant_type:'ig_exchange_token', client_secret:'super-secret', access_token:'short-token' });
  assert.deepEqual(tokens, { accessToken:'long-token', refreshToken:null, expiresAt:'2026-09-10T13:00:00.000Z', scopes:['instagram_business_basic','instagram_business_content_publish'] });
});

test('refreshes a long-lived token through the Instagram refresh endpoint', async () => {
  const calls = [];
  const client = { async getGraph(path, options) { calls.push({ path, options }); return { access_token:'fresh-token', token_type:'bearer', expires_in:3600 }; } };
  const provider = createInstagramOAuthProvider({ config, client, now: () => new Date('2026-09-11T12:00:00.000Z') });
  const refreshed = await provider.refreshAccessToken({ accessToken:'old-long-token' });
  assert.deepEqual(calls, [{
    path:'/refresh_access_token',
    options:{ versioned:false, query:{ grant_type:'ig_refresh_token', access_token:'old-long-token' } }
  }]);
  assert.deepEqual(refreshed, { accessToken:'fresh-token', expiresAt:'2026-09-11T13:00:00.000Z' });
});

test('rejects malformed refresh responses without exposing provider payloads', async () => {
  const provider = createInstagramOAuthProvider({ config, client: { async getGraph(){ return { expires_in:3600, provider_secret:'must-not-leak' }; } } });
  await assert.rejects(
    () => provider.refreshAccessToken({ accessToken:'old-long-token' }),
    (error) => error.code === 'AUTH_ERROR' && error.retryable === false && !String(error.message).includes('must-not-leak')
  );
});

test('maps /me identity into the generic Srocial account shape', async () => {
  const client = { async getGraph(path, options) { assert.equal(path, '/me'); assert.equal(options.accessToken, 'long-token'); assert.equal(options.query.fields, 'id,username,account_type,profile_picture_url'); return { id:'178900', username:'dranimal', account_type:'BUSINESS', profile_picture_url:'https://cdn.example/avatar.jpg' }; } };
  const provider = createInstagramOAuthProvider({ config, client });
  assert.deepEqual(await provider.getAccountIdentity({ accessToken:'long-token' }), { providerAccountId:'178900', displayName:'dranimal', username:'dranimal', accountType:'BUSINESS', profilePictureUrl:'https://cdn.example/avatar.jpg' });
});

test('rejects malformed token and identity responses with safe codes', async () => {
  const missingTokenProvider = createInstagramOAuthProvider({ config, client: { async formPost(){ return {}; }, async getGraph(){ throw new Error('should not run'); } } });
  await assert.rejects(() => missingTokenProvider.exchangeCode({ code:'x', redirectUri:'https://x.example/cb' }), (error) => error.code === 'AUTH_ERROR' && error.retryable === false);
  const missingIdentityProvider = createInstagramOAuthProvider({ config, client: { async getGraph(){ return {}; } } });
  await assert.rejects(() => missingIdentityProvider.getAccountIdentity({ accessToken:'x' }), (error) => error.code === 'AUTH_ERROR' && error.retryable === false);
});
