import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INSTAGRAM_MEDIA_LIMITS,
  validateInstagramMediaMetadata
} from '../server/platforms/instagram/media-policy.js';

function codes(media, metadata) {
  return validateInstagramMediaMetadata(media, metadata).map((issue) => issue.code);
}

test('Instagram image aspect-ratio boundaries are inclusive', () => {
  assert.deepEqual(codes({ type: 'image' }, { width: 800, height: 1000, sizeBytes: 1024 }), []);
  assert.deepEqual(codes({ type: 'image' }, { width: 1910, height: 1000, sizeBytes: 1024 }), []);

  assert.deepEqual(
    codes({ type: 'image' }, { width: 799, height: 1000, sizeBytes: 1024 }),
    ['INSTAGRAM_IMAGE_ASPECT_RATIO_UNSUPPORTED']
  );
  assert.deepEqual(
    codes({ type: 'image' }, { width: 1911, height: 1000, sizeBytes: 1024 }),
    ['INSTAGRAM_IMAGE_ASPECT_RATIO_UNSUPPORTED']
  );
});

test('Instagram image file-size limit is inclusive at 8 MiB', () => {
  assert.equal(INSTAGRAM_MEDIA_LIMITS.imageMaxBytes, 8 * 1024 * 1024);
  assert.deepEqual(codes({ type: 'image' }, {
    width: 1000,
    height: 1000,
    sizeBytes: INSTAGRAM_MEDIA_LIMITS.imageMaxBytes
  }), []);
  assert.deepEqual(codes({ type: 'image' }, {
    width: 1000,
    height: 1000,
    sizeBytes: INSTAGRAM_MEDIA_LIMITS.imageMaxBytes + 1
  }), ['INSTAGRAM_MEDIA_FILE_TOO_LARGE']);
});

test('Instagram video duration boundaries are inclusive from 3 seconds through 15 minutes', () => {
  assert.equal(INSTAGRAM_MEDIA_LIMITS.videoMinDurationSeconds, 3);
  assert.equal(INSTAGRAM_MEDIA_LIMITS.videoMaxDurationSeconds, 15 * 60);
  assert.deepEqual(codes({ type: 'video' }, { durationSeconds: 3, sizeBytes: 1024 }), []);
  assert.deepEqual(codes({ type: 'video' }, { durationSeconds: 15 * 60, sizeBytes: 1024 }), []);
  assert.deepEqual(
    codes({ type: 'video' }, { durationSeconds: 2.999, sizeBytes: 1024 }),
    ['INSTAGRAM_VIDEO_DURATION_UNSUPPORTED']
  );
  assert.deepEqual(
    codes({ type: 'video' }, { durationSeconds: (15 * 60) + 0.001, sizeBytes: 1024 }),
    ['INSTAGRAM_VIDEO_DURATION_UNSUPPORTED']
  );
});

test('Instagram video file-size limit is inclusive at 300 MiB', () => {
  assert.equal(INSTAGRAM_MEDIA_LIMITS.videoMaxBytes, 300 * 1024 * 1024);
  assert.deepEqual(codes({ type: 'video' }, {
    durationSeconds: 30,
    sizeBytes: INSTAGRAM_MEDIA_LIMITS.videoMaxBytes
  }), []);
  assert.deepEqual(codes({ type: 'video' }, {
    durationSeconds: 30,
    sizeBytes: INSTAGRAM_MEDIA_LIMITS.videoMaxBytes + 1
  }), ['INSTAGRAM_MEDIA_FILE_TOO_LARGE']);
});

test('missing trusted metadata fails closed with a stable code', () => {
  assert.deepEqual(codes({ type: 'image' }, null), ['INSTAGRAM_MEDIA_METADATA_REQUIRED']);
  assert.deepEqual(codes({ type: 'video' }, { sizeBytes: 10 }), ['INSTAGRAM_MEDIA_METADATA_REQUIRED']);
});