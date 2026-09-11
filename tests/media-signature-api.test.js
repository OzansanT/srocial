import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequestHandler } from '../server/app.js';
import { createLocalMediaStore } from '../server/media/local-media-store.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function withHarness(run) {
  const directory = await mkdtemp(join(tmpdir(), 'srocial-media-signature-api-'));
  const mediaStore = createLocalMediaStore({ rootDirectory: directory, publicBaseUrl: 'https://media.srocial.test' });
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

test('declared MIME/signature mismatch returns sanitized HTTP 415', async () => {
  await withHarness(async (base, directory) => {
    const response = await fetch(`${base}/api/media/uploads`, {
      method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: PNG
    });
    assert.equal(response.status, 415);
    assert.deepEqual(await response.json(), { error: 'media_signature_mismatch' });
    assert.deepEqual(await readdir(directory), []);
  });
});

test('malformed supported media signature returns sanitized HTTP 415', async () => {
  await withHarness(async (base, directory) => {
    const response = await fetch(`${base}/api/media/uploads`, {
      method: 'POST', headers: { 'content-type': 'image/png' }, body: Buffer.from('not-a-png')
    });
    assert.equal(response.status, 415);
    assert.deepEqual(await response.json(), { error: 'invalid_media_signature' });
    assert.deepEqual(await readdir(directory), []);
  });
});
