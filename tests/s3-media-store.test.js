import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createS3MediaStore } from '../server/media/s3-media-store.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function listXml({ contents = [], truncated = false, nextToken = null } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult>
${contents.map((item) => `<Contents><Key>${item.key}</Key><LastModified>${item.modifiedAt}</LastModified><Size>${item.size}</Size></Contents>`).join('')}
<IsTruncated>${truncated ? 'true' : 'false'}</IsTruncated>
${nextToken ? `<NextContinuationToken>${nextToken}</NextContinuationToken>` : ''}
</ListBucketResult>`;
}

function createFakeRequestClient({ pages = [listXml()], objects = new Map() } = {}) {
  const calls = [];
  let pageIndex = 0;
  return {
    calls,
    client: {
      async request({ method, url, headers, body }) {
        const target = new URL(url);
        calls.push({ method, url: target.toString(), headers: { ...headers }, body });
        if (method === 'GET' && target.searchParams.get('list-type') === '2') {
          const xml = pages[Math.min(pageIndex, pages.length - 1)];
          pageIndex += 1;
          return new Response(xml, { status: 200, headers: { 'content-type': 'application/xml' } });
        }
        const key = decodeURIComponent(target.pathname.split('/').slice(2).join('/'));
        if (method === 'PUT') {
          const bytes = Buffer.from(body);
          objects.set(key, bytes);
          return new Response('', { status: 200 });
        }
        if (method === 'GET') {
          const bytes = objects.get(key);
          if (!bytes) throw Object.assign(new Error('MEDIA_NOT_FOUND'), { code: 'MEDIA_NOT_FOUND' });
          return new Response(bytes, { status: 200, headers: { 'content-length': String(bytes.length) } });
        }
        if (method === 'DELETE') {
          objects.delete(key);
          return new Response('', { status: 204 });
        }
        throw new Error(`unexpected request ${method} ${target}`);
      }
    }
  };
}

function createStore(requestClient, overrides = {}) {
  return createS3MediaStore({
    endpoint: 'https://objects.example.com',
    bucket: 'srocial-bucket',
    prefix: 'media/',
    publicBaseUrl: 'https://cdn.example.com/media',
    maxBytes: 1024,
    totalMaxBytes: 4096,
    requestClient,
    ...overrides
  });
}

async function collect(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

test('saves validated media to a path-style object key and returns public metadata', async () => {
  const fake = createFakeRequestClient();
  const store = createStore(fake.client);
  await store.initialize();
  const upload = await store.save(Readable.from([JPEG]), { contentType: 'image/jpeg' });

  assert.match(upload.key, /^[0-9a-f-]+\.jpg$/i);
  assert.equal(upload.contentType, 'image/jpeg');
  assert.equal(upload.type, 'image');
  assert.equal(upload.size, JPEG.length);
  assert.equal(upload.url, `https://cdn.example.com/media/${upload.key}`);
  assert.equal(upload.isHttps, true);

  const put = fake.calls.find((call) => call.method === 'PUT');
  assert.equal(new URL(put.url).pathname, `/srocial-bucket/media/${upload.key}`);
  assert.equal(put.headers['content-type'], 'image/jpeg');
  assert.equal(put.headers['content-length'], String(JPEG.length));
  assert.deepEqual(Buffer.from(put.body), JPEG);
});

test('lists paginated objects, ignores foreign keys, and reports aggregate usage', async () => {
  const firstKey = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg';
  const secondKey = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png';
  const fake = createFakeRequestClient({
    pages: [
      listXml({
        contents: [
          { key: `media/${firstKey}`, size: 10, modifiedAt: '2026-09-01T00:00:00.000Z' },
          { key: 'media/not-generated.txt', size: 999, modifiedAt: '2026-09-02T00:00:00.000Z' }
        ],
        truncated: true,
        nextToken: 'next token'
      }),
      listXml({ contents: [{ key: `media/${secondKey}`, size: 20, modifiedAt: '2026-09-03T00:00:00.000Z' }] })
    ]
  });
  const store = createStore(fake.client, { totalMaxBytes: 100 });
  const assets = await store.list();
  assert.deepEqual(assets.map((asset) => asset.key), [secondKey, firstKey]);
  assert.equal(assets[0].url, `https://cdn.example.com/media/${secondKey}`);
  const usage = await store.usage();
  assert.deepEqual(usage, { usedBytes: 30, maxBytes: 100, remainingBytes: 70, count: 2 });
  assert.equal(fake.calls.some((call) => new URL(call.url).searchParams.get('continuation-token') === 'next token'), true);
});

test('opens and removes stored objects through the common media-store contract', async () => {
  const key = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png';
  const objects = new Map([[`media/${key}`, PNG]]);
  const fake = createFakeRequestClient({ objects });
  const store = createStore(fake.client);
  const opened = await store.open(key);
  assert.equal(opened.contentType, 'image/png');
  assert.equal(opened.size, PNG.length);
  assert.deepEqual(await collect(opened.stream), PNG);
  await store.remove(key);
  assert.equal(objects.has(`media/${key}`), false);
});

test('maps public URLs back to generated keys across host changes but not unrelated paths', () => {
  const fake = createFakeRequestClient();
  const store = createStore(fake.client);
  const key = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg';
  assert.equal(store.keyFromUrl(`https://cdn.example.com/media/${key}`), key);
  assert.equal(store.keyFromUrl(`https://old-cdn.example/media/${key}`), key);
  assert.equal(store.keyFromUrl(`https://old-cdn.example/other/${key}`), null);
  assert.equal(store.keyFromUrl('not a url'), null);
});

test('rejects MIME/signature mismatch before issuing PUT', async () => {
  const fake = createFakeRequestClient();
  const store = createStore(fake.client);
  await assert.rejects(
    () => store.save(Readable.from([PNG]), { contentType: 'image/jpeg' }),
    (error) => error?.code === 'MEDIA_SIGNATURE_MISMATCH'
  );
  assert.equal(fake.calls.some((call) => call.method === 'PUT'), false);
});

test('enforces per-file and aggregate quota before issuing PUT', async () => {
  const fakeTooLarge = createFakeRequestClient();
  const tooLarge = createStore(fakeTooLarge.client, { maxBytes: JPEG.length - 1 });
  await assert.rejects(() => tooLarge.save(Readable.from([JPEG]), { contentType: 'image/jpeg' }), (error) => error?.code === 'MEDIA_TOO_LARGE');
  assert.equal(fakeTooLarge.calls.some((call) => call.method === 'PUT'), false);

  const existingKey = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg';
  const fakeQuota = createFakeRequestClient({ pages: [listXml({ contents: [{ key: `media/${existingKey}`, size: 9, modifiedAt: '2026-09-01T00:00:00.000Z' }] })] });
  const quota = createStore(fakeQuota.client, { totalMaxBytes: 10 });
  await assert.rejects(() => quota.save(Readable.from([JPEG]), { contentType: 'image/jpeg' }), (error) => error?.code === 'MEDIA_STORAGE_QUOTA_EXCEEDED');
  assert.equal(fakeQuota.calls.some((call) => call.method === 'PUT'), false);
});
