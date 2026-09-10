import test from 'node:test';
import assert from 'node:assert/strict';
import { createScheduledPost } from '../server/services/post-service.js';
import { JOB_STATES } from '../server/scheduler/job-states.js';

function createRepository({ accounts = [] } = {}) {
  const records = { posts: [], publications: [], jobs: [], media: [], accounts: structuredClone(accounts) };
  return {
    records,
    async createPost(record) { const item = { id: `post-${records.posts.length + 1}`, ...record }; records.posts.push(item); return structuredClone(item); },
    async createPublication(record) { const item = { id: `pub-${records.publications.length + 1}`, ...record }; records.publications.push(item); return structuredClone(item); },
    async createJob(record) { const item = { id: `job-${records.jobs.length + 1}`, ...record }; records.jobs.push(item); return structuredClone(item); },
    async createMedia(record) { const item = { id: `media-${records.media.length + 1}`, ...record }; records.media.push(item); return structuredClone(item); },
    async getAccount(id) { const item = records.accounts.find((account) => account.id === id); return item ? structuredClone(item) : null; }
  };
}

const now = new Date('2026-09-10T12:00:00.000Z');
const future = '2026-09-11T10:00:00.000Z';
const instagram = { id: 'acc-ig', provider: 'instagram', state: 'CONNECTED', displayName: 'IG Demo' };
const facebook = { id: 'acc-fb', provider: 'facebook', state: 'CONNECTED', displayName: 'FB Demo' };
const disconnected = { id: 'acc-off', provider: 'instagram', state: 'DISCONNECTED' };

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

test('legacy platforms remain supported and create unbound publications', async () => {
  const repository = createRepository();
  const result = await createScheduledPost(repository, { caption: '  New post  ', platforms: ['Instagram', 'threads', 'instagram'], scheduledAt: future }, { now });
  assert.equal(result.post.caption, 'New post');
  assert.deepEqual(result.publications.map((item) => item.platform), ['instagram', 'threads']);
  assert.ok(result.publications.every((item) => item.accountId === null));
  assert.equal(result.jobs.length, 2);
  assert.ok(result.jobs.every((item) => item.type === 'SOCIAL_PUBLICATION' && item.state === JOB_STATES.SCHEDULED));
});

test('explicit destination binds a connected matching account to publication', async () => {
  const repository = createRepository({ accounts: [instagram] });
  const result = await createScheduledPost(repository, {
    caption: 'Bound',
    destinations: [{ platform: 'instagram', accountId: 'acc-ig' }],
    media: [{ type: 'image', url: 'https://cdn.example.com/a.jpg' }],
    scheduledAt: future
  }, { now });
  assert.equal(result.publications.length, 1);
  assert.equal(result.publications[0].accountId, 'acc-ig');
  assert.equal(result.publications[0].platform, 'instagram');
  assert.equal(result.media.length, 1);
  assert.equal(result.media[0].postId, result.post.id);
  assert.equal(result.media[0].sortOrder, 0);
});

test('explicit destinations are deduplicated by platform and accountId', async () => {
  const repository = createRepository({ accounts: [instagram] });
  const result = await createScheduledPost(repository, {
    caption: 'Dedupe',
    destinations: [{ platform: 'Instagram', accountId: 'acc-ig' }, { platform: 'instagram', accountId: 'acc-ig' }],
    scheduledAt: future
  }, { now });
  assert.equal(result.publications.length, 1);
  assert.equal(result.jobs.length, 1);
});

test('rejects missing, disconnected, and cross-platform accounts', async () => {
  for (const [accountId, accounts] of [['missing', [instagram]], ['acc-off', [disconnected]], ['acc-fb', [facebook]]]) {
    const repository = createRepository({ accounts });
    await assert.rejects(() => createScheduledPost(repository, {
      caption: 'Bad account', destinations: [{ platform: 'instagram', accountId }], scheduledAt: future
    }, { now }), (error) => {
      assert.equal(error.code, 'VALIDATION_ERROR');
      assert.ok(error.details.some((item) => item.field === 'destinations'));
      return true;
    });
  }
});

test('persists media in input order', async () => {
  const repository = createRepository({ accounts: [instagram] });
  const result = await createScheduledPost(repository, {
    caption: 'Media', destinations: [{ platform: 'instagram', accountId: 'acc-ig' }],
    media: [{ type: 'image', url: 'https://cdn.example.com/1.jpg' }, { type: 'video', url: 'https://cdn.example.com/2.mp4' }], scheduledAt: future
  }, { now });
  assert.deepEqual(result.media.map((item) => item.sortOrder), [0, 1]);
});

test('rejects invalid media type, non-https URL, and more than ten items', async () => {
  const cases = [[{ type: 'document', url: 'https://cdn.example.com/a.pdf' }], [{ type: 'image', url: 'http://cdn.example.com/a.jpg' }], Array.from({ length: 11 }, (_, index) => ({ type: 'image', url: `https://cdn.example.com/${index}.jpg` }))];
  for (const media of cases) {
    const repository = createRepository({ accounts: [instagram] });
    await assert.rejects(() => createScheduledPost(repository, { caption: 'Bad media', destinations: [{ platform: 'instagram', accountId: 'acc-ig' }], media, scheduledAt: future }, { now }), (error) => {
      assert.equal(error.code, 'VALIDATION_ERROR');
      assert.ok(error.details.some((item) => item.field === 'media'));
      return true;
    });
  }
});
