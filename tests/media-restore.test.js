import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createLocalMediaStore } from '../server/media/local-media-store.js';
import { createS3MediaStore } from '../server/media/s3-media-store.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_KEY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg';

async function collect(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

test('local media restore preserves the exact backup key and validates bytes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'srocial-media-restore-'));
  try {
    const store = createLocalMediaStore({
      rootDirectory: directory,
      publicBaseUrl: 'https://srocial.test',
      maxBytes: 1024,
      totalMaxBytes: 2048
    });
    await store.initialize();

    const restored = await store.restore(JPEG_KEY, Readable.from([JPEG]), { contentType: 'image/jpeg' });
    assert.equal(restored.key, JPEG_KEY);
    assert.equal(restored.url, `https://srocial.test/media/${JPEG_KEY}`);
    assert.equal(restored.size, JPEG.length);

    const opened = await store.open(JPEG_KEY);
    assert.deepEqual(await collect(opened.stream), JPEG);

    await assert.rejects(
      () => store.restore('../escape.jpg', Readable.from([JPEG]), { contentType: 'image/jpeg' }),
      (error) => error?.code === 'MEDIA_NOT_FOUND'
    );
    await assert.rejects(
      () => store.restore('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg', Readable.from([PNG]), { contentType: 'image/jpeg' }),
      (error) => error?.code === 'MEDIA_SIGNATURE_MISMATCH'
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('local media restore refuses an existing exact key instead of silently overwriting it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'srocial-media-restore-'));
  try {
    const store = createLocalMediaStore({
      rootDirectory: directory,
      publicBaseUrl: 'https://srocial.test',
      maxBytes: 1024,
      totalMaxBytes: 2048
    });
    await store.initialize();
    await store.restore(JPEG_KEY, Readable.from([JPEG]), { contentType: 'image/jpeg' });
    await assert.rejects(
      () => store.restore(JPEG_KEY, Readable.from([JPEG]), { contentType: 'image/jpeg' }),
      (error) => error?.code === 'MEDIA_ALREADY_EXISTS'
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('S3 media restore PUTs to the supplied exact object key after validation', async () => {
  const calls = [];
  const requestClient = {
    async request({ method, url, headers, body }) {
      const target = new URL(url);
      calls.push({ method, url: target.toString(), headers: { ...headers }, body });
      if (method === 'GET' && target.searchParams.get('list-type') === '2') {
        return new Response('<?xml version="1.0"?><ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>', { status: 200 });
      }
      if (method === 'PUT') return new Response('', { status: 200 });
      throw new Error(`unexpected ${method}`);
    }
  };
  const store = createS3MediaStore({
    endpoint: 'https://objects.example.com',
    bucket: 'srocial-bucket',
    prefix: 'media/',
    publicBaseUrl: 'https://cdn.example.com/media',
    maxBytes: 1024,
    totalMaxBytes: 2048,
    requestClient
  });

  const restored = await store.restore(JPEG_KEY, Readable.from([JPEG]), { contentType: 'image/jpeg' });
  assert.equal(restored.key, JPEG_KEY);
  assert.equal(restored.url, `https://cdn.example.com/media/${JPEG_KEY}`);
  const put = calls.find((call) => call.method === 'PUT');
  assert.equal(new URL(put.url).pathname, `/srocial-bucket/media/${JPEG_KEY}`);
  assert.equal(put.headers['content-type'], 'image/jpeg');
  assert.equal(put.headers['content-length'], String(JPEG.length));
  assert.deepEqual(Buffer.from(put.body), JPEG);
});

test('S3 media restore rejects invalid key/signature before PUT', async () => {
  const calls = [];
  const requestClient = {
    async request({ method, url }) {
      const target = new URL(url);
      calls.push({ method, url: target.toString() });
      if (method === 'GET' && target.searchParams.get('list-type') === '2') {
        return new Response('<?xml version="1.0"?><ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>', { status: 200 });
      }
      throw new Error(`unexpected ${method}`);
    }
  };
  const store = createS3MediaStore({
    endpoint: 'https://objects.example.com',
    bucket: 'srocial-bucket',
    prefix: 'media/',
    publicBaseUrl: 'https://cdn.example.com/media',
    maxBytes: 1024,
    totalMaxBytes: 2048,
    requestClient
  });

  await assert.rejects(
    () => store.restore('../escape.jpg', Readable.from([JPEG]), { contentType: 'image/jpeg' }),
    (error) => error?.code === 'MEDIA_NOT_FOUND'
  );
  await assert.rejects(
    () => store.restore(JPEG_KEY, Readable.from([PNG]), { contentType: 'image/jpeg' }),
    (error) => error?.code === 'MEDIA_SIGNATURE_MISMATCH'
  );
  assert.equal(calls.some((call) => call.method === 'PUT'), false);
});
