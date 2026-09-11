import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createS3RequestClient } from '../server/media/s3-request.js';

const EMPTY_HASH = createHash('sha256').update('').digest('hex');

function config(overrides = {}) {
  return {
    region: 'us-east-1',
    accessKeyId: 'test-access',
    secretAccessKey: 'test-secret',
    now: () => new Date('2026-09-11T12:34:56.000Z'),
    ...overrides
  };
}

test('signs and forwards S3 requests without exposing credentials in URL or following redirects', async () => {
  const calls = [];
  const client = createS3RequestClient(config({
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return new Response('', { status: 200 });
    }
  }));

  const response = await client.request({
    method: 'GET',
    url: new URL('https://objects.example.com/bucket?list-type=2'),
    payloadHash: EMPTY_HASH
  });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://objects.example.com/bucket?list-type=2');
  assert.match(calls[0].options.headers.authorization, /^AWS4-HMAC-SHA256 Credential=test-access\//);
  assert.equal(calls[0].options.headers['x-amz-content-sha256'], EMPTY_HASH);
  assert.equal(calls[0].options.headers['x-amz-date'], '20260911T123456Z');
  assert.equal(calls[0].options.redirect, 'manual');
  assert.equal(calls[0].url.includes('test-secret'), false);
});

test('maps object-store statuses to sanitized media error codes', async () => {
  const cases = [
    [301, 'MEDIA_STORAGE_ERROR'],
    [302, 'MEDIA_STORAGE_ERROR'],
    [307, 'MEDIA_STORAGE_ERROR'],
    [308, 'MEDIA_STORAGE_ERROR'],
    [404, 'MEDIA_NOT_FOUND'],
    [401, 'MEDIA_STORAGE_AUTH_ERROR'],
    [403, 'MEDIA_STORAGE_AUTH_ERROR'],
    [429, 'MEDIA_STORAGE_UNAVAILABLE'],
    [500, 'MEDIA_STORAGE_UNAVAILABLE'],
    [418, 'MEDIA_STORAGE_ERROR']
  ];
  for (const [status, code] of cases) {
    const client = createS3RequestClient(config({
      fetchImpl: async () => new Response('secret provider response body', { status })
    }));
    await assert.rejects(
      () => client.request({ method: 'GET', url: new URL('https://objects.example.com/bucket/key'), payloadHash: EMPTY_HASH }),
      (error) => error?.code === code && !String(error.message).includes('provider response')
    );
  }
});

test('maps fetch failures to sanitized storage unavailable error', async () => {
  const client = createS3RequestClient(config({
    fetchImpl: async () => { throw new Error('connect ECONNREFUSED secret-host'); }
  }));
  await assert.rejects(
    () => client.request({ method: 'DELETE', url: new URL('https://objects.example.com/bucket/key'), payloadHash: EMPTY_HASH }),
    (error) => error?.code === 'MEDIA_STORAGE_UNAVAILABLE' && error.message === 'MEDIA_STORAGE_UNAVAILABLE'
  );
});
