import test from 'node:test';
import assert from 'node:assert/strict';
import { createInstagramPublishingAdapter } from '../server/platforms/instagram/publish.js';

function createWorkflowFixture() {
  const calls = [];
  const statusQueues = new Map([
    ['child-video', ['IN_PROGRESS', 'FINISHED']],
    ['parent-1', ['IN_PROGRESS', 'FINISHED']]
  ]);
  let childIndex = 0;

  const client = {
    async postGraph(path, options) {
      calls.push({ method: 'post', path, options: structuredClone(options) });
      if (path.endsWith('/media_publish')) return { id: 'media-final' };
      if (options.body?.media_type === 'CAROUSEL') return { id: 'parent-1' };
      childIndex += 1;
      return { id: childIndex === 1 ? 'child-image' : 'child-video' };
    },
    async getGraph(path, options) {
      calls.push({ method: 'get', path, options: structuredClone(options) });
      const id = String(path).replace(/^\//, '');
      const queue = statusQueues.get(id) ?? ['FINISHED'];
      const status_code = queue.shift() ?? 'FINISHED';
      return { id, status_code };
    }
  };

  return {
    calls,
    client,
    resolveCredentials: async (accountId) => ({
      accountId,
      providerAccountId: 'ig-1789',
      accessToken: 'secret-token'
    }),
    getMedia: async () => [
      { type: 'image', url: 'https://cdn.example/one.jpg' },
      { type: 'video', url: 'https://cdn.example/two.mp4' }
    ]
  };
}

function carouselState(result) {
  return result.providerOptions?.instagramCarousel;
}

test('mixed Instagram carousel creates ordered children and pauses while a video child processes', async () => {
  const fixture = createWorkflowFixture();
  const adapter = createInstagramPublishingAdapter(fixture);
  const result = await adapter.publish({
    post: { id: 'post-1', caption: ' Mixed carousel ' },
    publication: { id: 'pub-1', accountId: 'acct-1', providerOptions: {} }
  });

  assert.equal(result.status, 'PROCESSING');
  assert.equal(result.externalId, null);
  assert.deepEqual(carouselState(result), {
    stage: 'children',
    caption: 'Mixed carousel',
    children: [
      { id: 'child-image', type: 'image' },
      { id: 'child-video', type: 'video' }
    ]
  });

  assert.deepEqual(fixture.calls[0].options.body, {
    image_url: 'https://cdn.example/one.jpg',
    is_carousel_item: true
  });
  assert.deepEqual(fixture.calls[1].options.body, {
    video_url: 'https://cdn.example/two.mp4',
    media_type: 'VIDEO',
    is_carousel_item: true
  });
  assert.equal(fixture.calls[2].path, '/child-video');
  assert.equal(fixture.calls.some((call) => call.options?.body?.media_type === 'CAROUSEL'), false);
});

test('carousel status resume creates ordered parent after video children finish, then publishes when parent finishes', async () => {
  const fixture = createWorkflowFixture();
  const adapter = createInstagramPublishingAdapter(fixture);
  const initial = await adapter.publish({
    post: { id: 'post-1', caption: 'Mixed carousel' },
    publication: { id: 'pub-1', accountId: 'acct-1', providerOptions: {} }
  });

  const parentPending = await adapter.getStatus({ publication: {
    id: 'pub-1',
    accountId: 'acct-1',
    externalId: null,
    providerOptions: initial.providerOptions
  } });

  assert.equal(parentPending.status, 'PROCESSING');
  assert.equal(parentPending.externalId, 'parent-1');
  assert.deepEqual(carouselState(parentPending), {
    stage: 'parent',
    caption: 'Mixed carousel',
    parentId: 'parent-1',
    children: [
      { id: 'child-image', type: 'image' },
      { id: 'child-video', type: 'video' }
    ]
  });

  const parentCreate = fixture.calls.find((call) => call.method === 'post' && call.options?.body?.media_type === 'CAROUSEL');
  assert.ok(parentCreate);
  assert.deepEqual(parentCreate.options.body, {
    media_type: 'CAROUSEL',
    children: 'child-image,child-video',
    caption: 'Mixed carousel'
  });

  const published = await adapter.getStatus({ publication: {
    id: 'pub-1',
    accountId: 'acct-1',
    externalId: parentPending.externalId,
    providerOptions: parentPending.providerOptions
  } });

  assert.equal(published.status, 'PUBLISHED');
  assert.equal(published.externalId, 'media-final');
  assert.equal(published.providerOptions?.instagramCarousel, undefined);
  const publishCall = fixture.calls.at(-1);
  assert.equal(publishCall.path, '/ig-1789/media_publish');
  assert.deepEqual(publishCall.options.body, { creation_id: 'parent-1' });
});

test('carousel child or parent provider error maps to safe media failure', async () => {
  const fixture = createWorkflowFixture();
  fixture.client.getGraph = async (path, options) => {
    fixture.calls.push({ method: 'get', path, options: structuredClone(options) });
    return { status_code: 'ERROR', status: 'provider details' };
  };
  const adapter = createInstagramPublishingAdapter(fixture);
  const result = await adapter.publish({
    post: { id: 'post-1', caption: 'Broken carousel' },
    publication: { id: 'pub-1', accountId: 'acct-1', providerOptions: {} }
  });
  assert.deepEqual(result, { status: 'FAILED', externalId: 'child-video', errorCode: 'MEDIA_ERROR' });
});
