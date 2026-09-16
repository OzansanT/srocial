import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { parseImageDimensions, parseMp4Duration } from '../server/media/media-metadata.js';

function png(width, height) {
  const bytes = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function jpeg(width, height) {
  const bytes = Buffer.alloc(23);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  bytes[3] = 0xc0;
  bytes.writeUInt16BE(17, 4);
  bytes[6] = 8;
  bytes.writeUInt16BE(height, 7);
  bytes.writeUInt16BE(width, 9);
  bytes[11] = 3;
  return bytes;
}

function webpVp8x(width, height) {
  const bytes = Buffer.alloc(30);
  bytes.write('RIFF', 0, 'ascii');
  bytes.writeUInt32LE(22, 4);
  bytes.write('WEBP', 8, 'ascii');
  bytes.write('VP8X', 12, 'ascii');
  bytes.writeUInt32LE(10, 16);
  bytes.writeUIntLE(width - 1, 24, 3);
  bytes.writeUIntLE(height - 1, 27, 3);
  return bytes;
}

function box(type, payload) {
  const result = Buffer.alloc(8 + payload.length);
  result.writeUInt32BE(result.length, 0);
  result.write(type, 4, 'ascii');
  payload.copy(result, 8);
  return result;
}

function mp4(durationSeconds, { timescale = 1000, leadingMediaBytes = 0 } = {}) {
  const ftyp = box('ftyp', Buffer.from('isom0000', 'ascii'));
  const mvhdPayload = Buffer.alloc(20);
  mvhdPayload.writeUInt32BE(timescale, 12);
  mvhdPayload.writeUInt32BE(Math.round(durationSeconds * timescale), 16);
  const moov = box('moov', box('mvhd', mvhdPayload));
  const mdat = box('mdat', Buffer.alloc(leadingMediaBytes));
  return Buffer.concat([ftyp, mdat, moov]);
}

test('parses dimensions from supported PNG JPEG and WebP headers', () => {
  assert.deepEqual(parseImageDimensions('image/png', png(800, 1000)), { width: 800, height: 1000 });
  assert.deepEqual(parseImageDimensions('image/jpeg', jpeg(1910, 1000)), { width: 1910, height: 1000 });
  assert.deepEqual(parseImageDimensions('image/webp', webpVp8x(1200, 900)), { width: 1200, height: 900 });
});

test('image dimension parsing fails safely for malformed or unsupported bytes', () => {
  assert.equal(parseImageDimensions('image/png', Buffer.alloc(12)), null);
  assert.equal(parseImageDimensions('image/jpeg', Buffer.from([0xff, 0xd8, 0xff])), null);
  assert.equal(parseImageDimensions('image/gif', Buffer.alloc(32)), null);
});

test('parses MP4 movie-header duration from a Buffer', async () => {
  assert.equal(await parseMp4Duration(mp4(30)), 30);
});

test('parses MP4 duration from a chunked stream with media data before moov', async () => {
  const bytes = mp4(12.5, { leadingMediaBytes: 257 });
  const chunks = [bytes.subarray(0, 11), bytes.subarray(11, 91), bytes.subarray(91, 211), bytes.subarray(211)];
  assert.equal(await parseMp4Duration(Readable.from(chunks)), 12.5);
});

test('MP4 duration parsing fails safely for malformed or missing movie headers', async () => {
  assert.equal(await parseMp4Duration(Buffer.from('not-an-mp4')), null);
  assert.equal(await parseMp4Duration(box('ftyp', Buffer.from('isom0000', 'ascii'))), null);
});
