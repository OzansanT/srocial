import test from 'node:test';
import assert from 'node:assert/strict';
import { createScheduledPost } from '../server/services/post-service.js';

const now = new Date('2026-09-16T12:00:00.000Z');
const scheduledAt = '2026-09-17T12:00:00.000Z';

function account(provider) {
  return { id: `acc-${provider}`, provider, state: 'CONNECTED' };
}

function repositoryFor(accounts) {
  const records = { posts: [], media: [], publications: [], jobs: [], accounts };
  return {
    records,
    async getAccount(id) {
      return records.accounts.find((item) => item.id === id) ?? null;
    },
    async createSocialScheduleGraph({ post, media, publicationPlans }) {
      records.posts.push(post);
      records.media.push(...media);
      records.publications.push(...publicationPlans.map((item) => item.publication));
      records.jobs.push(...publicationPlans.map((item) => item.job));
      return { post, media, publications: records.publications, jobs: records.jobs };
    }
  };
}

function media(count) {
  return Array.from({ length: count }, (_, index) => ({
    type: index % 2 ? 'video' : 'image',
    url: `https://cdn.example/${index}.${index % 2 ? 'mp4' : 'jpg'}`
  }));
}

test('Instagram scheduling accepts ordered carousel media and persists sortOrder', async () => {
  const instagram = account('instagram');
  const repository = repositoryFor([instagram]);
  const result = await createScheduledPost(repository, {
    caption: 'Carousel',
    destinations: [{ platform: 'instagram', accountId: instagram.id }],
    media: media(3),
    scheduledAt
  }, { now });

  assert.deepEqual(result.media.map((item) => ({ type: item.type, url: item.url, sortOrder: item.sortOrder })), [
    { type: 'image', url: 'https://cdn.example/0.jpg', sortOrder: 0 },
    { type: 'video', url: 'https://cdn.example/1.mp4', sortOrder: 1 },
    { type: 'image', url: 'https://cdn.example/2.jpg', sortOrder: 2 }
  ]);
  assert.equal(result.publications.length, 1);
});

test('Instagram scheduling accepts ten items but rejects eleven before persistence', async () => {
  const instagram = account('instagram');
  const repository = repositoryFor([instagram]);
  const ten = await createScheduledPost(repository, {
    caption: 'Ten',
    destinations: [{ platform: 'instagram', accountId: instagram.id }],
    media: media(10),
    scheduledAt
  }, { now });
  assert.equal(ten.media.length, 10);

  const blocked = repositoryFor([instagram]);
  await assert.rejects(() => createScheduledPost(blocked, {
    caption: 'Eleven',
    destinations: [{ platform: 'instagram', accountId: instagram.id }],
    media: media(11),
    scheduledAt
  }, { now }), (error) => error.code === 'VALIDATION_ERROR');
  assert.equal(blocked.records.posts.length, 0);
});

test('other provider media-count contracts remain unchanged when Instagram gains carousel support', async () => {
  for (const provider of ['facebook', 'threads', 'tiktok']) {
    const connected = account(provider);
    const repository = repositoryFor([connected]);
    const destination = { platform: provider, accountId: connected.id };
    if (provider === 'tiktok') destination.options = { privacyLevel: 'SELF_ONLY', consent: true };

    await assert.rejects(() => createScheduledPost(repository, {
      caption: 'Still single-media',
      destinations: [destination],
      media: media(2),
      scheduledAt
    }, { now }), (error) => {
      assert.equal(error.code, 'VALIDATION_ERROR');
      return error.details.some((item) => item.field === 'media');
    });
    assert.equal(repository.records.posts.length, 0);
  }
});
