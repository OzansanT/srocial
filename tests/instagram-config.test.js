import test from 'node:test';
import assert from 'node:assert/strict';
import { getInstagramConfig, INSTAGRAM_SCOPES } from '../server/platforms/instagram/config.js';

test('Instagram config is absent until both app credentials exist', () => {
  assert.equal(getInstagramConfig({}), null);
  assert.equal(getInstagramConfig({ INSTAGRAM_APP_ID: 'id' }), null);
  assert.equal(getInstagramConfig({ INSTAGRAM_APP_SECRET: 'secret' }), null);
});

test('Instagram config defaults to Graph API v26.0 and current publishing scopes', () => {
  const config = getInstagramConfig({ INSTAGRAM_APP_ID: '123', INSTAGRAM_APP_SECRET: 'secret' });
  assert.equal(config.appId, '123');
  assert.equal(config.appSecret, 'secret');
  assert.equal(config.apiVersion, 'v26.0');
  assert.deepEqual(config.scopes, ['instagram_business_basic', 'instagram_business_content_publish']);
  assert.deepEqual(INSTAGRAM_SCOPES, ['instagram_business_basic', 'instagram_business_content_publish']);
});

test('Instagram config normalizes explicit API version', () => {
  assert.equal(getInstagramConfig({ INSTAGRAM_APP_ID: '1', INSTAGRAM_APP_SECRET: '2', INSTAGRAM_API_VERSION: '26.0' }).apiVersion, 'v26.0');
  assert.equal(getInstagramConfig({ INSTAGRAM_APP_ID: '1', INSTAGRAM_APP_SECRET: '2', INSTAGRAM_API_VERSION: 'v25.0' }).apiVersion, 'v25.0');
});
