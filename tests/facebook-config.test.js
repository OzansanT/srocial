import test from 'node:test';
import assert from 'node:assert/strict';
import { FACEBOOK_SCOPES, getFacebookConfig } from '../server/platforms/facebook/config.js';

test('Facebook config is absent until both app credentials exist', () => {
  assert.equal(getFacebookConfig({}), null);
  assert.equal(getFacebookConfig({ FACEBOOK_APP_ID: 'id' }), null);
  assert.equal(getFacebookConfig({ FACEBOOK_APP_SECRET: 'secret' }), null);
});

test('Facebook config defaults to Graph API v26.0 and Page publishing scopes', () => {
  const config = getFacebookConfig({ FACEBOOK_APP_ID: '123', FACEBOOK_APP_SECRET: 'secret' });
  assert.deepEqual(config, {
    appId: '123', appSecret: 'secret', apiVersion: 'v26.0', pageId: null,
    scopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts']
  });
  assert.deepEqual(FACEBOOK_SCOPES, ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts']);
});

test('Facebook config normalizes API version and optional Page id', () => {
  const config = getFacebookConfig({
    FACEBOOK_APP_ID: '1', FACEBOOK_APP_SECRET: '2', FACEBOOK_API_VERSION: '26.0', FACEBOOK_PAGE_ID: ' page-42 '
  });
  assert.equal(config.apiVersion, 'v26.0');
  assert.equal(config.pageId, 'page-42');
});
