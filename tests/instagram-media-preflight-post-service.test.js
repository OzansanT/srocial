import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createScheduledPost } from '../server/services/post-service.js';

const now = new Date('2026-09-16T12:00:00.000Z');
const scheduledAt = '2026-09-17T12:00:00.000Z';

function png(width, height) {
  const bytes = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function box(type, payload) {
  const result = Buffer.alloc(8 + payload.length);
  result.writeUInt32BE(result.length, 0);
  result.write(type, 4, 'ascii');
  payload.copy(result, 8);
  return result;
}

function mp4(durationSeconds, timescale = 1000) {
  const mvhd = Buffer.alloc(20);
  mvhd.writeUInt32BE(timescale, 12);
  mvhd.writeUInt32BE(Math.round(durationSeconds * timescale), 16);
  return Buffer.concat([box('ftyp', Buffer.from('isom0000', 'ascii')), box('moov', box('mvhd', mvhd))]);
}

function repositoryFor(accounts) {
  const records = { accounts, graphCalls: [] };
  return {
    records,
    async getAccount(id) {
      return accounts.find((item) => item.id === id) ?? null;
    },
    async createSocialScheduleGraph(graph) {
      records.graphCalls.push(graph);
      return { post: graph.post, media: graph.media, publications: graph.publicationPlans.map((plan) => plan.publication) };
    }
  };
}

function mediaStoreFor(entries) {
  const opens = new Map();
  return {
    opens,
    keyFromUrl(url) {
      try {
        const pathname = new URL(url).pathname;
        const key = pathname.startsWith('/media/') ? decodeURIComponent(pathname.slice('/media/'.length)) : null;
        return key && entries[key] ? key : null;
      } catch {
        return null;
      }
    },
    async open(key) {
      const entry = entries[key];
      if (!entry) throw new Error('missing');
      opens.set(key, (opens.get(key) ?? 0) + 1);
      return {
        key,
        contentType: entry.contentType,
        size: entry.size ?? entry.bytes.length,
        stream: Readable.from([entry.bytes])
      };
    }
  };
}

function instagramAccount(id = 'ig-1') {
  return { id, provider: 'instagram', state: 'CONNECTED' };
}

function input(accountId, media, extraDestination = {}) {
  return {
    caption: 'Instagram preflight',
    destinations: [{ platform: 'instagram', accountId, ...extraDestination }],
    media,
    scheduledAt
  };
}

async function expectValidation(repository, mediaStore, payload, code) {
  await assert.rejects(
    () => createScheduledPost(repository, payload, { now, mediaStore }),
    (error) => {
      assert.equal(error.code, 'VALIDATION_ERROR');
      assert.ok(error.details.some((item) => item.code === code), `missing validation code ${code}`);
      return true;
    }
  );
  assert.equal(repository.records.graphCalls.length, 0);
}

test('valid managed Instagram image is inspected before persistence and stores trusted metadata', async () => {
  const account = instagramAccount();
  const repository = repositoryFor([account]);
  const mediaStore = mediaStoreFor({
    'square.png': { contentType: 'image/png', bytes: png(1000, 1000) }
  });
  const result = await createScheduledPost(repository, input(account.id, [
    { type: 'image', url: 'https://cdn.example.test/media/square.png', metadata: { width: 1, height: 1000 } }
  ]), { now, mediaStore });

  assert.equal(repository.records.graphCalls.length, 1);
  assert.deepEqual(result.media[0].metadata, {
    contentType: 'image/png',
    sizeBytes: 24,
    width: 1000,
    height: 1000
  });
  assert.equal(mediaStore.opens.get('square.png'), 1);
});

test('Instagram image aspect ratio is rejected before repository mutation', async () => {
  const account = instagramAccount();
  const repository = repositoryFor([account]);
  const mediaStore = mediaStoreFor({
    'portrait.png': { contentType: 'image/png', bytes: png(700, 1000) }
  });
  await expectValidation(repository, mediaStore, input(account.id, [
    { type: 'image', url: 'https://cdn.test/media/portrait.png' }
  ]), 'INSTAGRAM_IMAGE_ASPECT_RATIO_UNSUPPORTED');
});

test('Instagram video duration is rejected before repository mutation', async () => {
  const account = instagramAccount();
  const repository = repositoryFor([account]);
  const mediaStore = mediaStoreFor({
    'short.mp4': { contentType: 'video/mp4', bytes: mp4(2) }
  });
  await expectValidation(repository, mediaStore, input(account.id, [
    { type: 'video', url: 'https://cdn.test/media/short.mp4' }
  ]), 'INSTAGRAM_VIDEO_DURATION_UNSUPPORTED');
});

test('Instagram file-size ceiling short-circuits before reading oversized media', async () => {
  const account = instagramAccount();
  const repository = repositoryFor([account]);
  const mediaStore = mediaStoreFor({
    'large.png': { contentType: 'image/png', bytes: png(1000, 1000), size: (8 * 1024 * 1024) + 1 }
  });
  await expectValidation(repository, mediaStore, input(account.id, [
    { type: 'image', url: 'https://cdn.test/media/large.png' }
  ]), 'INSTAGRAM_MEDIA_FILE_TOO_LARGE');
});

test('production Instagram preflight fails closed for unmanaged HTTPS media', async () => {
  const account = instagramAccount();
  const repository = repositoryFor([account]);
  const mediaStore = mediaStoreFor({});
  await expectValidation(repository, mediaStore, input(account.id, [
    { type: 'image', url: 'https://external.example.test/image.png' }
  ]), 'INSTAGRAM_MEDIA_METADATA_REQUIRED');
});

test('Instagram destination media override is validated as the effective media set', async () => {
  const account = instagramAccount();
  const repository = repositoryFor([account]);
  const mediaStore = mediaStoreFor({
    'base.png': { contentType: 'image/png', bytes: png(1000, 1000) },
    'bad.png': { contentType: 'image/png', bytes: png(300, 1000) }
  });
  await expectValidation(repository, mediaStore, input(account.id, [
    { type: 'image', url: 'https://cdn.test/media/base.png' }
  ], {
    mediaOverride: [{ type: 'image', url: 'https://cdn.test/media/bad.png' }]
  }), 'INSTAGRAM_IMAGE_ASPECT_RATIO_UNSUPPORTED');
});

test('non-Instagram providers are not forced through Instagram managed-media inspection', async () => {
  const facebook = { id: 'fb-1', provider: 'facebook', state: 'CONNECTED' };
  const repository = repositoryFor([facebook]);
  const mediaStore = mediaStoreFor({});
  const result = await createScheduledPost(repository, {
    caption: 'Facebook unchanged',
    destinations: [{ platform: 'facebook', accountId: facebook.id }],
    media: [{ type: 'image', url: 'https://external.example.test/image.jpg' }],
    scheduledAt
  }, { now, mediaStore });
  assert.equal(result.publications[0].platform, 'facebook');
  assert.equal(repository.records.graphCalls.length, 1);
});
