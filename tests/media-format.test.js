import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createValidatedMediaIterable, getMediaFormat, mediaMetadataFromKey } from '../server/media/media-format.js';

const FIXTURES = Object.freeze({
  'image/jpeg': Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]),
  'image/png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]),
  'image/webp': Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x04, 0x00, 0x00, 0x00]), Buffer.from('WEBP')]),
  'video/mp4': Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x18]), Buffer.from('ftyp'), Buffer.from('isom'), Buffer.alloc(12)])
});

async function collect(iterable) {
  const chunks = [];
  for await (const chunk of iterable) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

test('maps supported media types and generated keys to trusted metadata', () => {
  assert.deepEqual(getMediaFormat('IMAGE/JPEG; charset=binary'), { contentType: 'image/jpeg', extension: '.jpg', type: 'image', signatureBytes: 3 });
  assert.deepEqual(mediaMetadataFromKey('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.mp4'), { contentType: 'video/mp4', type: 'video' });
  assert.equal(mediaMetadataFromKey('../secret.jpg'), null);
});

test('accepts and replays valid JPEG PNG WebP and MP4 bytes', async () => {
  for (const [contentType, bytes] of Object.entries(FIXTURES)) {
    const { format, iterable } = createValidatedMediaIterable(Readable.from([bytes.subarray(0, 2), bytes.subarray(2)]), { contentType });
    assert.equal(format.contentType, contentType);
    assert.deepEqual(await collect(iterable), bytes);
  }
});

test('rejects declared MIME that disagrees with another supported signature', async () => {
  const { iterable } = createValidatedMediaIterable(Readable.from([FIXTURES['image/png']]), { contentType: 'image/jpeg' });
  await assert.rejects(() => collect(iterable), (error) => error?.code === 'MEDIA_SIGNATURE_MISMATCH');
});

test('rejects malformed or too-short bytes for a supported declared MIME', async () => {
  for (const bytes of [Buffer.from('not-a-jpeg'), Buffer.from([0x89, 0x50, 0x4e])]) {
    const { iterable } = createValidatedMediaIterable(Readable.from([bytes]), { contentType: 'image/png' });
    await assert.rejects(() => collect(iterable), (error) => error?.code === 'INVALID_MEDIA_SIGNATURE');
  }
});

test('rejects unsupported declared MIME before consuming bytes', () => {
  assert.throws(
    () => createValidatedMediaIterable(Readable.from([Buffer.from('<svg/>')]), { contentType: 'image/svg+xml' }),
    (error) => error?.code === 'UNSUPPORTED_MEDIA_TYPE'
  );
});
