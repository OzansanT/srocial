import test from 'node:test';
import assert from 'node:assert/strict';
import { buildComposerPayload } from '../client/js/pages/composer.js';

function form(entries) {
  const map = new Map(entries);
  return {
    get(name) { return map.get(name) ?? null; },
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
