import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createRequestHandler } from '../server/app.js';

function memoryRepository() {
  const posts = [], publications = [], jobs = [];
  let id = 0;
  const add = (list, record) => { const item = { id: String(++id), ...structuredClone(record) }; list.push(item); return structuredClone(item); };
  return {
    async createPost(record) { return add(posts, record); },
    async createPublication(record) { return add(publications, record); },
    async createJob(record) { return add(jobs, record); },
    async listJobs() { return structuredClone(jobs); },
    async listPostsWithPublications() { return posts.map((post) => ({ ...structuredClone(post), publications: structuredClone(publications.filter((item) => item.postId === post.id)) })); }
  };
}

async function withServer(run) {
  const repository = memoryRepository();
  const handler = createRequestHandler({ repository, now: () => new Date('2026-09-10T12:00:00.000Z') });
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await run(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); await once(server, 'close'); }
}

test('creates and lists a scheduled post', async () => {
  await withServer(async (base) => {
    const create = await fetch(`${base}/api/posts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ caption: 'Hello', platforms: ['facebook', 'threads'], scheduledAt: '2026-09-11T10:00:00.000Z' }) });
    assert.equal(create.status, 201);
    const created = await create.json();
    assert.equal(created.publications.length, 2);
    const list = await fetch(`${base}/api/posts`);
    assert.equal(list.status, 200);
    const payload = await list.json();
    assert.equal(payload.posts.length, 1);
    assert.equal(payload.posts[0].publications.length, 2);
  });
});

test('returns validation details with 400', async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/api/posts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ caption: '', platforms: ['whatsapp'], scheduledAt: '2026-09-11T10:00:00.000Z' }) });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.error, 'validation_error');
    assert.ok(payload.details.length >= 2);
  });
});

test('returns invalid_json for malformed JSON', async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/api/posts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_json' });
  });
});

test('dashboard counts stored scheduled publications', async () => {
  await withServer(async (base) => {
    await fetch(`${base}/api/posts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ caption: 'Count me', platforms: ['facebook', 'threads'], scheduledAt: '2026-09-11T12:00:00.000Z' }) });
    const response = await fetch(`${base}/api/dashboard`);
    const payload = await response.json();
    assert.equal(payload.counts.scheduled, 2);
  });
});

test('rejects JSON bodies larger than 1 MiB', async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/api/posts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ caption: 'x'.repeat(1024 * 1024 + 10), platforms: ['instagram'], scheduledAt: '2026-09-11T10:00:00.000Z' }) });
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { error: 'payload_too_large' });
  });
});
