import test from 'node:test';
import assert from 'node:assert/strict';
import { createFacebookOAuthProvider } from '../server/platforms/facebook/auth.js';

const config = {
  appId: 'app-123', appSecret: 'super-secret', apiVersion: 'v26.0', pageId: 'page-2',
  scopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts']
};

test('builds versioned Facebook authorization URL', async () => {
  const provider = createFacebookOAuthProvider({ config, client: {} });
  const url = new URL(await provider.getAuthorizationUrl({ state: 'state-1', redirectUri: 'https://srocial.example/api/oauth/facebook/callback' }));
  assert.equal(url.origin, 'https://www.facebook.com');
  assert.equal(url.pathname, '/v26.0/dialog/oauth');
  assert.equal(url.searchParams.get('client_id'), 'app-123');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://srocial.example/api/oauth/facebook/callback');
  assert.equal(url.searchParams.get('state'), 'state-1');
  assert.equal(url.searchParams.get('scope'), 'pages_show_list,pages_read_engagement,pages_manage_posts');
});

test('exchanges code, upgrades user token, and resolves configured Page access token', async () => {
  const calls = [];
  const client = {
    async getGraph(path, options) {
      calls.push({ path, options });
      if (calls.length === 1) return { access_token: 'short-user' };
      if (calls.length === 2) return { access_token: 'long-user', expires_in: 3600 };
      return { id: 'page-2', name: 'Page Two', access_token: 'page-token', tasks: ['PROFILE_PLUS_CREATE_CONTENT'] };
    }
  };
  const provider = createFacebookOAuthProvider({ config, client });
  const tokens = await provider.exchangeCode({ code: 'code#fragment', redirectUri: 'https://srocial.example/callback' });
  assert.deepEqual(calls[0], { path: '/oauth/access_token', options: { query: {
    client_id: 'app-123', client_secret: 'super-secret', redirect_uri: 'https://srocial.example/callback', code: 'code'
  } } });
  assert.deepEqual(calls[1], { path: '/oauth/access_token', options: { query: {
    grant_type: 'fb_exchange_token', client_id: 'app-123', client_secret: 'super-secret', fb_exchange_token: 'short-user'
  } } });
  assert.equal(calls[2].path, '/page-2');
  assert.equal(calls[2].options.accessToken, 'long-user');
  assert.equal(calls[2].options.query.fields, 'id,name,access_token,tasks');
  assert.deepEqual(tokens, {
    accessToken: 'page-token', refreshToken: null, expiresAt: null,
    scopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts']
  });
});

test('auto-selects only one managed Page and fails closed for multiple candidates', async () => {
  const baseClient = {
    async getGraph(path) {
      if (path === '/oauth/access_token') return { access_token: 'user-token' };
      return { data: [{ id: 'only-page', name: 'Only', access_token: 'page-token', tasks: ['CREATE_CONTENT'] }] };
    }
  };
  const one = createFacebookOAuthProvider({ config: { ...config, pageId: null }, client: baseClient });
  assert.equal((await one.exchangeCode({ code: 'x', redirectUri: 'https://x.example/cb' })).accessToken, 'page-token');

  let tokenCalls = 0;
  const many = createFacebookOAuthProvider({ config: { ...config, pageId: null }, client: {
    async getGraph(path) {
      if (path === '/oauth/access_token') { tokenCalls += 1; return { access_token: tokenCalls === 1 ? 'short' : 'long' }; }
      return { data: [
        { id: 'page-a', access_token: 'a' },
        { id: 'page-b', access_token: 'b' }
      ] };
    }
  } });
  await assert.rejects(
    () => many.exchangeCode({ code: 'x', redirectUri: 'https://x.example/cb' }),
    (error) => error.code === 'PAGE_SELECTION_REQUIRED' && error.retryable === false
  );
});

test('maps Page identity into generic account shape', async () => {
  const client = { async getGraph(path, options) {
    assert.equal(path, '/me');
    assert.equal(options.accessToken, 'page-token');
    assert.equal(options.query.fields, 'id,name,picture');
    return { id: 'page-2', name: 'Dr Animal', picture: { data: { url: 'https://cdn.example/page.jpg' } } };
  } };
  const provider = createFacebookOAuthProvider({ config, client });
  assert.deepEqual(await provider.getAccountIdentity({ accessToken: 'page-token' }), {
    providerAccountId: 'page-2', displayName: 'Dr Animal', username: null,
    accountType: 'PAGE', profilePictureUrl: 'https://cdn.example/page.jpg'
  });
});

test('rejects malformed Facebook token responses with safe codes', async () => {
  const provider = createFacebookOAuthProvider({ config, client: { async getGraph(){ return {}; } } });
  await assert.rejects(
    () => provider.exchangeCode({ code: 'x', redirectUri: 'https://x.example/cb' }),
    (error) => error.code === 'AUTH_ERROR' && error.retryable === false && !String(error.message).includes('super-secret')
  );
});
