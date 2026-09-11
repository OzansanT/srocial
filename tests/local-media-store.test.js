import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, open, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createLocalMediaStore } from '../server/media/local-media-store.js';

const FIXTURES = Object.freeze({
  'image/jpeg': Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]),
  'image/png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]),
  'image/webp': Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x04, 0x00, 0x00, 0x00]), Buffer.from('WEBP')]),
  'video/mp4': Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x18]), Buffer.from('ftyp'), Buffer.from('isom'), Buffer.alloc(12)])
});

async function withStore(run, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'srocial-media-'));
  try {
    const store = createLocalMediaStore({
      rootDirectory: directory,
      publicBaseUrl: options.publicBaseUrl ?? 'https://srocial.test',
      maxBytes: options.maxBytes ?? 64
    });
    await store.initialize();
    await run(store, directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function collect(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

test('stores JPEG with generated immutable key and HTTPS public URL', async () => {
  await withStore(async (store) => {
    const bytes = FIXTURES['image/jpeg'];
    const upload = await store.save(Readable.from([bytes]), { contentType: 'image/jpeg' });
    assert.match(upload.key, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/i);
    assert.equal(upload.type, 'image');
    assert.equal(upload.contentType, 'image/jpeg');
    assert.equal(upload.size, bytes.length);
    assert.equal(upload.url, `https://srocial.test/media/${upload.key}`);
    assert.equal(upload.isHttps, true);
    assert.equal(store.keyFromUrl(`https://another-host.test/media/${upload.key}`), upload.key);
  });
});

test('maps every supported MIME type to trusted type and extension', async () => {
  await withStore(async (store) => {
    const cases = [
      ['image/jpeg', 'image', '.jpg'],
      ['image/png', 'image', '.png'],
      ['image/webp', 'image', '.webp'],
      ['video/mp4', 'video', '.mp4']
    ];
    for (const [contentType, type, extension] of cases) {
      const upload = await store.save(Readable.from([FIXTURES[contentType]]), { contentType });
      assert.equal(upload.type, type);
      assert.equal(upload.contentType, contentType);
      assert.equal(upload.key.endsWith(extension), true);
    }
  });
});

test('marks local HTTP URLs as non-HTTPS without rejecting storage', async () => {
  await withStore(async (store) => {
    const upload = await store.save(Readable.from([FIXTURES['image/png']]), { contentType: 'image/png' });
    assert.equal(upload.isHttps, false);
    assert.match(upload.url, /^http:\/\/127\.0\.0\.1:3000\/media\//);
  }, { publicBaseUrl: 'http://127.0.0.1:3000/' });
});

test('rejects unsupported MIME types before writing files', async () => {
  await withStore(async (store, directory) => {
    await assert.rejects(
      () => store.save(Readable.from([Buffer.from('<svg/>')]), { contentType: 'image/svg+xml' }),
      (error) => error?.code === 'UNSUPPORTED_MEDIA_TYPE'
    );
    assert.deepEqual(await readdir(directory), []);
  });
});

test('rejects empty media and removes the generated partial file', async () => {
  await withStore(async (store, directory) => {
    await assert.rejects(
      () => store.save(Readable.from([]), { contentType: 'image/jpeg' }),
      (error) => error?.code === 'EMPTY_MEDIA'
    );
    assert.deepEqual(await readdir(directory), []);
  });
});

test('rejects declared MIME/signature mismatch without leaving a partial file', async () => {
  await withStore(async (store, directory) => {
    await assert.rejects(
      () => store.save(Readable.from([FIXTURES['image/png']]), { contentType: 'image/jpeg' }),
      (error) => error?.code === 'MEDIA_SIGNATURE_MISMATCH'
    );
    assert.deepEqual(await readdir(directory), []);
  });
});

test('rejects malformed signature without leaving a partial file', async () => {
  await withStore(async (store, directory) => {
    await assert.rejects(
      () => store.save(Readable.from([Buffer.from('not-a-png')]), { contentType: 'image/png' }),
      (error) => error?.code === 'INVALID_MEDIA_SIGNATURE'
    );
    assert.deepEqual(await readdir(directory), []);
  });
});

test('rejects inherited object keys as MIME types without writing files', async () => {
  await withStore(async (store, directory) => {
    for (const contentType of ['__proto__', 'constructor', 'text/html']) {
      await assert.rejects(
        () => store.save(Readable.from(['data']), { contentType }),
        (error) => error?.code === 'UNSUPPORTED_MEDIA_TYPE'
      );
    }
    assert.deepEqual(await readdir(directory), []);
  });
});

test('rejects oversized media while streaming and removes partial file', async () => {
  await withStore(async (store, directory) => {
    await assert.rejects(
      () => store.save(Readable.from([FIXTURES['video/mp4']]), { contentType: 'video/mp4' }),
      (error) => error?.code === 'MEDIA_TOO_LARGE'
    );
    assert.deepEqual(await readdir(directory), []);
  }, { maxBytes: 8 });
});

test('opens a stored asset using trusted content metadata', async () => {
  await withStore(async (store) => {
    const bytes = FIXTURES['image/webp'];
    const upload = await store.save(Readable.from([bytes]), { contentType: 'image/webp' });
    const opened = await store.open(upload.key);
    assert.equal(opened.key, upload.key);
    assert.equal(opened.contentType, 'image/webp');
    assert.equal(opened.size, bytes.length);
    assert.deepEqual(await collect(opened.stream), bytes);
  });
});

test('persists all bytes even when the filesystem returns short writes', async (t) => {
  await withStore(async (store, directory) => {
    const probe = await open(join(directory, 'probe'), 'w');
    const prototype = Object.getPrototypeOf(probe);
    const write = prototype.write;
    await probe.close();
    t.mock.method(prototype, 'write', function (buffer, offset = 0, length = buffer.length - offset) {
      return write.call(this, buffer, offset, Math.min(length, 2));
    });
    const bytes = FIXTURES['video/mp4'];
    const upload = await store.save(Readable.from([bytes.subarray(0, 5), bytes.subarray(5)]), { contentType: 'video/mp4' });
    const asset = await store.open(upload.key);
    assert.equal(asset.size, bytes.length);
    assert.deepEqual(await collect(asset.stream), bytes);
  });
});

test('rejects traversal-like and missing media keys as not found', async () => {
  await withStore(async (store) => {
    for (const key of ['../secret.jpg', 'not-a-generated-key.jpg', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.svg']) {
      await assert.rejects(() => store.open(key), (error) => error?.code === 'MEDIA_NOT_FOUND');
    }
    await assert.rejects(
      () => store.open('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'),
      (error) => error?.code === 'MEDIA_NOT_FOUND'
    );
  });
});
