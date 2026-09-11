import test from 'node:test';
import assert from 'node:assert/strict';
import { THREADS_SCOPES, getThreadsConfig } from '../server/platforms/threads/config.js';

test('Threads config is absent until both app credentials exist', () => {
  assert.equal(getThreadsConfig({}), null);
  assert.equal(getThreadsConfig({ THREADS_APP_ID: 'id' }), null);
  assert.equal(getThreadsConfig({ THREADS_APP_SECRET: 'secret' }), null);
});

test('Threads config defaults to v1.0 and current publishing scopes', () => {
  const config = getThreadsConfig({ THREADS_APP_ID: '123', THREADS_APP_SECRET: 'secret' });
  assert.deepEqual(config, {
    appId: '123', appSecret: 'secret', apiVersion: 'v1.0', scopes: ['threads_basic', 'threads_content_publish']
  });
  assert.deepEqual(THREADS_SCOPES, ['threads_basic', 'threads_content_publish']);
});

test('Threads config normalizes explicit API version', () => {
  assert.equal(getThreadsConfig({ THREADS_APP_ID:'1', THREADS_APP_SECRET:'2', THREADS_API_VERSION:'1.0' }).apiVersion, 'v1.0');
  assert.equal(getThreadsConfig({ THREADS_APP_ID:'1', THREADS_APP_SECRET:'2', THREADS_API_VERSION:'v1.0' }).apiVersion, 'v1.0');
});
