import test from 'node:test';
import assert from 'node:assert/strict';
import { createMediaStoreFromEnvironment } from '../server/media/create-media-store.js';

test('defaults to local media storage and preserves local URL mapping', () => {
  const store = createMediaStoreFromEnvironment({
    env: {
      MEDIA_UPLOAD_DIR: './tmp/uploads',
      PUBLIC_BASE_URL: 'http://127.0.0.1:3000'
    }
  });
  const key = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg';
  assert.equal(store.keyFromUrl(`https://old-host.example/media/${key}`), key);
});

test('rejects unsupported media storage driver', () => {
  assert.throws(
    () => createMediaStoreFromEnvironment({ env: { MEDIA_STORAGE_DRIVER: 'ftp' } }),
    /MEDIA_STORAGE_DRIVER_UNSUPPORTED/
  );
});

test('S3 selection fails closed when required configuration is missing', () => {
  const base = {
    MEDIA_STORAGE_DRIVER: 's3',
    MEDIA_S3_ENDPOINT: 'https://objects.example.com',
    MEDIA_S3_BUCKET: 'bucket',
    MEDIA_S3_ACCESS_KEY_ID: 'access',
    MEDIA_S3_SECRET_ACCESS_KEY: 'secret',
    MEDIA_PUBLIC_BASE_URL: 'https://cdn.example.com/media'
  };
  for (const name of ['MEDIA_S3_ENDPOINT', 'MEDIA_S3_BUCKET', 'MEDIA_S3_ACCESS_KEY_ID', 'MEDIA_S3_SECRET_ACCESS_KEY', 'MEDIA_PUBLIC_BASE_URL']) {
    const env = { ...base, [name]: '' };
    assert.throws(() => createMediaStoreFromEnvironment({ env }), /MEDIA_S3_CONFIG_REQUIRED/);
  }
});

test('creates S3 media store with configured public URL mapping without making network calls', () => {
  const key = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png';
  const store = createMediaStoreFromEnvironment({
    env: {
      MEDIA_STORAGE_DRIVER: 's3',
      MEDIA_S3_ENDPOINT: 'https://objects.example.com',
      MEDIA_S3_REGION: 'auto',
      MEDIA_S3_BUCKET: 'bucket',
      MEDIA_S3_ACCESS_KEY_ID: 'access',
      MEDIA_S3_SECRET_ACCESS_KEY: 'secret',
      MEDIA_S3_PREFIX: 'uploads/',
      MEDIA_PUBLIC_BASE_URL: 'https://cdn.example.com/assets'
    },
    fetchImpl: async () => { throw new Error('network should not be called during construction'); }
  });
  assert.equal(store.keyFromUrl(`https://old-cdn.example/assets/${key}`), key);
});
