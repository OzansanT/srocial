import test from 'node:test';
import assert from 'node:assert/strict';
import { createScheduledPost } from '../server/services/post-service.js';

function createRepository() {
  const records = { posts: [], publications: [], jobs: [] };
  return {
    records,
    async createPost(record) { const item = { id: `post-${records.posts.length + 1}`, ...record }; records.posts.push(item); return structuredClone(item); },
    async createPublication(record) { const item = { id: `pub-${records.publications.length + 1}`, ...record }; records.publications.push(item); return structuredClone(item); },
    async createJob(record) { const item = { id: `job-${records.jobs.length + 1}`, ...record }; records.jobs.push(item); return structuredClone(item); }
  };
}

const now = new Date('2026-09-10T12:00:00.000Z');
const future = '2026-09-11T10:00:00.000Z';

test('rejects an empty caption', async () => {
  const repository = createRepository();
  await assert.rejects(() => createScheduledPost(repository, { caption: '   ', platforms: ['instagram'], scheduledAt: future }, { now }), (error) => {
    assert.equal(error.code, 'VALIDATION_ERROR');
    assert.ok(error.details.some((item) => item.field === 'caption'));
    return true;
  });
});

test('rejects unsupported and messaging platforms', async () => {
  const repository = createRepository();
  await assert.rejects(() => createScheduledPost(repository, { caption: 'Hello', platforms: ['instagram', 'whatsapp'], scheduledAt: future }, { now }), (error) => {
    assert.ok(error.details.some((item) => item.field === 'platforms'));
    return true;
  });
});

test('rejects a schedule that is not in the future', async () => {
  const repository = createRepository();
  await assert.rejects(() => createScheduledPost(repository, { caption: 'Hello', platforms: ['instagram'], scheduledAt: '2026-09-10T11:59:59.000Z' }, { now }), (error) => {
    assert.ok(error.details.some((item) => item.field === 'scheduledAt'));
    return true;
  });
});

test('deduplicates platforms and creates one publication and job per platform', async () => {
  const repository = createRepository();
  const result = await createScheduledPost(repository, { caption: '  New post  ', platforms: ['Instagram', 'threads', 'instagram'], scheduledAt: future }, { now });
  assert.equal(result.post.caption, 'New post');
  assert.deepEqual(result.publications.map((item) => item.platform), ['instagram', 'threads']);
  assert.equal(result.jobs.length, 2);
  assert.ok(result.publications.every((item) => item.state === 'SCHEDULED'));
  assert.ok(result.jobs.every((item) => item.type === 'SOCIAL_PUBLICATION' && item.state === 'SCHEDULED'));
  assert.ok(result.jobs.every((item) => item.publicationId));
});
