import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, get } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import { createRequestHandler } from '../server/app.js';
import { createLocalMediaStore } from '../server/media/local-media-store.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const MP4 = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x08]), Buffer.from('ftyp')]);

async function withHarness(run, { maxBytes = 16 } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'srocial-media-api-'));
  const mediaStore = createLocalMediaStore({
    rootDirectory: directory,
    publicBaseUrl: 'https://media.srocial.test',
    maxBytes
  });
  await mediaStore.initialize();
  const server = createServer(createRequestHandler({ mediaStore }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await run(`http://127.0.0.1:${server.address().port}`, directory);
  } finally {
    server.close();
    await once(server, 'close');
    await rm(directory, { recursive: true, force: true });
  }
}

test('uploads raw media and returns safe generated metadata', async () => {
  await withHarness(async (base) => {
    const response = await fetch(`${base}/api/media/uploads`, {
      method: 'POST',
      headers: { 'content-type': 'image/jpeg', accept: 'application/json' },
      body: JPEG
    });
    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.upload.contentType, 'image/jpeg');
    assert.equal(payload.upload.type, 'image');
    assert.equal(payload.upload.size, JPEG.length);
    assert.equal(payload.upload.isHttps, true);
    assert.match(payload.upload.key, /^[0-9a-f-]+\.jpg$/i);
    assert.equal(payload.upload.url, `https://media.srocial.test/media/${payload.upload.key}`);
    assert.equal(JSON.stringify(payload).includes('srocial-media-api-'), false);
  });
});

test('serves uploaded bytes with trusted immutable headers', async () => {
  await withHarness(async (base) => {
    const uploadResponse = await fetch(`${base}/api/media/uploads`, {
      method: 'POST',
      headers: { 'content-type': 'image/png' },
      body: PNG
    });
    const { upload } = await uploadResponse.json();

    const response = await fetch(`${base}/media/${upload.key}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.equal(response.headers.get('content-length'), String(PNG.length));
    assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), PNG);
  });
});

test('HEAD media response returns headers without a body', async () => {
  await withHarness(async (base) => {
    const uploaded = await (await fetch(`${base}/api/media/uploads`, {
      method: 'POST',
      headers: { 'content-type': 'video/mp4' },
      body: MP4
    })).json();
    const response = await fetch(`${base}/media/${uploaded.upload.key}`, { method: 'HEAD' });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'video/mp4');
    assert.equal(response.headers.get('content-length'), String(MP4.length));
    assert.equal(await response.text(), '');
  });
});

test('rejects unsupported upload MIME type with 415 and writes nothing', async () => {
  await withHarness(async (base, directory) => {
    const response = await fetch(`${base}/api/media/uploads`, {
      method: 'POST',
      headers: { 'content-type': 'image/svg+xml' },
      body: Buffer.from('<svg/>')
    });
    assert.equal(response.status, 415);
    assert.deepEqual(await response.json(), { error: 'unsupported_media_type' });
    assert.deepEqual(await readdir(directory), []);
  });
});

test('rejects empty upload with 400 and writes nothing', async () => {
  await withHarness(async (base, directory) => {
    const response = await fetch(`${base}/api/media/uploads`, {
      method: 'POST',
      headers: { 'content-type': 'image/webp' },
      body: Buffer.alloc(0)
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'empty_media' });
    assert.deepEqual(await readdir(directory), []);
  });
});

test('rejects oversized upload with 413 and removes partial file', async () => {
  await withHarness(async (base, directory) => {
    const oversized = Buffer.concat([MP4, Buffer.from([0x00])]);
    const response = await fetch(`${base}/api/media/uploads`, {
      method: 'POST',
      headers: { 'content-type': 'video/mp4' },
      body: oversized
    });
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { error: 'media_too_large' });
    assert.deepEqual(await readdir(directory), []);
  }, { maxBytes: 8 });
});

test('missing and traversal-like media paths return 404', async () => {
  await withHarness(async (base) => {
    const missing = await fetch(`${base}/media/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg`);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: 'not_found' });

    const traversal = await fetch(`${base}/media/%2e%2e%2fsecret.jpg`);
    assert.equal(traversal.status, 404);
    assert.deepEqual(await traversal.json(), { error: 'not_found' });
  });
});

test('closes the stored file stream when a media download is aborted', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'srocial-media-abort-'));
  const store = createLocalMediaStore({ rootDirectory: directory, publicBaseUrl: 'https://media.srocial.test' });
  await store.initialize();
  const largeMp4 = Buffer.alloc(10 * 1024 * 1024);
  MP4.copy(largeMp4, 0);
  const upload = await store.save(Readable.from([largeMp4]), { contentType: 'video/mp4' });
  let source;
  const mediaStore = {
    async open(key) {
      const asset = await store.open(key);
      source = asset.stream;
      return asset;
    }
  };
  const handler = createRequestHandler({ mediaStore });
  let responseClosed;
  const closed = new Promise((resolve) => { responseClosed = resolve; });
  const server = createServer((request, response) => {
    response.on('close', responseClosed);
    return handler(request, response);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await new Promise((resolve, reject) => {
      get(`http://127.0.0.1:${server.address().port}/media/${upload.key}`, (response) => {
        response.once('data', () => { response.destroy(); resolve(); });
        response.on('error', reject);
      }).on('error', reject);
    });
    await closed;
    assert.equal(source.destroyed, true, 'aborted downloads must release their source stream');
    if (!source.closed) await once(source, 'close');
    assert.equal(source.fd, null);
  } finally {
    source?.destroy();
    server.close();
    await once(server, 'close');
    await rm(directory, { recursive: true, force: true });
  }
});
