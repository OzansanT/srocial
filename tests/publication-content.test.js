import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePublicationContent } from '../server/platforms/publication-content.js';

const basePost = { id: 'post-1', caption: 'Base caption' };
const baseMedia = [{ type: 'image', url: 'https://cdn.example.com/base.jpg' }];

test('publication content inherits base caption and media when overrides are absent', () => {
  const result = resolvePublicationContent({ post: basePost, publication: {}, baseMedia });
  assert.equal(result.post.caption, 'Base caption');
  assert.deepEqual(result.media, baseMedia);
});

test('publication content applies explicit caption and media overrides', () => {
  const result = resolvePublicationContent({
    post: basePost,
    publication: {
      captionOverride: 'Threads caption',
      mediaOverride: [{ type: 'video', url: 'https://cdn.example.com/thread.mp4' }]
    },
    baseMedia
  });
  assert.equal(result.post.caption, 'Threads caption');
  assert.deepEqual(result.media, [{ type: 'video', url: 'https://cdn.example.com/thread.mp4' }]);
});

test('explicit empty media override is preserved instead of inheriting base media', () => {
  const result = resolvePublicationContent({ post: basePost, publication: { mediaOverride: [] }, baseMedia });
  assert.deepEqual(result.media, []);
});