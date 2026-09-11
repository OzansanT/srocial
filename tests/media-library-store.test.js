import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createLocalMediaStore } from '../server/media/local-media-store.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const MP4 = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x08]), Buffer.from('ftyp')]);

async function withStore(run, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'srocial-media-library-store-'));
  try {
    const store = createLocalMediaStore({
      rootDirectory: directory,
      publicBaseUrl: options.publicBaseUrl ?? 'https://srocial.test',
      maxBytes: options.maxBytes ?? 64,
      totalMaxBytes: options.totalMaxBytes ?? 1024
    });
    await store.initialize();
    await run(store, directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('lists uploaded assets and reports aggregate usage', async () => {
  await withStore(async (store) => {
    const first = await store.save(Readable.from([JPEG]), { contentType: 'image/jpeg' });
    const second = await store.save(Readable.from([MP4]), { contentType: 'video/mp4' });
    const assets = await store.list();
    const usage = await store.usage();

    assert.equal(assets.length, 2);
    assert.deepEqual(new Set(assets.map((asset) => asset.key)), new Set([first.key, second.key]));
    assert.equal(assets.every((asset) => !Object.hasOwn(asset, 'path')), true);
    assert.equal(usage.usedBytes, JPEG.length + MP4.length);
    assert.equal(usage.maxBytes, 1024);
    assert.equal(usage.remainingBytes, 1024 - JPEG.length - MP4.length);
    assert.equal(usage.count, 2);
  });
});

test('removes a generated media key and rejects traversal-like removal keys', async () => {
  await withStore(async (store) => {
    const upload = await store.save(Readable.from([JPEG]), { contentType: 'image/jpeg' });
    await store.remove(upload.key);
    await assert.rejects(() => store.open(upload.key), (error) => error?.code === 'MEDIA_NOT_FOUND');
    await assert.rejects(() => store.remove('../secret.jpg'), (error) => error?.code === 'MEDIA_NOT_FOUND');
  });
});

test('rejects upload that would exceed total quota and removes partial file', async () => {
  await withStore(async (store, directory) => {
    await store.save(Readable.from([JPEG]), { contentType: 'image/jpeg' });
    await assert.rejects(
      () => store.save(Readable.from([JPEG]), { contentType: 'image/jpeg' }),
      (error) => error?.code === 'MEDIA_STORAGE_QUOTA_EXCEEDED'
    );
    assert.equal((await store.usage()).usedBytes, JPEG.length);
    assert.equal((await readdir(directory)).length, 1);
  }, { totalMaxBytes: 4 });
});
