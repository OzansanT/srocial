import test from 'node:test';
import assert from 'node:assert/strict';
import { createInstagramClient, InstagramProviderError } from '../server/platforms/instagram/client.js';

function response(status, payload) { return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } }); }

test('formPost sends urlencoded fields and returns JSON', async () => {
  const calls = [];
  const client = createInstagramClient({ apiVersion: 'v26.0', fetchImpl: async (url, options) => { calls.push({ url, options }); return response(200, { access_token: 'short-token', user_id: '123' }); } });
  const result = await client.formPost('https://api.instagram.com/oauth/access_token', { client_id: 'id', client_secret: 'secret', code: 'abc' });
  assert.equal(result.user_id, '123');
  assert.equal(calls[0].options.method, 'POST');
  assert.match(calls[0].options.headers['content-type'], /application\/x-www-form-urlencoded/);
  const body = new URLSearchParams(calls[0].options.body);
  assert.equal(body.get('client_id'), 'id'); assert.equal(body.get('client_secret'), 'secret');
});

test('getGraph uses versioned graph host and bearer token', async () => {
  const calls = [];
  const client = createInstagramClient({ apiVersion: 'v26.0', fetchImpl: async (url, options) => { calls.push({ url, options }); return response(200, { id: '1' }); } });
  await client.getGraph('/me', { query: { fields: 'id,username' }, accessToken: 'access-secret' });
  const url = new URL(calls[0].url);
  assert.equal(url.origin, 'https://graph.instagram.com'); assert.equal(url.pathname, '/v26.0/me'); assert.equal(url.searchParams.get('fields'), 'id,username');
  assert.equal(calls[0].options.headers.authorization, 'Bearer access-secret'); assert.equal(url.searchParams.has('access_token'), false);
});

test('postGraph sends urlencoded body to versioned graph endpoint', async () => {
  const calls = [];
  const client = createInstagramClient({ apiVersion: 'v26.0', fetchImpl: async (url, options) => { calls.push({ url, options }); return response(200, { id: 'container-1' }); } });
  await client.postGraph('/123/media', { body: { image_url: 'https://cdn.example/x.jpg', caption: 'Hi' }, accessToken: 'token' });
  assert.equal(new URL(calls[0].url).pathname, '/v26.0/123/media'); assert.equal(calls[0].options.method, 'POST');
  const body = new URLSearchParams(calls[0].options.body); assert.equal(body.get('image_url'), 'https://cdn.example/x.jpg'); assert.equal(body.get('caption'), 'Hi');
});

test('maps auth, permission and rate limit errors without leaking provider secrets', async () => {
  const cases = [[401,{error:{code:190,message:'bad token SECRET-TOKEN'}},'AUTH_ERROR',false],[403,{error:{code:10,message:'permission secret'}},'PERMISSION_DENIED',false],[429,{error:{code:4,message:'rate limit'}},'RATE_LIMIT',true]];
  for (const [status,payload,expectedCode,retryable] of cases) {
    const client = createInstagramClient({ fetchImpl: async () => response(status, payload) });
    await assert.rejects(() => client.getGraph('/me', { accessToken: 'SECRET-TOKEN' }), (error) => {
      assert.ok(error instanceof InstagramProviderError); assert.equal(error.code, expectedCode); assert.equal(error.retryable, retryable); assert.equal(error.status, status);
      assert.doesNotMatch(error.message, /SECRET-TOKEN|permission secret|bad token/i); assert.equal(error.providerCode, payload.error.code); return true;
    });
  }
});

test('maps fetch failures to retryable NETWORK_ERROR', async () => {
  const client = createInstagramClient({ fetchImpl: async () => { throw new Error('socket exploded https://secret.example/?access_token=abc'); } });
  await assert.rejects(() => client.getGraph('/me', { accessToken: 'abc' }), (error) => { assert.equal(error.code, 'NETWORK_ERROR'); assert.equal(error.retryable, true); assert.doesNotMatch(error.message, /abc|secret\.example/); return true; });
});
