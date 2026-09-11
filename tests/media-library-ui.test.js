import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function text(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

test('dashboard contains Media navigation and library anchors', async () => {
  const html = await text('../client/index.html');
  assert.match(html, /href="#media"/);
  assert.match(html, /id="media"/);
  assert.match(html, /id="media-library-list"/);
  assert.match(html, /id="media-storage-summary"/);
  assert.match(html, /\/css\/pages\/media-library\.css/);
});

test('app initializes the media library through a dedicated page module', async () => {
  const source = await text('../client/js/app.js');
  assert.match(source, /pages\/media-library\.js/);
  assert.match(source, /initializeMediaLibrary/);
  assert.match(source, /onUseMedia:\s*composer\.useMedia/);
});

test('media library page renders through DOM APIs without innerHTML', async () => {
  const source = await text('../client/js/pages/media-library.js');
  assert.doesNotMatch(source, /innerHTML\s*=/);
  assert.match(source, /createElement/);
  assert.match(source, /media_in_use/);
});
