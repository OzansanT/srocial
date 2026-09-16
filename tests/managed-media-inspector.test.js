import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createManagedMediaInspector } from '../server/media/managed-media-inspector.js';

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
  const mvhdPayload = Buffer.alloc(20);
  mvhdPayload.writeUInt32BE(timescale, 12);
  mvhdPayload.writeUInt32BE(Math.round(durationSeconds * timescale), 16);
  return Buffer.concat([
    box('ftyp', Buffer.from('isom0000', 'ascii')),
    box('moov', box('mvhd', mvhdPayload))
  ]);
}

function mediaStoreFixture({ bytes, contentType, size = bytes.length, key = 'asset.png' } = {}) {
  let opens = 0;
  return {
    keyFromUrl(url) {
      return String(url).includes('/media/') ? key : null;
    },
    async open(openKey) {
      opens += 1;
      assert.equal(openKey, key);
      return { key, contentType, size, stream: Readable.from([bytes]) };
    },
    get opens() { return opens; }
  };
}

test('inspects managed image metadata through mediaStore without fetching its URL', async () => {
  const store = mediaStoreFixture({ bytes: png(1000, 1250), contentType: 'image/png' });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('fetch must not be used'); };
  try {
    const inspector = createManagedMediaInspector({ mediaStore: store });
    assert.deepEqual(await inspector.inspect({ type: 'image', url: 'https://cdn.example.test/media/asset.png' }, { maxBytes: 8 * 1024 * 1024 }), {
      contentType: 'image/png',
      sizeBytes: 24,
      width: 1000,
      height: 1250
    });
    assert.equal(store.opens, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('inspects managed MP4 duration through the same media-store contract', async () => {
  const bytes = mp4(45);
  const store = mediaStoreFixture({ bytes, contentType: 'video/mp4', key: 'asset.mp4' });
  const inspector = createManagedMediaInspector({ mediaStore: store });
  assert.deepEqual(await inspector.inspect({ type: 'video', url: 'https://cdn.example.test/media/asset.mp4' }, { maxBytes: 300 * 1024 * 1024 }), {
    contentType: 'video/mp4',
    sizeBytes: bytes.length,
    durationSeconds: 45
  });
});

test('unmanaged arbitrary URLs return no metadata and are never opened or fetched', async () => {
  let opened = false;
  const inspector = createManagedMediaInspector({ mediaStore: {
    keyFromUrl() { return null; },
    async open() { opened = true; throw new Error('must not open'); }
  }});
  const originalFetch = globalThis.fetch;
  let fetched = false;
  globalThis.fetch = async () => { fetched = true; throw new Error('must not fetch'); };
  try {
    assert.equal(await inspector.inspect({ type: 'image', url: 'https://private.example.test/image.png' }, { maxBytes: 1024 }), null);
    assert.equal(opened, false);
    assert.equal(fetched, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('known oversize managed media returns trusted size without consuming the stream', async () => {
  let iterated = false;
  const stream = Readable.from((async function* () {
    iterated = true;
    yield Buffer.from('never-read');
  })());
  const inspector = createManagedMediaInspector({ mediaStore: {
    keyFromUrl() { return 'large.mp4'; },
    async open() { return { key: 'large.mp4', contentType: 'video/mp4', size: 400 * 1024 * 1024, stream }; }
  }});

  assert.deepEqual(await inspector.inspect({ type: 'video', url: 'https://cdn.test/media/large.mp4' }, { maxBytes: 300 * 1024 * 1024 }), {
    contentType: 'video/mp4',
    sizeBytes: 400 * 1024 * 1024
  });
  assert.equal(iterated, false);
});

test('storage and parse failures are sanitized into missing metadata', async () => {
  const unavailable = createManagedMediaInspector({ mediaStore: {
    keyFromUrl() { return 'asset.png'; },
    async open() { throw new Error('/secret/storage/path leaked'); }
  }});
  assert.equal(await unavailable.inspect({ type: 'image', url: 'https://cdn.test/media/asset.png' }, { maxBytes: 1024 }), null);

  const malformed = mediaStoreFixture({ bytes: Buffer.alloc(24), contentType: 'image/png' });
  const inspector = createManagedMediaInspector({ mediaStore: malformed });
  assert.deepEqual(await inspector.inspect({ type: 'image', url: 'https://cdn.test/media/asset.png' }, { maxBytes: 1024 }), {
    contentType: 'image/png',
    sizeBytes: 24
  });
});
