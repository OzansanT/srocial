import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createRequestHandler } from '../server/app.js';
import { createJsonRepository } from '../server/db/json-repository.js';
import { createLocalMediaStore } from '../server/media/local-media-store.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]);

async function withHarness(run, { totalMaxBytes = 1024 } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'srocial-media-library-api-'));
  const repository = createJsonRepository({ filePath: join(directory, 'data.json') });
  await repository.initialize();
  const mediaStore = createLocalMediaStore({
    rootDirectory: join(directory, 'uploads'),
    publicBaseUrl: 'https://media.srocial.test',
    maxBytes: 128,
    totalMaxBytes
  });
  await mediaStore.initialize();
  const server = createServer(createRequestHandler({ repository, mediaStore }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await run({ base: `http://127.0.0.1:${server.address().port}`, repository, mediaStore });
  } finally {
    server.close();
    await once(server, 'close');
    await rm(directory, { recursive: true, force: true });
  }
}

test('GET /api/media returns assets, usage and reference state', async () => {
  await withHarness(async ({ base, repository, mediaStore }) => {
    const upload = await mediaStore.save(Readable.from([JPEG]), { contentType: 'image/jpeg' });
    await repository.createMedia({ postId: 'p1', type: 'image', url: upload.url, sortOrder: 0 });

    const response = await fetch(`${base}/api/media`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.assets.length, 1);
    assert.equal(payload.assets[0].key, upload.key);
    assert.equal(payload.assets[0].referenced, true);
    assert.equal(payload.usage.usedBytes, JPEG.length);
    assert.equal(payload.usage.count, 1);
    assert.equal(JSON.stringify(payload).includes('srocial-media-library-api-'), false);
  });
});

test('DELETE /api/media/:key deletes unreferenced assets', async () => {
  await withHarness(async ({ base, mediaStore }) => {
    const upload = await mediaStore.save(Readable.from([PNG]), { contentType: 'image/png' });
    const response = await fetch(`${base}/api/media/${encodeURIComponent(upload.key)}`, { method: 'DELETE' });
    assert.equal(response.status, 204);
    await assert.rejects(() => mediaStore.open(upload.key), (error) => error?.code === 'MEDIA_NOT_FOUND');
  });
});

test('DELETE /api/media/:key refuses referenced assets even when stored host differs', async () => {
  await withHarness(async ({ base, repository, mediaStore }) => {
    const upload = await mediaStore.save(Readable.from([WEBP]), { contentType: 'image/webp' });
    await repository.createMedia({
      postId: 'p1',
      type: 'image',
      url: `https://old-host.example/media/${encodeURIComponent(upload.key)}`,
      sortOrder: 0
    });

    const response = await fetch(`${base}/api/media/${encodeURIComponent(upload.key)}`, { method: 'DELETE' });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: 'media_in_use' });
    assert.equal((await mediaStore.open(upload.key)).key, upload.key);
  });
});

test('upload quota failures map to HTTP 507', async () => {
  await withHarness(async ({ base }) => {
    const first = await fetch(`${base}/api/media/uploads`, {
      method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: JPEG
    });
    assert.equal(first.status, 201);
    const second = await fetch(`${base}/api/media/uploads`, {
      method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: JPEG
    });
    assert.equal(second.status, 507);
    assert.deepEqual(await second.json(), { error: 'media_storage_quota_exceeded' });
  }, { totalMaxBytes: 4 });
});
