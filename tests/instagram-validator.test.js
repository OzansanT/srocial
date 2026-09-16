import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInstagramPublication } from '../server/platforms/instagram/validator.js';

async function invalid(media) {
  try {
    validateInstagramPublication({ post: { caption: 'Caption' }, media });
    assert.fail('expected INVALID_MEDIA');
  } catch (error) {
    assert.equal(error.code, 'INVALID_MEDIA');
    assert.equal(error.retryable, false);
  }
}

test('rejects missing media and more than ten carousel items', async () => {
  await invalid([]);
  await invalid(Array.from({ length: 11 }, (_, index) => ({ type: 'image', url: `https://cdn.example/${index}.jpg` })));
});

test('rejects non-https and unsupported media', async () => {
  await invalid([{ type: 'image', url: 'http://cdn.example/a.jpg' }]);
  await invalid([{ type: 'document', url: 'https://cdn.example/a.pdf' }]);
  await invalid([{ type: 'image', url: 'not-a-url' }]);
});

test('normalizes one image publication without changing the existing shape', () => {
  assert.deepEqual(validateInstagramPublication({
    post: { caption: '  Hello  ' },
    media: [{ type: 'IMAGE', url: 'https://cdn.example/a.jpg' }]
  }), { type: 'image', url: 'https://cdn.example/a.jpg', caption: 'Hello' });
});

test('normalizes one video as Reel input without changing the existing shape', () => {
  assert.deepEqual(validateInstagramPublication({
    post: { caption: '' },
    media: [{ type: 'video', url: 'https://cdn.example/a.mp4' }]
  }), { type: 'video', url: 'https://cdn.example/a.mp4', caption: '' });
});

test('normalizes ordered mixed media as an Instagram carousel', () => {
  assert.deepEqual(validateInstagramPublication({
    post: { caption: '  Carousel  ' },
    media: [
      { type: 'IMAGE', url: 'https://cdn.example/one.jpg' },
      { type: 'video', url: 'https://cdn.example/two.mp4' },
      { type: 'image', url: 'https://cdn.example/three.jpg' }
    ]
  }), {
    type: 'carousel',
    caption: 'Carousel',
    media: [
      { type: 'image', url: 'https://cdn.example/one.jpg' },
      { type: 'video', url: 'https://cdn.example/two.mp4' },
      { type: 'image', url: 'https://cdn.example/three.jpg' }
    ]
  });
});

test('accepts the ten-item Instagram carousel limit', () => {
  const media = Array.from({ length: 10 }, (_, index) => ({
    type: index % 2 ? 'video' : 'image',
    url: `https://cdn.example/${index}.${index % 2 ? 'mp4' : 'jpg'}`
  }));
  const result = validateInstagramPublication({ post: { caption: 'Ten' }, media });
  assert.equal(result.type, 'carousel');
  assert.deepEqual(result.media, media);
});
