import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../client/index.html', import.meta.url), 'utf8');
const composer = await readFile(new URL('../client/js/pages/composer.js', import.meta.url), 'utf8');

test('Composer upgrades the existing media editor into an ordered repeatable ten-item list', () => {
  assert.match(html, /class="media-grid"/);
  assert.match(html, /name="mediaType"/);
  assert.match(html, /name="mediaUrl"/);
  assert.match(composer, /composer-media-items/);
  assert.match(composer, /data-composer-media-row/);
  assert.match(composer, /add-media-item/);
  assert.match(composer, /composer-media-count/);
});

test('Composer owns helpers for appending, restoring, and resetting ordered media rows', () => {
  assert.match(composer, /MAX_COMPOSER_MEDIA\s*=\s*10/);
  assert.match(composer, /function\s+readMediaRows\s*\(/);
  assert.match(composer, /function\s+replaceMediaRows\s*\(/);
  assert.match(composer, /function\s+appendMediaToRows\s*\(/);
  assert.doesNotMatch(composer, /innerHTML/);
});
