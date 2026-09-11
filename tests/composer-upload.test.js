import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeComposer } from '../client/js/pages/composer.js';

function element(value = '') {
  const listeners = new Map();
  return {
    value, files: [], disabled: false, dataset: {}, textContent: '',
    addEventListener(type, listener) { listeners.set(type, listener); },
    async emit(type) { await listeners.get(type)?.({ preventDefault() {} }); }
  };
}

async function setup(t, uploadResponse) {
  const elements = Object.fromEntries([
    '#social-composer', '#scheduled-at', '#composer-feedback', '#media-file',
    '#upload-media', '#media-upload-feedback', '#media-url', '#media-type',
    '#social-composer button[type="submit"]'
  ].map((id) => [id, element()]));
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    if (url === '/api/accounts') return Response.json({ accounts: [] });
    return uploadResponse();
  });
  const oldDocument = globalThis.document;
  globalThis.document = { querySelector: (id) => elements[id] ?? null };
  t.after(() => { globalThis.document = oldDocument; });
  await initializeComposer();
  return { elements, calls };
}

test('upload requires a file and preserves manual media', async (t) => {
  const { elements: e, calls } = await setup(t);
  e['#media-url'].value = 'https://cdn.test/manual.jpg';
  await e['#upload-media'].emit('click');
  assert.equal(e['#media-upload-feedback'].dataset.state, 'error');
  assert.match(e['#media-upload-feedback'].textContent, /select.*file/i);
  assert.equal(e['#media-url'].value, 'https://cdn.test/manual.jpg');
  assert.equal(calls.length, 1);
});

test('upload fills composer media and prevents overlapping upload or schedule', async (t) => {
  let finish;
  const pending = new Promise((resolve) => { finish = resolve; });
  const { elements: e, calls } = await setup(t, () => pending);
  const file = new Blob(['video'], { type: 'video/mp4' });
  e['#media-file'].files = [file];
  const uploading = e['#upload-media'].emit('click');
  assert.equal(e['#upload-media'].disabled, true);
  assert.equal(e['#social-composer button[type="submit"]'].disabled, true);
  await e['#upload-media'].emit('click');
  await e['#social-composer'].emit('submit');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, '/api/media/uploads');
  assert.equal(calls[1].options.body, file);
  assert.equal(calls[1].options.headers.get('content-type'), 'video/mp4');
  finish(Response.json({ upload: { url: 'https://media.test/media/a.mp4', type: 'video' } }));
  await uploading;
  assert.equal(e['#media-url'].value, 'https://media.test/media/a.mp4');
  assert.equal(e['#media-type'].value, 'video');
  assert.equal(e['#media-upload-feedback'].dataset.state, 'success');
  assert.equal(e['#upload-media'].disabled, false);
  assert.equal(e['#social-composer button[type="submit"]'].disabled, false);
});

test('HTTP upload displays the public HTTPS warning', async (t) => {
  const { elements: e } = await setup(t, () => Response.json({ upload: {
    url: 'http://127.0.0.1:3000/media/a.jpg', type: 'image'
  } }));
  e['#media-file'].files = [new Blob(['jpeg'], { type: 'image/jpeg' })];
  await e['#upload-media'].emit('click');
  assert.equal(e['#media-upload-feedback'].dataset.state, 'warning');
  assert.match(e['#media-upload-feedback'].textContent, /public HTTPS/);
});

test('upload errors preserve manual media and release controls for retry', async (t) => {
  const { elements: e } = await setup(t, () => Response.json({ error: 'media_too_large' }, { status: 413 }));
  e['#media-file'].files = [new Blob(['jpeg'], { type: 'image/jpeg' })];
  e['#media-url'].value = 'https://cdn.test/manual.jpg';
  await e['#upload-media'].emit('click');
  assert.equal(e['#media-url'].value, 'https://cdn.test/manual.jpg');
  assert.equal(e['#media-upload-feedback'].dataset.state, 'error');
  assert.match(e['#media-upload-feedback'].textContent, /too large/i);
  assert.equal(e['#upload-media'].disabled, false);
  assert.equal(e['#media-file'].disabled, false);
});
