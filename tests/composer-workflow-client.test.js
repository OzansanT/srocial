import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('composer workflow API module exposes protected draft, resource, and compatibility calls', async () => {
  const source = await read('client/js/api/composer-workflows-api.js');
  for (const token of [
    '/api/composer/drafts',
    '/api/composer/caption-templates',
    '/api/composer/hashtag-collections',
    '/api/composer/destination-groups',
    '/api/composer/compatibility'
  ]) assert.match(source, new RegExp(token.replaceAll('/', '\\/')));
  assert.match(source, /apiJson/);
});

test('composer workflow page owns autosave, revisions, resource application, compatibility and preview orchestration', async () => {
  const source = await read('client/js/pages/composer-workflows.js');
  assert.match(source, /800/);
  assert.match(source, /revision/);
  assert.match(source, /DRAFT_REVISION_CONFLICT|draft_revision_conflict/);
  assert.match(source, /captionTemplate|caption-template|CaptionTemplate/);
  assert.match(source, /hashtag/i);
  assert.match(source, /destination/i);
  assert.match(source, /compatibility/i);
  assert.match(source, /renderPlatformPreviews/);
  assert.doesNotMatch(source, /innerHTML/);
});

test('platform preview renders through safe DOM APIs with per-platform character counts', async () => {
  const source = await read('client/js/components/platform-preview.js');
  assert.match(source, /createElement/);
  assert.match(source, /textContent/);
  assert.match(source, /captionLength/);
  assert.match(source, /captionLimit/);
  assert.doesNotMatch(source, /innerHTML/);
});

test('dashboard exposes V19 draft, reusable content, override, compatibility and preview controls', async () => {
  const html = await read('client/index.html');
  const app = await read('client/js/app.js');
  for (const id of [
    'draft-selector', 'draft-name', 'draft-status', 'delete-draft',
    'caption-template-selector', 'hashtag-collection-selector', 'destination-group-selector',
    'platform-overrides', 'compatibility-report', 'platform-previews'
  ]) assert.match(html, new RegExp(`id=["']${id}["']`));
  assert.match(app, /initializeComposerWorkflows/);
});