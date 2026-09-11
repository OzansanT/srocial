import test from 'node:test';
import assert from 'node:assert/strict';
import { createFacebookClient, FacebookProviderError } from '../server/platforms/facebook/client.js';

test('Facebook client sends bearer Graph requests and form posts', async () => {
  const calls = [];
  const client = createFacebookClient({ apiVersion: 'v26.0', fetchImpl: async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ id: 'ok' }), { status: 200, headers: { 'content-type': 'application/json' } });
  } });
  await client.getGraph('/me', { accessToken: 'page-token', query: { fields: 'id,name' } });
  await client.postGraph('/page-1/feed', { accessToken: 'page-token', body: { message: 'Hello world' } });
  assert.equal(new URL(calls[0].url).pathname, '/v26.0/me');
  assert.equal(new URL(calls[0].url).searchParams.get('fields'), 'id,name');
  assert.equal(calls[0].init.headers.authorization, 'Bearer page-token');
  assert.equal(calls[1].init.method, 'POST');
  assert.match(calls[1].init.body, /message=Hello\+world/);
});

test('Facebook hosted Reel upload uses Meta upload URL without rewriting it', async () => {
  const calls = [];
  const client = createFacebookClient({ fetchImpl: async (url, init) => {
    calls.push({ url, init });
    return new Response('{"success":true}', { status: 200, headers: { 'content-type': 'application/json' } });
  } });
  await client.postHostedVideo('https://rupload.facebook.com/video-upload/v26.0/123', {
    accessToken: 'page-token', fileUrl: 'https://cdn.example/reel.mp4'
  });
  assert.equal(calls[0].url, 'https://rupload.facebook.com/video-upload/v26.0/123');
  assert.equal(calls[0].init.headers.authorization, 'OAuth page-token');
  assert.equal(calls[0].init.headers.file_url, 'https://cdn.example/reel.mp4');
});

test('Facebook client normalizes auth, permission, rate limit and transport failures', async () => {
  const fixtures = [
    [401, { error: { code: 190, message: 'token secret' } }, 'AUTH_ERROR', false],
    [403, { error: { code: 200 } }, 'PERMISSION_DENIED', false],
    [429, { error: { code: 4 } }, 'RATE_LIMIT', true],
    [500, { error: { code: 1 } }, 'PROVIDER_ERROR', true]
  ];
  for (const [status, body, code, retryable] of fixtures) {
    const client = createFacebookClient({ fetchImpl: async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }) });
    await assert.rejects(() => client.getGraph('/me'), (error) => {
      assert.equal(error instanceof FacebookProviderError, true);
      assert.equal(error.code, code); assert.equal(error.retryable, retryable);
      assert.equal(String(error.message).includes('token secret'), false);
      return true;
    });
  }
  const networkClient = createFacebookClient({ fetchImpl: async () => { throw new Error('socket secret'); } });
  await assert.rejects(() => networkClient.getGraph('/me'), (error) => error.code === 'NETWORK_ERROR' && error.retryable === true && !String(error.message).includes('socket secret'));
});
