import test from 'node:test';
import assert from 'node:assert/strict';
import { createFacebookPublishingAdapter } from '../server/platforms/facebook/publish.js';

function fixture({ media = [] } = {}) {
  const calls = [];
  const client = {
    async postGraph(path, options) {
      calls.push({ method: 'post', path, options });
      if (path.endsWith('/feed')) return { id: 'page-1_100' };
      if (path.endsWith('/photos')) return { id: 'photo-1', post_id: 'page-1_200' };
      if (path.endsWith('/video_reels') && options.body.upload_phase === 'start') return { video_id: 'video-1', upload_url: 'https://rupload.facebook.com/video-upload/v26.0/video-1' };
      if (path.endsWith('/video_reels') && options.body.upload_phase === 'finish') return { success: true };
      throw new Error(`unexpected post ${path}`);
    },
    async postHostedVideo(url, options) { calls.push({ method: 'upload', url, options }); return { success: true }; },
    async getGraph(path, options) { calls.push({ method: 'get', path, options }); return { id: 'video-1', status: { video_status: 'processing', publishing_phase: { status: 'not_started' } } }; }
  };
  return {
    calls, client,
    resolveCredentials: async (accountId) => ({ accountId, providerAccountId: 'page-1', accessToken: 'page-token' }),
    getMedia: async () => media
  };
}

test('Facebook requires an account before provider or media calls', async () => {
  let credentials = 0; let media = 0;
  const adapter = createFacebookPublishingAdapter({
    client: {}, resolveCredentials: async () => { credentials += 1; }, getMedia: async () => { media += 1; return []; }
  });
  await assert.rejects(() => adapter.publish({ post: { id: 'p1', caption: 'x' }, publication: { id: 'pub1' } }), (error) => error.code === 'ACCOUNT_REQUIRED' && error.retryable === false);
  assert.equal(credentials, 0); assert.equal(media, 0);
});

test('Facebook publishes text posts to Page feed', async () => {
  const f = fixture();
  const result = await createFacebookPublishingAdapter(f).publish({ post: { id: 'p1', caption: ' Hello ' }, publication: { accountId: 'acct1' } });
  assert.deepEqual(result, { status: 'PUBLISHED', externalId: 'page-1_100' });
  assert.deepEqual(f.calls[0], { method: 'post', path: '/page-1/feed', options: { accessToken: 'page-token', body: { message: 'Hello' } } });
});

test('Facebook publishes one image with public URL', async () => {
  const f = fixture({ media: [{ type: 'image', url: 'https://cdn.example/post.jpg' }] });
  const result = await createFacebookPublishingAdapter(f).publish({ post: { id: 'p1', caption: 'Photo' }, publication: { accountId: 'acct1' } });
  assert.deepEqual(result, { status: 'PUBLISHED', externalId: 'page-1_200', mediaId: 'photo-1' });
  assert.equal(f.calls[0].path, '/page-1/photos');
  assert.deepEqual(f.calls[0].options.body, { url: 'https://cdn.example/post.jpg', caption: 'Photo', published: true });
});

test('Facebook starts, uploads and finishes a hosted Reel then returns PROCESSING', async () => {
  const f = fixture({ media: [{ type: 'video', url: 'https://cdn.example/reel.mp4' }] });
  const result = await createFacebookPublishingAdapter(f).publish({ post: { id: 'p1', caption: 'Reel' }, publication: { accountId: 'acct1' } });
  assert.deepEqual(result, { status: 'PROCESSING', externalId: 'video-1' });
  assert.equal(f.calls[0].path, '/page-1/video_reels');
  assert.deepEqual(f.calls[0].options.body, { upload_phase: 'start' });
  assert.equal(f.calls[1].method, 'upload');
  assert.equal(f.calls[1].options.fileUrl, 'https://cdn.example/reel.mp4');
  assert.deepEqual(f.calls[2].options.body, { upload_phase: 'finish', video_id: 'video-1', video_state: 'PUBLISHED', description: 'Reel' });
});

test('Facebook Reel status maps published, processing and failed states', async () => {
  const f = fixture(); const adapter = createFacebookPublishingAdapter(f);
  f.client.getGraph = async () => ({ id: 'video-1', status: { video_status: 'published', publishing_phase: { status: 'complete' } } });
  assert.deepEqual(await adapter.getStatus({ publication: { accountId: 'acct1', externalId: 'video-1' } }), { status: 'PUBLISHED', externalId: 'video-1' });
  f.client.getGraph = async () => ({ id: 'video-1', status: { video_status: 'processing', publishing_phase: { status: 'in_progress' } } });
  assert.deepEqual(await adapter.getStatus({ publication: { accountId: 'acct1', externalId: 'video-1' } }), { status: 'PROCESSING', externalId: 'video-1' });
  f.client.getGraph = async () => ({ id: 'video-1', status: { video_status: 'error', publishing_phase: { status: 'error' } } });
  assert.deepEqual(await adapter.getStatus({ publication: { accountId: 'acct1', externalId: 'video-1' } }), { status: 'FAILED', externalId: 'video-1', errorCode: 'MEDIA_ERROR' });
});

test('Facebook rejects multiple or non-HTTPS media before provider HTTP', async () => {
  for (const media of [
    [{ type: 'image', url: 'http://private.example/a.jpg' }],
    [{ type: 'image', url: 'https://cdn.example/a.jpg' }, { type: 'image', url: 'https://cdn.example/b.jpg' }]
  ]) {
    const f = fixture({ media });
    await assert.rejects(() => createFacebookPublishingAdapter(f).publish({ post: { id: 'p1', caption: 'x' }, publication: { accountId: 'acct1' } }), (error) => error.code === 'INVALID_MEDIA');
    assert.equal(f.calls.length, 0);
  }
});
