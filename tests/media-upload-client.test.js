import test from 'node:test';
import assert from 'node:assert/strict';
import { describeUploadedMedia } from '../client/js/api/media-api.js';

test('describes HTTPS uploaded media as ready for scheduling', () => {
  assert.deepEqual(describeUploadedMedia({
    url: 'https://srocial.test/media/file.jpg',
    type: 'image',
    isHttps: true
  }), {
    url: 'https://srocial.test/media/file.jpg',
    type: 'image',
    state: 'success',
    message: 'Media uploaded.'
  });
});

test('describes HTTP uploaded media with public HTTPS warning', () => {
  const result = describeUploadedMedia({
    url: 'http://127.0.0.1:3000/media/file.mp4',
    type: 'video',
    isHttps: false
  });
  assert.equal(result.url, 'http://127.0.0.1:3000/media/file.mp4');
  assert.equal(result.type, 'video');
  assert.equal(result.state, 'warning');
  assert.match(result.message, /public HTTPS/i);
});

test('rejects malformed upload responses instead of mutating composer state', () => {
  assert.throws(() => describeUploadedMedia({ type: 'image', isHttps: true }), /INVALID_MEDIA_UPLOAD/);
  assert.throws(() => describeUploadedMedia({ url: 'https://srocial.test/media/x.jpg', type: 'document', isHttps: true }), /INVALID_MEDIA_UPLOAD/);
});
