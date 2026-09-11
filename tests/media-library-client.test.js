import test from 'node:test';
import assert from 'node:assert/strict';
import { listMediaAssets, deleteMediaAsset } from '../client/js/api/media-library-api.js';

test('listMediaAssets requests the media library endpoint', async (t) => {
  t.mock.method(globalThis, 'fetch', async (path, options = {}) => {
    assert.equal(path, '/api/media');
    assert.equal(options.method, undefined);
    return new Response(JSON.stringify({ assets: [], usage: { usedBytes: 0, maxBytes: 10, remainingBytes: 10, count: 0 } }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  });
  const payload = await listMediaAssets();
  assert.deepEqual(payload.assets, []);
  assert.equal(payload.usage.maxBytes, 10);
});

test('deleteMediaAsset encodes the key and sends DELETE', async (t) => {
  t.mock.method(globalThis, 'fetch', async (path, options = {}) => {
    assert.equal(path, '/api/media/file%20name.jpg');
    assert.equal(options.method, 'DELETE');
    return new Response(null, { status: 204 });
  });
  assert.equal(await deleteMediaAsset('file name.jpg'), null);
});
