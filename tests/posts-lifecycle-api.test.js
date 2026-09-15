import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequestHandler } from '../server/app.js';
import { createJsonRepository } from '../server/db/json-repository.js';

const NOW = new Date('2026-09-14T12:00:00.000Z');

async function withServer(run) {
  const directory = await mkdtemp(join(tmpdir(), 'srocial-v18-api-'));
  const repository = createJsonRepository({ filePath: join(directory, 'data.json') });
  await repository.initialize();
  const account = await repository.createAccount({
    provider: 'facebook',
    providerAccountId: 'facebook-page-1',
    displayName: 'Facebook Test Page',
    state: 'CONNECTED'
  });
  const server = createServer(createRequestHandler({ repository, now: () => new Date(NOW) }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await run({ base, repository, account }); }
  finally {
    server.close();
    await once(server, 'close');
    await repository.close();
    await rm(directory, { recursive: true, force: true });
  }
}

async function createPost(base, accountId, scheduledAt = '2026-09-14T15:00:00.000Z') {
  const response = await fetch(`${base}/api/posts`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      caption: 'Lifecycle',
      destinations: [{ platform: 'facebook', accountId }],
      scheduledAt
    })
  });
  assert.equal(response.status, 201);
  return response.json();
}

test('GET /api/posts returns operation jobs and supports queue filters', async () => {
  await withServer(async ({ base, account }) => {
    await createPost(base, account.id);
    const response = await fetch(`${base}/api/posts?platform=facebook&state=SCHEDULED&from=2026-09-14T00:00:00.000Z&until=2026-09-15T00:00:00.000Z`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.posts.length, 1);
    assert.equal(payload.posts[0].publications[0].jobs[0].type, 'SOCIAL_PUBLICATION');
  });
});

test('PATCH post edits caption and reschedules publication/job together', async () => {
  await withServer(async ({ base, account }) => {
    const created = await createPost(base, account.id);
    const response = await fetch(`${base}/api/posts/${created.post.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ caption: 'Updated', scheduledAt: '2026-09-15T16:00:00.000Z' })
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.post.caption, 'Updated');
    assert.equal(payload.post.scheduledAt, '2026-09-15T16:00:00.000Z');
    assert.equal(payload.post.publications[0].jobs[0].scheduledAt, '2026-09-15T16:00:00.000Z');
  });
});

test('cancel and duplicate expose 200/201 lifecycle responses', async () => {
  await withServer(async ({ base, account }) => {
    const created = await createPost(base, account.id);
    const duplicate = await fetch(`${base}/api/posts/${created.post.id}/duplicate`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scheduledAt: '2026-09-16T10:00:00.000Z' })
    });
    assert.equal(duplicate.status, 201);
    assert.notEqual((await duplicate.json()).post.id, created.post.id);

    const cancel = await fetch(`${base}/api/posts/${created.post.id}/cancel`, { method: 'POST' });
    assert.equal(cancel.status, 200);
    assert.equal((await cancel.json()).post.publications[0].state, 'CANCELLED');
  });
});

test('failed publication can be retried and unsafe external-id retry returns 409', async () => {
  await withServer(async ({ base, repository, account }) => {
    const created = await createPost(base, account.id);
    await repository.updatePublication(created.publications[0].id, { state: 'FAILED', errorCode: 'PROVIDER_ERROR' });
    await repository.updateJob(created.jobs[0].id, { state: 'FAILED', errorCode: 'PROVIDER_ERROR' });

    const retry = await fetch(`${base}/api/publications/${created.publications[0].id}/retry`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scheduledAt: '2026-09-15T11:00:00.000Z' })
    });
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).publication.state, 'SCHEDULED');

    await repository.updatePublication(created.publications[0].id, { state: 'FAILED', externalId: 'provider-1' });
    await repository.updateJob(created.jobs[0].id, { state: 'FAILED' });
    const unsafe = await fetch(`${base}/api/publications/${created.publications[0].id}/retry`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(unsafe.status, 409);
    assert.deepEqual(await unsafe.json(), { error: 'lifecycle_conflict', reason: 'unsafe_external_id' });
  });
});

test('bulk cancel prevalidates and bulk reschedule updates selected posts', async () => {
  await withServer(async ({ base, repository, account }) => {
    const one = await createPost(base, account.id, '2026-09-14T15:00:00.000Z');
    const two = await createPost(base, account.id, '2026-09-14T16:00:00.000Z');

    const reschedule = await fetch(`${base}/api/posts/bulk/reschedule`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ postIds: [one.post.id, two.post.id], scheduledAt: '2026-09-17T09:00:00.000Z' })
    });
    assert.equal(reschedule.status, 200);
    assert.ok((await reschedule.json()).posts.every((post) => post.scheduledAt === '2026-09-17T09:00:00.000Z'));

    await repository.updatePublication(two.publications[0].id, { externalId: 'provider-unsafe' });
    const cancel = await fetch(`${base}/api/posts/bulk/cancel`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ postIds: [one.post.id, two.post.id] })
    });
    assert.equal(cancel.status, 409);
    const after = await repository.getPostOperation(one.post.id);
    assert.equal(after.publications[0].state, 'SCHEDULED');
  });
});

test('unknown post and invalid schedule map to safe 404/400 responses', async () => {
  await withServer(async ({ base, account }) => {
    const missing = await fetch(`${base}/api/posts/missing/cancel`, { method: 'POST' });
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: 'not_found' });

    const created = await createPost(base, account.id);
    const invalid = await fetch(`${base}/api/posts/${created.post.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scheduledAt: 'bad' })
    });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error, 'validation_error');
  });
});
