import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../client/index.html', import.meta.url), 'utf8');
const composer = await readFile(new URL('../client/js/pages/composer.js', import.meta.url), 'utf8');

test('Composer exposes an ordered repeatable media list with add control and ten-item limit feedback', () => {
  assert.match(html, /id="composer-media-items"/);
  assert.match(html, /data-composer-media-row/);
  assert.match(html, /id="add-media-item"/);
  assert.match(html, /id="composer-media-count"/);
  assert.match(html, /name="mediaType"/);
  assert.match(html, /name="mediaUrl"/);
});

test('Composer owns helpers for appending, restoring, and resetting ordered media rows', () => {
  assert.match(composer, /MAX_COMPOSER_MEDIA\s*=\s*10/);
  assert.match(composer, /function\s+readMediaRows\s*\(/);
  assert.match(composer, /function\s+replaceMediaRows\s*\(/);
  assert.match(composer, /function\s+appendMediaToRows\s*\(/);
});
