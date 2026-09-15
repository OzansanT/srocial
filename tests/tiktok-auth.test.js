import test from 'node:test';
import assert from 'node:assert/strict';
import { getTikTokConfig } from '../server/platforms/tiktok/config.js';
import { createTikTokOAuthProvider } from '../server/platforms/tiktok/auth.js';

const config = {
  clientKey: 'tt-client',
  clientSecret: 'tt-secret',
  scopes: ['user.info.basic', 'video.publish']
};

test('loads TikTok config only when client credentials are complete', () => {
  assert.equal(getTikTokConfig({ TIKTOK_CLIENT_KEY: 'key' }), null);
  assert.deepEqual(getTikTokConfig({ TIKTOK_CLIENT_KEY: 'key', TIKTOK_CLIENT_SECRET: 'secret' }), {
    clientKey: 'key', clientSecret: 'secret', scopes: ['user.info.basic', 'video.publish', 'video.list']
  });
});

test('builds TikTok web authorization URL', async () => {
  const provider = createTikTokOAuthProvider({ config, client: {} });
  const url = new URL(await provider.getAuthorizationUrl({ state: 'state-1', redirectUri: 'https://srocial.example/api/oauth/tiktok/callback' }));
  assert.equal(url.origin, 'https://www.tiktok.com');
  assert.equal(url.pathname, '/v2/auth/authorize/');
  assert.equal(url.searchParams.get('client_key'), 'tt-client');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://srocial.example/api/oauth/tiktok/callback');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('scope'), 'user.info.basic,video.publish');
  assert.equal(url.searchParams.get('state'), 'state-1');
});

test('exchanges TikTok authorization code and preserves rotating refresh token', async () => {
  const calls = [];
  const client = {
    async formPost(path, fields) {
      calls.push({ path, fields });
      return {
        access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 86400,
        refresh_expires_in: 31536000, open_id: 'open-1', scope: 'user.info.basic,video.publish'
      };
    }
  };
  const provider = createTikTokOAuthProvider({ config, client, now: () => new Date('2026-09-14T10:00:00.000Z') });
  assert.deepEqual(await provider.exchangeCode({ code: 'code-1', redirectUri: 'https://srocial.example/api/oauth/tiktok/callback' }), {
    accessToken: 'access-1', refreshToken: 'refresh-1', expiresAt: '2026-09-15T10:00:00.000Z', scopes: ['user.info.basic', 'video.publish']
  });
  assert.deepEqual(calls[0], {
    path: '/v2/oauth/token/',
    fields: {
      client_key: 'tt-client', client_secret: 'tt-secret', code: 'code-1',
      grant_type: 'authorization_code', redirect_uri: 'https://srocial.example/api/oauth/tiktok/callback'
    }
  });
});

test('refreshes TikTok access token from refresh token and returns replacement refresh token', async () => {
  const calls = [];
  const client = {
    async formPost(path, fields) {
      calls.push({ path, fields });
      return { access_token: 'access-2', refresh_token: 'refresh-2', expires_in: 86400, scope: 'user.info.basic,video.publish' };
    }
  };
  const provider = createTikTokOAuthProvider({ config, client, now: () => new Date('2026-09-14T10:00:00.000Z') });
  assert.deepEqual(await provider.refreshAccessToken({ refreshToken: 'refresh-1' }), {
    accessToken: 'access-2', refreshToken: 'refresh-2', expiresAt: '2026-09-15T10:00:00.000Z'
  });
  assert.deepEqual(calls[0], {
    path: '/v2/oauth/token/',
    fields: { client_key: 'tt-client', client_secret: 'tt-secret', grant_type: 'refresh_token', refresh_token: 'refresh-1' }
  });
});

test('maps TikTok user info into generic account identity', async () => {
  const client = {
    async getApi(path, options) {
      assert.equal(path, '/v2/user/info/');
      assert.equal(options.accessToken, 'access-1');
      assert.equal(options.query.fields, 'open_id,avatar_url,display_name');
      return { data: { user: { open_id: 'open-1', display_name: 'Creator', avatar_url: 'https://cdn.example/avatar.jpg' } } };
    }
  };
  const provider = createTikTokOAuthProvider({ config, client });
  assert.deepEqual(await provider.getAccountIdentity({ accessToken: 'access-1' }), {
    providerAccountId: 'open-1', displayName: 'Creator', username: null, accountType: 'TIKTOK', profilePictureUrl: 'https://cdn.example/avatar.jpg'
  });
});
