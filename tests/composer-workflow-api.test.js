import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequestHandler } from '../server/app.js';
import { createJsonRepository } from '../server/db/json-repository.js';

const NOW = new Date('2026-09-14T13:00:00.000Z');

async function withServer(run) {
  const directory = await mkdtemp(join(tmpdir(), 'srocial-v19-api-'));
  const repository = createJsonRepository({ filePath: join(directory, 'data.json') });
  await repository.initialize();
  const server = createServer(createRequestHandler({ repository, now: () => new Date(NOW) }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await run({ base: `http://127.0.0.1:${server.address().port}`, repository }); }
  finally { server.close(); await once(server, 'close'); await repository.close(); await rm(directory, { recursive: true, force: true }); }
}

async function json(base, path, { method = 'GET', body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { response, payload: response.status === 204 ? null : await response.json() };
}

test('draft API supports create/list/update conflict/get/delete lifecycle', async () => {
  await withServer(async ({ base }) => {
    const created = await json(base, '/api/composer/drafts', { method: 'POST', body: { name: 'Idea', caption: '' } });
    assert.equal(created.response.status, 201);
    assert.equal(created.payload.draft.revision, 1);
    const id = created.payload.draft.id;

    const listed = await json(base, '/api/composer/drafts');
    assert.equal(listed.response.status, 200);
    assert.equal(listed.payload.drafts.length, 1);

    const updated = await json(base, `/api/composer/drafts/${encodeURIComponent(id)}`, { method: 'PATCH', body: { revision: 1, caption: 'Saved' } });
    assert.equal(updated.response.status, 200);
    assert.equal(updated.payload.draft.revision, 2);

    const stale = await json(base, `/api/composer/drafts/${encodeURIComponent(id)}`, { method: 'PATCH', body: { revision: 1, caption: 'Overwrite' } });
    assert.equal(stale.response.status, 409);
    assert.equal(stale.payload.error, 'draft_revision_conflict');

    const fetched = await json(base, `/api/composer/drafts/${encodeURIComponent(id)}`);
    assert.equal(fetched.payload.draft.caption, 'Saved');

    const removed = await json(base, `/api/composer/drafts/${encodeURIComponent(id)}`, { method: 'DELETE' });
    assert.equal(removed.response.status, 204);
  });
});

test('reusable resource APIs and compatibility endpoint are exposed', async () => {
  await withServer(async ({ base }) => {
    for (const [path, body, key] of [
      ['/api/composer/caption-templates', { name: 'Promo', caption: 'Hello' }, 'templates'],
      ['/api/composer/hashtag-collections', { name: 'Pets', tags: ['pet', '#cat'] }, 'collections'],
      ['/api/composer/destination-groups', { name: 'All', destinations: [] }, 'groups']
    ]) {
      const created = await json(base, path, { method: 'POST', body });
      assert.equal(created.response.status, 201);
      const listed = await json(base, path);
      assert.equal(listed.response.status, 200);
      assert.equal(listed.payload[key].length, 1);
    }

    const compatibility = await json(base, '/api/composer/compatibility', {
      method: 'POST',
      body: { caption: 'Hello', scheduledAt: '2026-09-15T10:00:00.000Z', media: [], destinations: [] }
    });
    assert.equal(compatibility.response.status, 200);
    assert.equal(typeof compatibility.payload.compatible, 'boolean');
  });
});