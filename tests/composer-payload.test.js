import test from 'node:test';
import assert from 'node:assert/strict';
import { buildComposerPayload } from '../client/js/pages/composer.js';

function form(entries) {
  const map = new Map(entries);
  return {
    get(name) { const value = map.get(name); return Array.isArray(value) ? (value[0] ?? null) : (value ?? null); },
    getAll(name) { const value = map.get(name); return Array.isArray(value) ? value : value == null ? [] : [value]; }
  };
}

const accounts = [
  { id: 'ig-1', provider: 'instagram', state: 'CONNECTED' },
  { id: 'fb-1', provider: 'facebook', state: 'CONNECTED' }
];

test('builds destinations with selected account IDs and media', () => {
  const payload = buildComposerPayload({
    formData: form([
      ['caption', 'Hello'], ['scheduledAt', '2026-09-11T13:00'], ['platform', ['instagram']], ['account:instagram', 'ig-1'], ['mediaType', 'image'], ['mediaUrl', 'https://cdn.example.com/a.jpg']
    ]),
    accounts
  });
  assert.deepEqual(payload.destinations, [{ platform: 'instagram', accountId: 'ig-1' }]);
  assert.deepEqual(payload.media, [{ type: 'image', url: 'https://cdn.example.com/a.jpg' }]);
  assert.equal(payload.caption, 'Hello');
  assert.match(payload.scheduledAt, /Z$/);
});

test('preserves ordered repeated media rows in payload', () => {
  const payload = buildComposerPayload({
    formData: form([
      ['caption', 'Carousel'], ['scheduledAt', '2026-09-11T13:00'], ['platform', ['instagram']], ['account:instagram', 'ig-1'],
      ['mediaType', ['image', 'video', 'image']],
      ['mediaUrl', ['https://cdn.example.com/one.jpg', 'https://cdn.example.com/two.mp4', 'https://cdn.example.com/three.jpg']]
    ]),
    accounts
  });
  assert.deepEqual(payload.media, [
    { type: 'image', url: 'https://cdn.example.com/one.jpg' },
    { type: 'video', url: 'https://cdn.example.com/two.mp4' },
    { type: 'image', url: 'https://cdn.example.com/three.jpg' }
  ]);
});

test('omits empty media', () => {
  const payload = buildComposerPayload({
    formData: form([['caption', 'Hello'], ['scheduledAt', '2026-09-11T13:00'], ['platform', ['instagram']], ['account:instagram', 'ig-1'], ['mediaType', 'image'], ['mediaUrl', '']]), accounts
  });
  assert.deepEqual(payload.media, []);
});

test('rejects checked platform without a selected connected account', () => {
  assert.throws(() => buildComposerPayload({
    formData: form([['caption', 'Hello'], ['scheduledAt', '2026-09-11T13:00'], ['platform', ['instagram']], ['account:instagram', 'fb-1']]), accounts
  }), /connected account/i);
});
